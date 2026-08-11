// Invio email dall'account aziendale — FR-06, DEC-028 (Fase 15.1, punto 2).
//
// Cosa fa e cosa non fa. Manda un messaggio di testo dall'indirizzo Heemia usando
// l'API Gmail (`users.messages.send`), scope **`gmail.send` e basta**: con quello si può
// spedire, non leggere né cancellare la posta dell'azienda. È la differenza fra dare a un
// programma la facoltà di scrivere una lettera e dargli le chiavi della cassetta postale.
//
// Perché OAuth e non SMTP. DEC-028 vuole che l'invio parta dall'app ma resti un gesto
// approvato da una persona, e che l'email finisca in "Posta inviata" dell'account
// aziendale come qualunque altra: con l'API succede da sé. La password per applicazioni
// SMTP resta il piano di riserva se OAuth si rivelasse impraticabile — cambierebbe DEC-028.
//
// ⚠️ La trappola vera di questa integrazione (scritta anche in Integrazioni_Setup §2):
// finché l'app OAuth su Google Cloud resta in stato **Test**, il refresh token **scade
// ogni 7 giorni** e l'invio ricomincia a fallire con `invalid_grant`. Va portata "In
// produzione": la schermata "app non verificata" è attesa e accettabile, perché l'unico
// utente autorizzato è l'account aziendale stesso. L'errore tradotto qui sotto lo dice
// esplicitamente, altrimenti fra una settimana sembrerebbe un guasto nuovo.
import { OAuth2Client } from 'google-auth-library'
import { AppError } from '../../core/errors.js'
import { config } from '../../core/config.js'

const ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

export interface Email {
  /** Destinatario. Un solo indirizzo: le richieste ai fornitori vanno a una persona sola. */
  a: string
  oggetto: string
  /** Corpo in testo semplice. Niente HTML: il testo della bozza è già quello che si legge. */
  testo: string
  /** Dove il fornitore risponde, se diverso dal mittente tecnico. */
  rispondiA?: string
}

let client: OAuth2Client | null = null

function getClient(): OAuth2Client {
  if (!client) {
    client = new OAuth2Client({ clientId: config.googleClientId, clientSecret: config.googleClientSecret })
    client.setCredentials({ refresh_token: config.googleRefreshToken })
  }
  return client
}

/** Solo per i test: la prossima chiamata ricostruisce il client dalle variabili correnti. */
export function reimpostaClientGmail() {
  client = null
}

/**
 * Un indirizzo email plausibile. Non è una validazione RFC completa — quella accetta
 * cose che nessun fornitore userebbe mai — ma basta a non chiamare Google con un campo
 * vuoto o con un nome di persona al posto dell'indirizzo.
 */
export function indirizzoValido(valore: string | null | undefined): boolean {
  return Boolean(valore && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valore.trim()))
}

/**
 * Intestazione MIME con caratteri non ASCII (RFC 2047).
 *
 * Serve davvero: un oggetto come «Richiesta di riassortimento — tessuto Perù» contiene
 * accenti e trattini lunghi, e senza codifica arriverebbe a pezzi nella casella del
 * fornitore. Se il testo è tutto ASCII resta com'è, che è più leggibile nei log.
 */
function codificaIntestazione(testo: string): string {
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(testo)) return testo
  return `=?UTF-8?B?${Buffer.from(testo, 'utf8').toString('base64')}?=`
}

/** Toglie CR e LF da un'intestazione: senza questo, un a capo nell'oggetto inietterebbe altre intestazioni. */
function unaRigaSola(valore: string): string {
  return valore.replace(/[\r\n]+/g, ' ').trim()
}

