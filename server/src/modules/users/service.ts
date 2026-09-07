// Gestione degli utenti del gestionale (Fase 15.2, 2026-08-12).
//
// Perché esiste. La matrice dei permessi ha quattro ruoli, l'activity log registra chi ha
// fatto cosa e le sessioni sono revocabili dal server — ma fino a ieri non c'era modo di
// creare un utente né di cambiare una password. L'unico account era quello del seed, la cui
// password veniva **riallineata a `SEED_ADMIN_PASSWORD` a ogni deploy**: il valore restava
// in chiaro in una variabile Render, il team non poteva avere account propri se non
// scrivendo a mano sul database, e togliere l'accesso a qualcuno era un'operazione da
// database. Tutto il resto dell'impianto dava per scontato questo modulo.
//
// Due regole che il codice fa rispettare, non solo l'interfaccia:
//   - un utente non si cancella, si disattiva. Le sue azioni restano nell'activity log e nei
//     movimenti di magazzino: cancellarlo significherebbe perdere la firma di quelle righe.
//   - un amministratore non può togliersi da solo l'accesso (né il ruolo, né l'attivazione).
//     È l'unico errore da cui non ci si può riprendere dall'app.
import type { Prisma } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { badRequest, conflict, notFound, unauthorized } from '../../core/errors.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { azzeraTentativi } from '../auth/tentativiLogin.js'
import { logActivity } from '../../core/activityLog.js'

/**
 * Ruoli assegnabili a una persona che entra nel gestionale. `showroom` è escluso di
 * proposito: non è un utente ma lo scope della sub-app rivolta al cliente, che non ha login.
 */
export const RUOLI_INTERNI = ['admin', 'ceo', 'team', 'viewer'] as const
export type RuoloInterno = (typeof RUOLI_INTERNI)[number]

/**
 * Lunghezza minima della password. Dodici caratteri, non otto: è il numero sotto cui una
 * password si indovina in tempi che contano, e l'app non impone né scadenze né caratteri
 * speciali proprio perché la lunghezza è l'unica cosa che sposta davvero l'ago.
 */
export const PASSWORD_MIN = 12

export function validaPassword(password: string): void {
  if (password.length < PASSWORD_MIN) {
    throw badRequest(`La password deve avere almeno ${PASSWORD_MIN} caratteri.`)
  }
}

// Campi che escono dall'API: `passwordHash` non compare mai, nemmeno per l'amministratore.
const CAMPI_PUBBLICI = {
  id: true, nome: true, email: true, role: true, attivo: true, createdAt: true, updatedAt: true,
} satisfies Prisma.UserSelect

export async function listUsers() {
  const utenti = await prisma.user.findMany({
    where: { role: { not: 'showroom' } },
    select: { ...CAMPI_PUBBLICI, _count: { select: { sessions: true } } },
    orderBy: [{ attivo: 'desc' }, { nome: 'asc' }],
  })
  // "Sessioni attive" risponde alla domanda pratica «questa persona è dentro adesso?», che
  // è quella che ci si fa prima di disattivare un account.
  return utenti.map(({ _count, ...utente }) => ({ ...utente, sessioniAttive: _count.sessions }))
}

export async function createUser(
  input: { nome: string; email: string; role: RuoloInterno; password: string },
  autoreId: string,
) {
  validaPassword(input.password)
  const email = input.email.trim().toLowerCase()

  const esistente = await prisma.user.findUnique({ where: { email } })
  if (esistente) throw conflict(`Esiste già un utente con l'indirizzo ${email}.`)

  const passwordHash = await hashPassword(input.password)
  const creato = await prisma.user.create({
    data: { nome: input.nome.trim(), email, role: input.role, passwordHash },
    select: CAMPI_PUBBLICI,
  })
  await logActivity(prisma, {
    userId: autoreId, azione: 'crea_utente', entita: 'user', entitaId: creato.id,
    valoreNuovo: `${creato.nome} <${creato.email}> · ruolo ${creato.role}`,
  })
  return creato
}

