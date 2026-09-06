// Freno sui tentativi di accesso falliti, contati **per indirizzo email**.
//
// Perché non basta il limite per IP di @fastify/rate-limit. Su Render le richieste arrivano
// al backend dopo il proxy di bordo e, per il rewrite `/api/*` del sito statico, dopo un
// secondo passaggio: l'indirizzo che il server vede non è quello della persona. Con
// `trustProxy` attivo (app.ts) l'indirizzo torna a essere quello vero, ma diventa un dato
// che arriva dall'esterno in un'intestazione, e chi attacca può cambiarlo a ogni richiesta
// per non farsi contare. L'email di destinazione no: è il bersaglio stesso, non si può
// falsificare senza cambiare bersaglio.
//
// I due freni servono a cose diverse e restano tutti e due:
//   - per IP (10/minuto, auth/routes.ts): argina la pioggia di richieste;
//   - per email (qui): protegge il singolo account, ed è quello che regge davvero.
//
// Il conteggio sta in memoria del processo. Su un servizio a istanza singola — il piano
// Render di oggi — è esatto; con più istanze diventerebbe permissivo (ogni istanza conta le
// sue), e allora andrebbe spostato su database o Redis. È scritto qui perché sia una riga
// sola da cambiare quando succederà.
import { AppError } from '../../core/errors.js'

/** Finestra di osservazione: oltre questo tempo dall'ultimo fallimento si riparte da zero. */
const FINESTRA_MS = 15 * 60 * 1000
/** Tentativi falliti tollerati prima del blocco temporaneo. */
const MAX_FALLIMENTI = 8

type Conteggio = { fallimenti: number; ultimoIl: number }

const conteggi = new Map<string, Conteggio>()

function chiave(email: string): string {
  return email.trim().toLowerCase()
}

/** Toglie le voci scadute: il registro non deve crescere all'infinito su un server acceso da mesi. */
function pulisci(adesso: number) {
  for (const [email, conteggio] of conteggi) {
    if (adesso - conteggio.ultimoIl > FINESTRA_MS) conteggi.delete(email)
  }
}

/**
 * Da chiamare **prima** di verificare la password. Se l'account è momentaneamente bloccato
 * solleva 429 con il tempo di attesa, così il messaggio è comprensibile invece di un
 * generico "credenziali non valide" che farebbe pensare a una password sbagliata.
 */
export function verificaTentativi(email: string): void {
  const adesso = Date.now()
  if (conteggi.size > 500) pulisci(adesso)

  const conteggio = conteggi.get(chiave(email))
  if (!conteggio) return
  if (adesso - conteggio.ultimoIl > FINESTRA_MS) {
    conteggi.delete(chiave(email))
    return
  }
  if (conteggio.fallimenti < MAX_FALLIMENTI) return

  const minuti = Math.max(1, Math.ceil((FINESTRA_MS - (adesso - conteggio.ultimoIl)) / 60000))
  throw new AppError(
    429,
    `Troppi tentativi di accesso per questo indirizzo. Riprova fra ${minuti} ${minuti === 1 ? 'minuto' : 'minuti'}.`,
    'RATE_LIMIT',
  )
}

/** Password sbagliata (o utente inesistente): il tentativo si conta. */
export function registraFallimento(email: string): void {
  const k = chiave(email)
  const adesso = Date.now()
  const precedente = conteggi.get(k)
  const dentroLaFinestra = precedente && adesso - precedente.ultimoIl <= FINESTRA_MS
  conteggi.set(k, { fallimenti: dentroLaFinestra ? precedente.fallimenti + 1 : 1, ultimoIl: adesso })
}

/** Accesso riuscito: il contatore si azzera, altrimenti chi sbaglia due volte e poi entra resterebbe segnato. */
export function azzeraTentativi(email: string): void {
  conteggi.delete(chiave(email))
}

/** Solo per i test: riporta il registro allo stato iniziale. */
export function _svuotaRegistro(): void {
  conteggi.clear()
}
