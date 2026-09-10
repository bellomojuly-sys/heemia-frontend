// «Password dimenticata»: chi non ricorda la password se la reimposta da solo (DEC-071).
//
// Fino a oggi l'unica strada era l'amministratore (`users/service.ts` → `resetPassword`).
// Funziona finché l'amministratore c'è ed è raggiungibile — ma se a restare fuori è
// l'amministratore stesso non resta nessuno che possa aiutarlo, e in un'azienda di poche
// persone quel caso non è teorico.
//
// Le tre regole che tengono in piedi la cosa:
//
//   1. **Il token vive nel link, non nel database.** A database c'è la sua impronta
//      SHA-256. Un backup finito nel posto sbagliato non contiene niente di riutilizzabile.
//      SHA-256 e non bcrypt: il token è 32 byte casuali, non una password da indovinare —
//      qui serve un confronto rapido, non un hash lento.
//   2. **Un'ora di vita, un solo uso.** Un link dimenticato nella casella di posta smette
//      di funzionare da sé, e usarlo una volta lo consuma.
//   3. **Chiedere non rivela chi esiste.** La risposta è identica per un indirizzo noto e
//      per uno sconosciuto: altrimenti questo modulo diventerebbe un elenco degli account
//      dell'azienda, a disposizione di chiunque.
//
// Cosa succede quando Gmail non è ancora collegato: la richiesta viene **rifiutata con un
// messaggio esplicito**, non accettata in silenzio. È la lezione già pagata una volta in
// questo progetto (l'invio ai fornitori marcava la richiesta come «inviata» senza spedire
// nulla): una funzione che finge di aver fatto qualcosa è peggio di una che dice di no.
import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '../../core/prisma.js'
import { badRequest, conflict } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import { config } from '../../core/config.js'
import { configurata, messaggioNonConfigurata } from '../../core/integrations.js'
import { inviaEmail } from '../gmail/service.js'
import { hashPassword } from './password.js'
import { azzeraTentativi } from './tentativiLogin.js'
import { validaPassword } from '../users/service.js'

/** Quanto vive un link. Un'ora: il tempo di aprire la posta, non di dimenticarsene. */
const DURATA_MINUTI = 60

/**
 * Quanto si aspetta prima di poter chiedere un secondo link. Senza, chi conosce l'indirizzo
 * di una collega potrebbe riempirle la casella premendo un pulsante.
 */
const ATTESA_TRA_RICHIESTE_MINUTI = 2

/** Risposta volutamente identica in ogni caso: vedi la regola 3 in cima al file. */
const RISPOSTA_GENERICA = {
  ok: true,
  messaggio:
    'Se l\'indirizzo corrisponde a un account attivo, fra poco arriva un\'email con il link per ' +
    'reimpostare la password. Il link vale un\'ora e si può usare una volta sola. ' +
    'Controlla anche la posta indesiderata.',
} as const

export type EsitoRichiesta = typeof RISPOSTA_GENERICA

/**
 * L'impronta con cui il token viene conservato. Esportata perché le prove automatiche
 * devono poter scrivere una richiesta in sospeso senza passare da Gmail: è l'unico modo
 * di verificare scadenza, consumo e revoca delle sessioni finché le credenziali non ci sono.
 */
export const improntaToken = (token: string) => createHash('sha256').update(token).digest('hex')

const impronta = improntaToken

/** Il testo che arriva nella casella. Niente HTML: si legge uguale ovunque. */
function corpoEmail(nome: string, link: string): string {
  return [
    `Ciao ${nome},`,
    '',
    'hai chiesto di reimpostare la password del gestionale Heemia. Apri questo link:',
    '',
    link,
    '',
    `Il link vale ${DURATA_MINUTI} minuti e funziona una volta sola.`,
    '',
    'Se non sei stato tu, non devi fare niente: la password attuale resta valida e nessuno ',
    'può cambiarla senza aprire questo link. Se però ricevi più email di queste senza averle ',
    'chieste, dillo a chi amministra l\'app.',
  ].join('\n')
}

/**
 * Primo passo: qualcuno dice «ho dimenticato la password» e lascia il suo indirizzo.
 *
 * L'ordine dei controlli conta. Lo stato di Gmail si guarda **prima** di cercare l'utente,
 * così il messaggio «non è ancora attiva» non dipende dall'esistenza dell'indirizzo e non
 * diventa un modo per scoprire chi ha un account.
 */