export async function updateUser(
  id: string,
  patch: { nome?: string; role?: RuoloInterno; attivo?: boolean },
  autoreId: string,
) {
  const utente = await prisma.user.findUnique({ where: { id } })
  if (!utente || utente.role === 'showroom') throw notFound('Utente non trovato')

  // Nessuno può chiudersi fuori da solo: è l'unico errore che non si può correggere
  // dall'app, perché servirebbe proprio l'accesso che si è appena tolto.
  if (id === autoreId) {
    if (patch.attivo === false) throw badRequest('Non puoi disattivare il tuo stesso account.')
    if (patch.role && patch.role !== utente.role) {
      throw badRequest('Non puoi cambiare il ruolo del tuo stesso account: chiedilo a un altro amministratore.')
    }
  }

  // E l'azienda non può restare senza amministratori attivi: se questo è l'ultimo, non lo
  // si degrada né lo si spegne.
  const perdeAdmin = utente.role === 'admin' && (patch.attivo === false || (patch.role && patch.role !== 'admin'))
  if (perdeAdmin) {
    const altriAdmin = await prisma.user.count({ where: { role: 'admin', attivo: true, id: { not: id } } })
    if (altriAdmin === 0) {
      throw conflict('Questo è l\'ultimo amministratore attivo: nominane un altro prima di modificarlo.')
    }
  }

  const aggiornato = await prisma.$transaction(async (tx) => {
    const risultato = await tx.user.update({
      where: { id },
      data: {
        nome: patch.nome?.trim(),
        role: patch.role,
        attivo: patch.attivo,
      },
      select: CAMPI_PUBBLICI,
    })
    // Disattivare qualcuno deve avere effetto **subito**: senza questo, chi è già dentro
    // resterebbe operativo fino alla scadenza del cookie, cioè fino a quindici giorni.
    // (`findValidSession` controlla comunque `attivo`, ma le sessioni orfane non servono
    // a nessuno e resterebbero a occupare la tabella.)
    if (patch.attivo === false) {
      await tx.session.deleteMany({ where: { userId: id } })
    }
    return risultato
  })

  const cambiamenti = [
    patch.nome !== undefined && patch.nome.trim() !== utente.nome ? `nome «${utente.nome}» → «${aggiornato.nome}»` : null,
    patch.role && patch.role !== utente.role ? `ruolo ${utente.role} → ${aggiornato.role}` : null,
    patch.attivo !== undefined && patch.attivo !== utente.attivo ? (aggiornato.attivo ? 'riattivato' : 'disattivato') : null,
  ].filter(Boolean)

  if (cambiamenti.length) {
    await logActivity(prisma, {
      userId: autoreId, azione: 'modifica_utente', entita: 'user', entitaId: id,
      valorePrecedente: `${utente.nome} · ruolo ${utente.role} · ${utente.attivo ? 'attivo' : 'disattivato'}`,
      valoreNuovo: cambiamenti.join(' · '),
    })
  }
  return aggiornato
}

/**
 * Reimpostazione della password da parte di un amministratore: è la via per chi la
 * dimentica. Tutte le sessioni di quell'utente cadono, comprese quelle di chi si fosse
 * intrufolato — che è metà del motivo per cui si reimposta una password.
 */
export async function resetPassword(id: string, password: string, autoreId: string) {
  validaPassword(password)
  const utente = await prisma.user.findUnique({ where: { id } })
  if (!utente || utente.role === 'showroom') throw notFound('Utente non trovato')

  const passwordHash = await hashPassword(password)
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash } })
    await tx.session.deleteMany({ where: { userId: id } })
  })
  azzeraTentativi(utente.email)

  await logActivity(prisma, {
    userId: autoreId, azione: 'reimposta_password', entita: 'user', entitaId: id,
    valoreNuovo: `password reimpostata per ${utente.email}; sessioni attive terminate`,
  })
  return { ok: true, sessioniTerminate: true }
}

/**
 * Cambio password fatto dalla persona stessa. Richiede quella attuale: senza, chiunque
 * trovasse una sessione aperta su un portatile lasciato acceso potrebbe prendersi l'account.
 *
 * Le altre sessioni cadono, la corrente resta: se cambio la password perché temo che
 * qualcuno la conosca, quel qualcuno deve uscire — ma non devo uscire io.
 */
export async function changeOwnPassword(
  userId: string,
  sessionId: string,
  input: { passwordAttuale: string; passwordNuova: string },
) {
  validaPassword(input.passwordNuova)
  if (input.passwordAttuale === input.passwordNuova) {
    throw badRequest('La nuova password deve essere diversa da quella attuale.')
  }

  const utente = await prisma.user.findUnique({ where: { id: userId } })
  if (!utente || !utente.passwordHash) throw unauthorized()
  const ok = await verifyPassword(input.passwordAttuale, utente.passwordHash)
  if (!ok) throw badRequest('La password attuale non è corretta.')

  const passwordHash = await hashPassword(input.passwordNuova)
  const { count } = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } })
    return tx.session.deleteMany({ where: { userId, id: { not: sessionId } } })
  })
  azzeraTentativi(utente.email)

  await logActivity(prisma, {
    userId, azione: 'cambia_password', entita: 'user', entitaId: userId,
    valoreNuovo: count > 0 ? `password cambiata; ${count} altre sessioni terminate` : 'password cambiata',
  })
  return { ok: true, altreSessioniTerminate: count }
}

