// Fase 15.1 — stato delle integrazioni esterne in un posto solo.
//
// Perché esiste: prima ogni modulo decideva per conto suo se una credenziale c'era
// (`process.env.X && process.env.Y` sparso fra integrations/routes.ts, suppliers/service.ts
// e analytics), con messaggi d'errore diversi per lo stesso problema. Qui vivono elenco
// delle variabili, messaggi e controlli: un'integrazione si accende aggiungendo le
// variabili in `server/.env` (in locale) o nelle Environment del servizio su Render,
// senza toccare il codice in più punti.
//
// Regola di fase (DEC-039): una credenziale presente NON significa funzione pronta.
// Le due cose sono distinte apposta — `configurata()` guarda le credenziali,
// `daImplementare()` serve a chi ha le credenziali ma non ha ancora scritto il codice
// che le usa, così nessuna funzione può fingere di aver fatto qualcosa (vedi l'invio
// email ai fornitori, che marcava la richiesta come "inviata" senza spedire nulla).
import { config } from './config.js'
import { conflict } from './errors.js'

export type IntegrazioneKey = 'openai' | 'gmail' | 'shopify' | 'analytics' | 'fatture-sdi' | 'drive'

type Definizione = {
  /** Nome leggibile, usato nei messaggi mostrati in app. */
  nome: string
  /** Cosa smette di funzionare finché la credenziale manca. */
  scopo: string
  /** Variabili d'ambiente attese, nell'ordine in cui vanno compilate. */
  variabili: string[]
  /** Documento di riferimento per ottenerla. */
  riferimento: string
  /** Valori letti davvero (stessa lunghezza di `variabili`): vuoto = mancante. */
  valori: () => string[]
}

const DEFINIZIONI: Record<IntegrazioneKey, Definizione> = {
  openai: {
    nome: 'OpenAI',
    scopo: 'lettura del PDF della scheda tecnica e proposta delle misure (FR-14/FR-28)',
    // Il modello ha un default nel codice, quindi non è una variabile "mancante":
    // qui conta solo la chiave.
    variabili: ['OPENAI_API_KEY'],
    riferimento: 'Integrazioni_Setup.md §1',
    valori: () => [config.openaiApiKey],
  },
  gmail: {
    nome: 'Gmail',
    scopo: 'invio delle richieste ai fornitori dall\'app (FR-06, DEC-028)',
    variabili: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GMAIL_MITTENTE'],
    riferimento: 'Integrazioni_Setup.md §2',
    valori: () => [
      config.googleClientId,
      config.googleClientSecret,
      config.googleRefreshToken,
      config.gmailMittente,
    ],
  },
  shopify: {
    nome: 'Shopify',
    scopo: 'sincronizzazione di prodotti e giacenze con il negozio online (FR-17)',
    // Il secret dei webhook non serve alle chiamate in uscita: si controlla a parte,
    // quando i webhook verranno accesi (verificaWebhookShopify).
    variabili: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ADMIN_API_TOKEN'],
    riferimento: 'Integrazioni_Setup.md §3',
    valori: () => [config.shopifyStoreDomain, config.shopifyAdminApiToken],
  },
  'fatture-sdi': {
    nome: 'Fatture elettroniche (provider SDI)',
    scopo: "arrivo automatico delle fatture dei fornitori, senza scaricarle dall'area riservata (FR-19/20)",
    variabili: ['SDI_PROVIDER', 'SDI_API_KEY', 'SDI_WEBHOOK_SECRET'],
    riferimento: 'Integrazioni_Setup.md §5',
    valori: () => [config.sdiProvider, config.sdiApiKey, config.sdiWebhookSecret],
  },
  drive: {
    nome: 'Google Drive (foto dei capi)',
    scopo: 'leggere le cartelle Drive per collegare tutte le foto di un capo in una volta (FR-16)',
    // Una sola variabile, con due nomi possibili: il service account di Analytics va bene
    // anche per Drive, basta condividergli la cartella.
    variabili: ['GOOGLE_SERVICE_ACCOUNT_JSON'],
    riferimento: 'Integrazioni_Setup.md §6',
    valori: () => [config.googleServiceAccountJson || config.gaCredentialsJson || config.gaCredentialsFile],
  },
  analytics: {
    nome: 'Google Analytics 4',
    scopo: 'pagina Analytics e riquadro visite in dashboard',
    variabili: ['GA_PROPERTY_ID', 'GA_CREDENTIALS_JSON'],
    riferimento: 'Integrazioni_Setup.md §4',
    // Le credenziali valgono anche come percorso file (GOOGLE_APPLICATION_CREDENTIALS),
    // che la libreria Google legge da sé: se c'è quello, la seconda variabile è coperta.
    valori: () => [config.gaPropertyId, config.gaCredentialsJson || config.gaCredentialsFile],
  },
}

/** Variabili d'ambiente ancora da compilare per questa integrazione. */
export function mancanti(chiave: IntegrazioneKey): string[] {
  const def = DEFINIZIONI[chiave]
  return def.variabili.filter((_, i) => !def.valori()[i]?.trim())
}

export function configurata(chiave: IntegrazioneKey): boolean {
  return mancanti(chiave).length === 0
}

/** Messaggio mostrato in app quando manca la credenziale: dice cosa manca e dove si ottiene. */
export function messaggioNonConfigurata(chiave: IntegrazioneKey): string {
  const def = DEFINIZIONI[chiave]
  return (
    `Integrazione ${def.nome} non ancora attiva (${def.scopo}): ` +
    `manca ${mancanti(chiave).join(', ')}. Come ottenerla: ${def.riferimento}.`
  )
}

/** Blocca la richiesta con 409 se la credenziale non c'è. Da chiamare all'inizio dell'azione. */
export function richiediConfigurata(chiave: IntegrazioneKey): void {
  if (!configurata(chiave)) throw conflict(messaggioNonConfigurata(chiave))
}

/**
 * Funzione prevista ma non ancora scritta. Serve a non far passare per fatta un'azione
 * che nessuno esegue: si usa DOPO `richiediConfigurata`, così il messaggio distingue
 * «manca la chiave» da «la chiave c'è ma il codice non c'è ancora».
 */
export function daImplementare(cosa: string, riferimento: string): never {
  throw conflict(`${cosa}: non ancora implementato (${riferimento}). Nessuna operazione è stata eseguita.`)
}

/** Quadro completo per la diagnosi: nessun valore di credenziale, solo presenza/assenza. */
export function statoIntegrazioni() {
  return (Object.keys(DEFINIZIONI) as IntegrazioneKey[]).map((chiave) => {
    const def = DEFINIZIONI[chiave]
    return {
      chiave,
      nome: def.nome,
      scopo: def.scopo,
      configurato: configurata(chiave),
      variabiliMancanti: mancanti(chiave),
      riferimento: def.riferimento,
    }
  })
}
