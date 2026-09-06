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
