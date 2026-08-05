// Backlog "Note" §10-11 — pagina Analytics e widget in dashboard.
//
// I dati arrivano dalla Google Analytics Data API (GA4) e passano SEMPRE da qui: le
// credenziali del service account non devono mai finire nel frontend (requisito esplicito
// della nota). Il client Google si costruisce al primo uso, non all'avvio: senza
// credenziali il resto dell'app deve funzionare come prima — stessa scelta fatta per la
// chiave Claude (config.ts).
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { AppError, badRequest } from '../../core/errors.js'
import { config } from '../../core/config.js'

const NON_CONFIGURATO =
  'Google Analytics non è ancora collegato: mancano GA_PROPERTY_ID e le credenziali del service account ' +
  '(GA_CREDENTIALS_JSON oppure GOOGLE_APPLICATION_CREDENTIALS). Vedi Environment_Setup.'

export function analyticsConfigured(): boolean {
  return Boolean(config.gaPropertyId && (config.gaCredentialsJson || config.gaCredentialsFile))
}

let client: BetaAnalyticsDataClient | null = null

function getClient(): BetaAnalyticsDataClient {
  if (!analyticsConfigured()) throw new AppError(503, NON_CONFIGURATO, 'GA_NOT_CONFIGURED')
  if (!client) {
    if (config.gaCredentialsJson) {
      let parsed: { client_email?: string; private_key?: string }
      try {
        parsed = JSON.parse(config.gaCredentialsJson)
      } catch {
        throw new AppError(503, 'GA_CREDENTIALS_JSON non è un JSON valido: incolla il file del service account su una riga sola.', 'GA_BAD_CREDENTIALS')
      }
      if (!parsed.client_email || !parsed.private_key) {
        throw new AppError(503, 'GA_CREDENTIALS_JSON non contiene client_email e private_key: non è il file del service account.', 'GA_BAD_CREDENTIALS')
      }
      client = new BetaAnalyticsDataClient({
        credentials: {
          client_email: parsed.client_email,
          // Nelle variabili d'ambiente gli a capo della chiave arrivano come "\n" letterali.
          private_key: parsed.private_key.replace(/\\n/g, '\n'),
        },
      })
    } else {
      // GOOGLE_APPLICATION_CREDENTIALS: il percorso lo legge la libreria da sé.
      client = new BetaAnalyticsDataClient()
    }
  }
  return client
}

// --- Intervalli temporali (nota §10: oggi, 7 giorni, 30 giorni, mese corrente, personalizzato) ---

export type RangeId = 'today' | '7d' | '30d' | 'month' | 'custom'

export interface Periodo {
  startDate: string
  endDate: string
}

const ISO = (d: Date) => d.toISOString().slice(0, 10)
const giorniFa = (n: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

/** Periodo richiesto + periodo precedente della stessa durata, per la variazione %. */
export function risolviPeriodo(range: RangeId, from?: string, to?: string): { corrente: Periodo; precedente: Periodo } {
  const oggi = new Date()
  let corrente: Periodo

  switch (range) {
    case 'today':
      corrente = { startDate: ISO(oggi), endDate: ISO(oggi) }
      break
    case '7d':
      corrente = { startDate: ISO(giorniFa(6)), endDate: ISO(oggi) }
      break
    case '30d':
      corrente = { startDate: ISO(giorniFa(29)), endDate: ISO(oggi) }
      break
    case 'month': {
      const primo = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), 1))
      corrente = { startDate: ISO(primo), endDate: ISO(oggi) }
      break
    }
    case 'custom': {
      if (!from || !to) throw badRequest('Intervallo personalizzato: indicare sia la data di inizio sia quella di fine.')
      if (from > to) throw badRequest('La data di inizio è successiva a quella di fine.')
      corrente = { startDate: from, endDate: to }
      break
    }
  }

  // Periodo precedente: stessa durata, subito prima dell'inizio.
  const inizio = new Date(`${corrente.startDate}T00:00:00Z`)
  const fine = new Date(`${corrente.endDate}T00:00:00Z`)
  const durataGiorni = Math.round((fine.getTime() - inizio.getTime()) / 86_400_000) + 1
  const finePrec = new Date(inizio)
  finePrec.setUTCDate(finePrec.getUTCDate() - 1)
  const inizioPrec = new Date(finePrec)
  inizioPrec.setUTCDate(inizioPrec.getUTCDate() - (durataGiorni - 1))

  return { corrente, precedente: { startDate: ISO(inizioPrec), endDate: ISO(finePrec) } }
}