// --- Eliminazione di un utente (2026-09-07) ----------------------------------------
//
// Fino a ieri qui c'era una regola sola: «un utente non si cancella, si disattiva».
// Aveva un motivo vero, che resta vero — le firme nell'activity log e nei movimenti di
// magazzino diventano anonime — ma non era una regola, era l'assenza di una scelta: chi
// aveva creato un account per sbaglio, o inserito due volte la stessa persona, non aveva
// modo di rimediare dall'app.
//
// Ora l'eliminazione c'è, e il codice fa rispettare tre cose:
//   1. **Non si elimina il proprio account.** È l'unico errore da cui non ci si riprende.
//   2. **Non si elimina l'ultimo amministratore attivo.** Nemmeno se è qualcun altro:
//      l'azienda resterebbe senza nessuno che possa dare accessi.
//   3. **Se ha una storia, serve dirlo di sì due volte.** Un account senza attività si
//      cancella e basta; uno che ha firmato movimenti e bolle chiede conferma esplicita,
//      con davanti il conto di quante firme diventano anonime.

/** Quante tracce lascerebbe indietro un utente eliminato, e cosa lo impedisce del tutto. */
export async function checkUserDeletion(id: string, autoreId: string) {
  const utente = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          activityLogs: true, inventoryMovements: true, sessions: true, aiSessions: true,
          bolleCreate: true, bolleEmesse: true, bolleChiuse: true, rientriRegistrati: true,
          movimentiLavorazione: true, patternDocuments: true, patternDocumentNotes: true,
          importBatches: true, approvedRequests: true, campioniApprovati: true,
          stockCommitments: true, measurementTemplates: true, allegatiBolla: true,
        },
      },
    },
  })
  if (!utente || utente.role === 'showroom') throw notFound('Utente non trovato')

  const blocchi: string[] = []
  if (id === autoreId) {
    blocchi.push('Non puoi eliminare il tuo stesso account: è l\'unico errore da cui non ci si riprende dall\'app.')
  }
  if (utente.role === 'admin' && utente.attivo) {
    const altriAdmin = await prisma.user.count({ where: { role: 'admin', attivo: true, id: { not: id } } })
    if (altriAdmin === 0) {
      blocchi.push(
        'Questo è l\'ultimo amministratore attivo: nominane un altro prima di eliminarlo, ' +
          'altrimenti nessuno potrà più dare o togliere accessi.',
      )
    }
  }

  const c = utente._count
  const firme = c.activityLogs + c.inventoryMovements + c.movimentiLavorazione + c.rientriRegistrati
  const documenti = c.bolleCreate + c.bolleEmesse + c.bolleChiuse + c.patternDocuments +
    c.patternDocumentNotes + c.allegatiBolla + c.importBatches + c.approvedRequests +
    c.campioniApprovati + c.stockCommitments + c.measurementTemplates

  const avvertenze: string[] = []
  if (firme > 0) {
    avvertenze.push(
      `${firme} ${firme === 1 ? 'operazione firmata' : 'operazioni firmate'} (activity log e movimenti di ` +
        'magazzino) restano registrate ma diventano anonime: si saprà cosa è successo, non più da chi.',
    )
  }
  if (documenti > 0) {
    avvertenze.push(
      `${documenti} fra bolle, documenti, allegati e approvazioni perdono il riferimento all'autore. ` +
        'I documenti non vengono cancellati.',
    )
  }
  if (c.sessions > 0) {
    avvertenze.push(`${c.sessions} ${c.sessions === 1 ? 'sessione aperta viene chiusa' : 'sessioni aperte vengono chiuse'} subito.`)
  }
  if (avvertenze.length === 0) {
    avvertenze.push('Questo account non ha mai firmato nulla: eliminarlo non lascia buchi da nessuna parte.')
  }

  return {
    nome: utente.nome,
    email: utente.email,
    eliminabile: blocchi.length === 0,
    blocchi,
    /** Vero quando l'eliminazione perde delle firme: serve una conferma in più. */
    haStorico: firme + documenti > 0,
    avvertenze,
    conseguenze: { firmeAnonime: firme, documentiSenzaAutore: documenti, sessioniChiuse: c.sessions },
    /** L'alternativa che nella maggior parte dei casi è quella giusta. */
    alternativa: 'Disattivare l\'account lo fa uscire subito e conserva tutte le firme.',
  }
}

export async function deleteUser(id: string, autoreId: string, opts: { confermaStorico?: boolean } = {}) {
  const verifica = await checkUserDeletion(id, autoreId)
  if (!verifica.eliminabile) throw conflict(verifica.blocchi.join(' '))
  if (verifica.haStorico && !opts.confermaStorico) {
    throw conflict(
      `${verifica.nome} ha una storia nel gestionale. ${verifica.avvertenze.join(' ')} ` +
        `${verifica.alternativa} Conferma esplicitamente per eliminare comunque.`,
    )
  }

  await prisma.$transaction(async (tx) => {
    // Il log si scrive prima: dopo la cancellazione l'utente non esiste più, e questa
    // riga è l'unica cosa che dirà che è esistito.
    await logActivity(tx, {
      userId: autoreId, azione: 'elimina_utente', entita: 'user', entitaId: id,
      valorePrecedente: `${verifica.nome} <${verifica.email}>`,
      valoreNuovo: verifica.avvertenze.join(' '),
    })
    await tx.user.delete({ where: { id } })
  })

  return { deleted: true, ...verifica.conseguenze }
}