export async function richiediReimpostazione(email: string): Promise<EsitoRichiesta> {
  if (!configurata('gmail')) {
    throw conflict(
      `${messaggioNonConfigurata('gmail')} Finché non è attiva, la password la reimposta un ` +
        'amministratore da Impostazioni → Utenti e accessi.',
    )
  }

  const indirizzo = email.trim().toLowerCase()
  const utente = await prisma.user.findUnique({ where: { email: indirizzo } })

  // Sconosciuto, disattivato o senza password (gli account showroom non ne hanno):
  // stessa risposta di sempre, e nessuna email parte.
  if (!utente || !utente.attivo || utente.role === 'showroom') return RISPOSTA_GENERICA

  const adesso = new Date()
  const recente = await prisma.passwordResetToken.findFirst({
    where: {
      userId: utente.id,
      usatoIl: null,
      scadeIl: { gt: adesso },
      createdAt: { gt: new Date(adesso.getTime() - ATTESA_TRA_RICHIESTE_MINUTI * 60_000) },
    },
  })
  // Un link valido è già in viaggio: non se ne manda un secondo, ma chi ha chiesto legge
  // la stessa frase di prima — non deve dedurre niente da una differenza di risposta.
  if (recente) return RISPOSTA_GENERICA

  const token = randomBytes(32).toString('base64url')
  await prisma.passwordResetToken.create({
    data: {
      userId: utente.id,
      tokenHash: impronta(token),
      scadeIl: new Date(adesso.getTime() + DURATA_MINUTI * 60_000),
    },
  })

  const link = `${config.appUrl}/reimposta-password?token=${encodeURIComponent(token)}`
  // Se l'invio fallisce l'errore esce: chi ha chiesto deve sapere che l'email non arriverà,
  // invece di aspettare davanti a una casella vuota. `inviaEmail` traduce già i guasti di
  // Gmail in messaggi leggibili, compreso il refresh token scaduto dopo sette giorni.
  await inviaEmail({
    a: utente.email,
    oggetto: 'Heemia — reimposta la tua password',
    testo: corpoEmail(utente.nome, link),
  })

  await logActivity(prisma, {
    userId: utente.id,
    azione: 'richiesta_reimposta_password',
    entita: 'user',
    entitaId: utente.id,
    valoreNuovo: `link di reimpostazione inviato a ${utente.email}, valido ${DURATA_MINUTI} minuti`,
  })

  return RISPOSTA_GENERICA
}

/** Il token, verificato. Restituito solo internamente: fuori non esce mai l'id dell'utente. */
async function tokenValido(token: string) {
  const riga = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: impronta(token.trim()) },
    include: { user: true },
  })
  if (!riga || riga.usatoIl || riga.scadeIl <= new Date()) return null
  if (!riga.user.attivo || riga.user.role === 'showroom') return null
  return riga
}

/**
 * Serve alla pagina di reimpostazione per decidere cosa mostrare: il modulo, oppure la
 * spiegazione che il link è scaduto. Senza, si scoprirebbe che il link non vale più solo
 * dopo aver scelto e digitato due volte una password nuova.
 */
export async function statoToken(token: string): Promise<{ valido: boolean }> {
  return { valido: Boolean(await tokenValido(token)) }
}

/**
 * Secondo passo: il link è stato aperto e si sceglie la password nuova.
 *
 * Tutte le sessioni cadono, non solo le altre: qui non c'è una sessione «mia» da salvare,
 * e se la password è stata reimpostata perché qualcuno era entrato, quel qualcuno deve
 * uscire. Il token si consuma nella stessa transazione della scrittura: se qualcosa va
 * storto a metà, non resta né una password cambiata con un link ancora vivo né il contrario.
 */
export async function reimpostaConToken(token: string, passwordNuova: string) {
  validaPassword(passwordNuova)

  const riga = await tokenValido(token)
  if (!riga) {
    throw badRequest(
      'Il link non è più valido: vale un\'ora e una volta sola. Chiedine un altro dalla ' +
        'schermata di accesso.',
    )
  }

  const passwordHash = await hashPassword(passwordNuova)
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: riga.userId }, data: { passwordHash } })
    await tx.session.deleteMany({ where: { userId: riga.userId } })
    await tx.passwordResetToken.update({ where: { id: riga.id }, data: { usatoIl: new Date() } })
    // Le eventuali altre richieste in sospeso muoiono con questa: dopo aver cambiato
    // password, nessun link precedente deve poterla cambiare di nuovo.
    await tx.passwordResetToken.deleteMany({ where: { userId: riga.userId, usatoIl: null } })
  })
  azzeraTentativi(riga.user.email)

  await logActivity(prisma, {
    userId: riga.userId,
    azione: 'reimposta_password',
    entita: 'user',
    entitaId: riga.userId,
    valoreNuovo: 'password reimpostata dalla persona con link via email; sessioni attive terminate',
  })

  return { ok: true, sessioniTerminate: true }
}