// --- Metriche ---

// Nomi ufficiali GA4 (Data API v1beta). `itemsViewed`/`itemsAddedToCart`/`itemsCheckedOut`
// sono metriche di e-commerce a livello di articolo: sono quelle che la nota chiama
// "visualizzazioni prodotto", "aggiunte al carrello", "avvio checkout".
const METRICHE_TOTALI = [
  'activeUsers', 'sessions', 'newUsers',
  'itemsViewed', 'itemsAddedToCart', 'itemsCheckedOut', 'itemsPurchased',
  'ecommercePurchases', 'purchaseRevenue',
]

export interface TotaliAnalytics {
  utenti: number
  sessioni: number
  nuoviUtenti: number
  visualizzazioniProdotto: number
  aggiunteCarrello: number
  checkoutAvviati: number
  articoliAcquistati: number
  acquisti: number
  ricavi: number
  /** Acquisti / sessioni, in percentuale. Calcolato qui: GA lo espone con definizioni diverse. */
  tassoConversione: number
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function vuoti(): TotaliAnalytics {
  return {
    utenti: 0, sessioni: 0, nuoviUtenti: 0, visualizzazioniProdotto: 0, aggiunteCarrello: 0,
    checkoutAvviati: 0, articoliAcquistati: 0, acquisti: 0, ricavi: 0, tassoConversione: 0,
  }
}

async function totali(periodo: Periodo): Promise<TotaliAnalytics> {
  const [risposta] = await getClient().runReport({
    property: `properties/${config.gaPropertyId}`,
    dateRanges: [periodo],
    metrics: METRICHE_TOTALI.map((name) => ({ name })),
  })

  const riga = risposta.rows?.[0]
  if (!riga?.metricValues) return vuoti()
  const v = riga.metricValues.map((m) => num(m.value))
  const sessioni = v[1]
  const acquisti = v[7]

  return {
    utenti: v[0],
    sessioni,
    nuoviUtenti: v[2],
    visualizzazioniProdotto: v[3],
    aggiunteCarrello: v[4],
    checkoutAvviati: v[5],
    articoliAcquistati: v[6],
    acquisti,
    ricavi: v[8],
    tassoConversione: sessioni > 0 ? (acquisti / sessioni) * 100 : 0,
  }
}

export interface CanaleAcquisizione {
  canale: string
  sessioni: number
  utenti: number
}

async function canali(periodo: Periodo): Promise<CanaleAcquisizione[]> {
  const [risposta] = await getClient().runReport({
    property: `properties/${config.gaPropertyId}`,
    dateRanges: [periodo],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10,
  })
  return (risposta.rows ?? []).map((r) => ({
    canale: r.dimensionValues?.[0]?.value ?? 'Non attribuito',
    sessioni: num(r.metricValues?.[0]?.value),
    utenti: num(r.metricValues?.[1]?.value),
  }))
}

export interface ProdottoAnalytics {
  nome: string
  visualizzazioni: number
  aggiunteCarrello: number
  acquisti: number
}

// Una sola chiamata per i tre elenchi richiesti (più visti / più aggiunti / più acquistati):
// stesse righe, ordinate poi lato server. Meno quota consumata e nessuna incoerenza fra liste.
async function prodotti(periodo: Periodo): Promise<ProdottoAnalytics[]> {
  const [risposta] = await getClient().runReport({
    property: `properties/${config.gaPropertyId}`,
    dateRanges: [periodo],
    dimensions: [{ name: 'itemName' }],
    metrics: [{ name: 'itemsViewed' }, { name: 'itemsAddedToCart' }, { name: 'itemsPurchased' }],
    orderBys: [{ metric: { metricName: 'itemsViewed' }, desc: true }],
    limit: 50,
  })
  return (risposta.rows ?? []).map((r) => ({
    nome: r.dimensionValues?.[0]?.value ?? '(senza nome)',
    visualizzazioni: num(r.metricValues?.[0]?.value),
    aggiunteCarrello: num(r.metricValues?.[1]?.value),
    acquisti: num(r.metricValues?.[2]?.value),
  }))
}

const primi = (righe: ProdottoAnalytics[], chiave: keyof Omit<ProdottoAnalytics, 'nome'>, quanti = 5) =>
  [...righe].filter((r) => r[chiave] > 0).sort((a, b) => b[chiave] - a[chiave]).slice(0, quanti)

export interface AnalyticsSummary {
  periodo: Periodo
  periodoPrecedente: Periodo
  totali: TotaliAnalytics
  totaliPrecedenti: TotaliAnalytics
  canali: CanaleAcquisizione[]
  piuVisti: ProdottoAnalytics[]
  piuAggiunti: ProdottoAnalytics[]
  piuAcquistati: ProdottoAnalytics[]
}

export async function getAnalyticsSummary(range: RangeId, from?: string, to?: string): Promise<AnalyticsSummary> {
  const { corrente, precedente } = risolviPeriodo(range, from, to)
  try {
    const [tot, totPrec, ch, prod] = await Promise.all([
      totali(corrente),
      totali(precedente),
      canali(corrente),
      prodotti(corrente),
    ])
    return {
      periodo: corrente,
      periodoPrecedente: precedente,
      totali: tot,
      totaliPrecedenti: totPrec,
      canali: ch,
      piuVisti: primi(prod, 'visualizzazioni'),
      piuAggiunti: primi(prod, 'aggiunteCarrello'),
      piuAcquistati: primi(prod, 'acquisti'),
    }
  } catch (e) {
    throw traduciErrore(e)
  }
}

export interface AnalyticsWidget {
  /** Ultimi 7 giorni, imbuto essenziale per la dashboard (nota §11). */
  visualizzazioniProdotto: number
  aggiunteCarrello: number
  checkoutAvviati: number
  acquisti: number
  tassoConversione: number
  /** Variazione % delle aggiunte al carrello rispetto ai 7 giorni precedenti; null se prima era 0. */
  variazioneAggiunteCarrello: number | null
}

export async function getAnalyticsWidget(): Promise<AnalyticsWidget> {
  const { corrente, precedente } = risolviPeriodo('7d')
  try {
    const [tot, prec] = await Promise.all([totali(corrente), totali(precedente)])
    return {
      visualizzazioniProdotto: tot.visualizzazioniProdotto,
      aggiunteCarrello: tot.aggiunteCarrello,
      checkoutAvviati: tot.checkoutAvviati,
      acquisti: tot.acquisti,
      tassoConversione: tot.tassoConversione,
      variazioneAggiunteCarrello:
        prec.aggiunteCarrello > 0
          ? ((tot.aggiunteCarrello - prec.aggiunteCarrello) / prec.aggiunteCarrello) * 100
          : null,
    }
  } catch (e) {
    throw traduciErrore(e)
  }
}

// Gli errori della libreria Google sono in inglese e criptici: qui diventano messaggi che
// dicono cosa fare. Stessa scelta già fatta per gli errori dell'SDK Claude.
function traduciErrore(e: unknown): AppError {
  if (e instanceof AppError) return e
  const err = e as { code?: number | string; message?: string }
  const testo = String(err?.message ?? '')

  if (err?.code === 7 || /PERMISSION_DENIED|permission/i.test(testo)) {
    return new AppError(
      502,
      'Google Analytics ha rifiutato la richiesta: il service account non ha accesso alla proprietà. ' +
        'Aggiungilo come utente con ruolo Visualizzatore nella proprietà GA4 e riprova.',
      'GA_FORBIDDEN',
    )
  }
  if (err?.code === 5 || /NOT_FOUND/i.test(testo)) {
    return new AppError(502, `Proprietà GA4 non trovata (GA_PROPERTY_ID = ${config.gaPropertyId}): controlla l'identificativo numerico.`, 'GA_NOT_FOUND')
  }
  if (err?.code === 16 || /UNAUTHENTICATED|invalid_grant/i.test(testo)) {
    return new AppError(502, 'Credenziali Google non valide o scadute: rigenera la chiave del service account.', 'GA_BAD_CREDENTIALS')
  }
  if (err?.code === 8 || /RESOURCE_EXHAUSTED|quota/i.test(testo)) {
    return new AppError(502, 'Quota giornaliera di Google Analytics esaurita: riprova più tardi.', 'GA_RATE_LIMIT')
  }
  return new AppError(502, `Google Analytics non raggiungibile: ${testo || 'errore sconosciuto'}.`, 'GA_UNREACHABLE')
}