/** Il messaggio completo in formato RFC 2822, pronto per essere spedito. */
export function componiMime(email: Email, mittente: string): string {
  const intestazioni = [
    `From: ${unaRigaSola(mittente)}`,
    `To: ${unaRigaSola(email.a)}`,
    email.rispondiA ? `Reply-To: ${unaRigaSola(email.rispondiA)}` : null,
    `Subject: ${codificaIntestazione(unaRigaSola(email.oggetto))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    // Il corpo viaggia in base64 invece che in chiaro: così accenti, righe lunghe e
    // caratteri speciali arrivano identici a come sono stati scritti nella bozza.
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean)
  const corpo = Buffer.from(email.testo, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n')
  return `${intestazioni.join('\r\n')}\r\n\r\n${corpo}`
}

/** base64url: l'API Gmail vuole il messaggio in questa variante, non nel base64 classico. */
function base64url(testo: string): string {
  return Buffer.from(testo, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Traduce in italiano gli errori che contano, distinguendo i due casi che in produzione
 * si presentano davvero: la credenziale non è più valida (rifare il refresh token) e il
 * permesso concesso non basta (riautorizzare con lo scope giusto). Tutto il resto resta
 * un errore di servizio, con il messaggio originale in coda per la diagnosi.
 */
function traduciErrore(err: unknown): AppError {
  const e = err as { message?: string; code?: string | number; response?: { status?: number; data?: unknown } }
  const testo = String(e?.message ?? '')
  const stato = e?.response?.status

  if (/invalid_grant/i.test(testo)) {
    return new AppError(
      502,
      "L'autorizzazione Google non è più valida: il refresh token è scaduto o è stato revocato. " +
        "Succede sempre dopo 7 giorni finché l'app OAuth resta in stato «Test» su Google Cloud: " +
        'va portata «In produzione» e va rigenerato il token. Procedura: Integrazioni_Setup.md §2.',
      'GMAIL_BAD_CREDENTIALS',
    )
  }
  if (/invalid_client|unauthorized_client/i.test(testo)) {
    return new AppError(
      502,
      'Google non riconosce le credenziali dell\'applicazione: GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET ' +
        'non corrispondono a un client OAuth valido. Procedura: Integrazioni_Setup.md §2.',
      'GMAIL_BAD_CREDENTIALS',
    )
  }
  if (stato === 401) {
    return new AppError(502, "Google ha rifiutato l'accesso (401): l'autorizzazione va rifatta.", 'GMAIL_BAD_CREDENTIALS')
  }
  if (stato === 403) {
    return new AppError(
      502,
      "Google ha rifiutato l'invio (403). Le due cause tipiche: l'autorizzazione non comprende lo scope " +
        '`gmail.send`, oppure l\'API Gmail non è attiva sul progetto Google Cloud. Integrazioni_Setup.md §2.',
      'GMAIL_SCOPE',
    )
  }
  if (stato === 429 || /rate|quota/i.test(testo)) {
    return new AppError(502, 'Google ha applicato un limite di frequenza: riprova fra qualche minuto.', 'GMAIL_RATE_LIMIT')
  }
  if (e?.code === 'ENOTFOUND' || e?.code === 'ECONNREFUSED' || e?.code === 'ETIMEDOUT' || /fetch failed/i.test(testo)) {
    return new AppError(502, 'Google non è raggiungibile in questo momento: riprova fra poco.', 'GMAIL_UNREACHABLE')
  }
  return new AppError(502, `Invio non riuscito: ${testo || 'errore sconosciuto di Gmail'}.`, 'GMAIL_ERROR')
}

/**
 * Spedisce davvero. Ritorna gli identificativi che Gmail assegna al messaggio: sono la
 * prova che la posta è partita, ed è l'unica cosa che autorizza chi chiama a scrivere
 * "inviata" da qualche parte. Se questa funzione lancia, non è partito niente.
 */
export async function inviaEmail(email: Email): Promise<{ id: string; threadId: string }> {
  if (!indirizzoValido(email.a)) {
    throw new AppError(400, `"${email.a}" non è un indirizzo email valido.`, 'BAD_REQUEST')
  }

  const mittente = config.gmailMittente.trim()
  const raw = base64url(componiMime(email, mittente))

  const risposta = await getClient()
    .request<{ id: string; threadId: string }>({
      url: ENDPOINT,
      method: 'POST',
      data: { raw },
      // Un invio che non risponde entro mezzo minuto è un invio da riprovare a mano:
      // meglio un errore leggibile che una richiesta appesa e un utente che ricarica.
      timeout: 30_000,
    })
    .catch((err) => {
      throw traduciErrore(err)
    })

  return { id: risposta.data.id, threadId: risposta.data.threadId }
}
