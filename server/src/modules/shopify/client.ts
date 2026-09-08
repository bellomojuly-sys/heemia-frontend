// Client verso la GraphQL Admin API di Shopify (FR-17, API_Mapping §B1).
//
// Perché GraphQL e non REST: la REST Admin API è **legacy** dal 1° ottobre 2024 e le nuove
// integrazioni si costruiscono solo con GraphQL. La versione sta nell'URL ed è una variabile
// d'ambiente (`SHOPIFY_API_VERSION`, oggi 2026-04): Shopify ne pubblica una a trimestre e le
// supporta ~12 mesi, quindi va alzata due volte l'anno — deve essere una riga nel pannello
// Render, non una modifica al codice.
//
// Le quattro cose che questo file esiste per fare (promemoria della review di sicurezza del
// 2026-07-29, punto 7, riportato in API_Mapping §B1): **timeout** su ogni chiamata, **retry
// con backoff** solo dove ha senso, **nessun retry sugli errori applicativi**, e messaggi
// che dicono cosa è successo invece di un 500 muto.
import { AppError } from '../../core/errors.js'
import { config } from '../../core/config.js'
import { richiediConfigurata } from '../../core/integrations.js'

/** Oltre questo tempo una chiamata è persa: meglio un errore leggibile di una richiesta appesa. */
const TIMEOUT_MS = 20_000
/** Tentativi totali, primo incluso. Quattro coprono un rate limit passeggero senza far aspettare troppo. */
const TENTATIVI = 4

type Risposta<T> = {
  data?: T
  errors?: { message: string; extensions?: { code?: string } }[]
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; maximumAvailable: number } } }
}

type RispostaToken = {
  access_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

const MARGINE_SCADENZA_TOKEN_MS = 5 * 60 * 1000
let tokenInCache: { valore: string; scadeAlle: number } | null = null
let richiestaTokenInCorso: Promise<string> | null = null

function endpoint(): string {
  return `https://${config.shopifyStoreDomain}/admin/api/${config.shopifyApiVersion}/graphql.json`
}

function endpointToken(): string {
  return `https://${config.shopifyStoreDomain}/admin/oauth/access_token`
}

function erroreToken(stato: number, payload: RispostaToken | null): AppError {
  const dettaglio = payload?.error_description || payload?.error || `HTTP ${stato}`
  if (stato === 400 || stato === 401 || stato === 403) {
    return new AppError(
      502,
      'Shopify non ha accettato Client ID e Client Secret. Controlla le credenziali del Dev Dashboard, ' +
        `che l'app sia installata sul negozio e che il negozio appartenga alla stessa organizzazione (${dettaglio}).`,
      'SHOPIFY_BAD_CREDENTIALS',
    )
  }
  return new AppError(502, `Shopify non ha rilasciato il token di accesso (${dettaglio}).`, 'SHOPIFY_TOKEN_ERROR')
}

async function richiediNuovoToken(): Promise<string> {
  let risposta: Response
  try {
    risposta = await fetch(endpointToken(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.shopifyClientId,
        client_secret: config.shopifyClientSecret,
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw erroreDiRete(err)
  }

  const payload = (await risposta.json().catch(() => null)) as RispostaToken | null
  if (!risposta.ok) throw erroreToken(risposta.status, payload)
  if (!payload?.access_token) {
    throw new AppError(502, 'Shopify ha risposto senza un token di accesso.', 'SHOPIFY_TOKEN_ERROR')
  }

  const durataSecondi = Number.isFinite(payload.expires_in) ? Number(payload.expires_in) : 86_399
  tokenInCache = {
    valore: payload.access_token,
    scadeAlle: Date.now() + Math.max(0, durataSecondi * 1000 - MARGINE_SCADENZA_TOKEN_MS),
  }
  return payload.access_token
}

async function tokenAccesso(): Promise<string> {
  // Compatibilità con le vecchie custom app che espongono ancora un token statico.
  if (config.shopifyAdminApiToken.trim()) return config.shopifyAdminApiToken
  if (tokenInCache && tokenInCache.scadeAlle > Date.now()) return tokenInCache.valore

  if (!richiestaTokenInCorso) {
    richiestaTokenInCorso = richiediNuovoToken().finally(() => {
      richiestaTokenInCorso = null
    })
  }
  return richiestaTokenInCorso
}

/** Esportata solo per rendere isolate e deterministiche le prove del rinnovo token. */
export function azzeraTokenShopifyPerTest(): void {
  tokenInCache = null
  richiestaTokenInCorso = null
}

function attesa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Quanto aspettare prima del tentativo successivo. Backoff esponenziale (0,5s → 1s → 2s);
 * se Shopify manda `Retry-After` si rispetta quello, perché è la sola indicazione che tiene
 * conto del credito residuo a punti.
 */
function ritardo(tentativo: number, retryAfter: string | null): number {
  const suggerito = retryAfter ? Number(retryAfter) * 1000 : NaN
  if (Number.isFinite(suggerito) && suggerito > 0) return Math.min(suggerito, 10_000)
  return 500 * 2 ** (tentativo - 1)
}

function erroreDiRete(err: unknown): AppError {
  const messaggio = err instanceof Error ? err.message : 'errore sconosciuto'
  if (/abort|timeout/i.test(messaggio)) {
    return new AppError(502, `Shopify non ha risposto entro ${TIMEOUT_MS / 1000} secondi: riprova fra poco.`, 'SHOPIFY_TIMEOUT')
  }
  return new AppError(502, `Shopify non è raggiungibile in questo momento (${messaggio}).`, 'SHOPIFY_UNREACHABLE')
}

function traduciStato(stato: number, corpo: string): AppError {
  if (stato === 401 || stato === 403) {
    return new AppError(
      502,
      'Shopify ha rifiutato l\'accesso (' + stato + '). Le cause tipiche sono credenziali non valide, app non ' +
        'installata oppure scope mancanti (read_products, write_products, read_orders, read_inventory, ' +
        'write_inventory, read_locations). Procedura: Integrazioni_Setup.md §3.',
      'SHOPIFY_BAD_TOKEN',
    )
  }
  if (stato === 404) {
    return new AppError(
      502,
      `Shopify non trova il negozio "${config.shopifyStoreDomain}" con la versione API ${config.shopifyApiVersion}. ` +
        'Controlla SHOPIFY_STORE_DOMAIN (forma "nome-negozio.myshopify.com") e SHOPIFY_API_VERSION.',
      'SHOPIFY_NOT_FOUND',
    )
  }
  return new AppError(502, `Shopify ha risposto ${stato}: ${corpo.slice(0, 300)}`, 'SHOPIFY_ERROR')
}

/**
 * Esegue una query o una mutation. Rilancia solo errori tradotti: chi chiama non deve mai
 * vedere un errore grezzo di rete.
 *
 * Cosa si ritenta e cosa no. Si ritenta su **429** (limite di frequenza), sui **5xx** e sugli
 * errori di rete: sono condizioni passeggere, e riprovare è la cosa giusta. **Non** si ritenta
 * su 4xx applicativi — un token sbagliato o una query malformata non migliorano riprovando,
 * e insistere significherebbe solo trasformare un errore in quattro.
 */
export async function shopifyGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  richiediConfigurata('shopify')

  let ultimo: AppError | null = null
  let tokenRinnovatoDopo401 = false

  for (let tentativo = 1; tentativo <= TENTATIVI; tentativo += 1) {
    // L'errore di autenticazione del token è già tradotto e non è un errore di rete:
    // deve uscire subito, senza essere trasformato e ritentato quattro volte.
    const accessToken = await tokenAccesso()
    let risposta: Response
    try {
      risposta = await fetch(endpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      ultimo = erroreDiRete(err)
      if (tentativo === TENTATIVI) throw ultimo
      await attesa(ritardo(tentativo, null))
      continue
    }

    // Un token ottenuto con Client Credentials dura 24 ore. Se Shopify lo revoca prima
    // del previsto, lo si rinnova una sola volta; un secondo 401 è un errore reale.
    if (risposta.status === 401 && !config.shopifyAdminApiToken.trim() && !tokenRinnovatoDopo401) {
      azzeraTokenShopifyPerTest()
      tokenRinnovatoDopo401 = true
      continue
    }

    if (risposta.status === 429 || risposta.status >= 500) {
      ultimo = traduciStato(risposta.status, await risposta.text().catch(() => ''))
      if (tentativo === TENTATIVI) throw ultimo
      await attesa(ritardo(tentativo, risposta.headers.get('retry-after')))
      continue
    }

    if (!risposta.ok) {
      // 4xx applicativo: non si ritenta.
      throw traduciStato(risposta.status, await risposta.text().catch(() => ''))
    }

    const payload = (await risposta.json().catch(() => null)) as Risposta<T> | null
    if (!payload) throw new AppError(502, 'Shopify ha risposto con un corpo che non è JSON.', 'SHOPIFY_ERROR')

    if (payload.errors?.length) {
      // `THROTTLED` arriva con HTTP 200 e corpo GraphQL: è comunque un limite di frequenza,
      // quindi rientra fra le cose che vale la pena riprovare.
      const throttled = payload.errors.some((e) => e.extensions?.code === 'THROTTLED')
      const messaggi = payload.errors.map((e) => e.message).join('; ')
      ultimo = throttled
        ? new AppError(502, 'Shopify ha applicato un limite di frequenza: riprovo.', 'SHOPIFY_RATE_LIMIT')
        : new AppError(502, `Shopify ha rifiutato la richiesta: ${messaggi}`, 'SHOPIFY_ERROR')
      if (!throttled) throw ultimo
      if (tentativo === TENTATIVI) throw ultimo
      await attesa(ritardo(tentativo, null))
      continue
    }

    if (!payload.data) throw new AppError(502, 'Shopify ha risposto senza dati.', 'SHOPIFY_ERROR')
    return payload.data
  }

  throw ultimo ?? new AppError(502, 'Chiamata a Shopify non riuscita.', 'SHOPIFY_ERROR')
}

/**
 * Gli `userErrors` delle mutation GraphQL: Shopify li restituisce con HTTP 200 e `errors`
 * vuoto, quindi senza questo controllo una scrittura rifiutata passerebbe per riuscita —
 * che è esattamente il modo in cui un'integrazione comincia a mentire.
 */
export function verificaUserErrors(dove: string, errori?: { field?: string[] | null; message: string }[]) {
  if (!errori?.length) return
  const dettaglio = errori.map((e) => `${e.field?.join('.') ?? ''} ${e.message}`.trim()).join('; ')
  throw new AppError(502, `Shopify ha rifiutato ${dove}: ${dettaglio}`, 'SHOPIFY_REJECTED')
}
