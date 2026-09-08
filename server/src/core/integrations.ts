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
import { credenzialeNota } from './credenziali.js'
import { conflict } from './errors.js'

export type IntegrazioneKey = 'openai' | 'gmail' | 'shopify' | 'analytics' | 'drive'

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
  /** Eccezioni come Shopify, che accetta credenziali nuove oppure legacy. */
  calcolaMancanti?: () => string[]
  /**
   * Come si attiva, quando la risposta non è «compila una variabile d'ambiente».
   * OpenAI ha questo campo perché la sua chiave si inserisce dall'app: dire a chi legge
   * «manca OPENAI_API_KEY» lo manderebbe a cercare un pannello che non deve più aprire.
   */
  istruzione?: string
}

const DEFINIZIONI: Record<IntegrazioneKey, Definizione> = {
  openai: {
    nome: 'OpenAI',
    scopo: 'lettura di schede tecniche e DDT di rientro, più proposta delle misure (FR-14/FR-28)',
    // Il modello ha un default nel codice, quindi non è una variabile "mancante":
    // qui conta solo la chiave.
    variabili: ['OPENAI_API_KEY'],
    riferimento: 'Impostazioni → Integrazioni, riquadro «Account OpenAI dell\'azienda»',
    // Dal 2026-09-09 la chiave può arrivare da due posti: quella inserita in app (cifrata
    // a database) vince sulla variabile d'ambiente, che resta valida. `credenzialeNota`
    // è la fotografia sincrona: la lettura vera, a database, la fanno le funzioni AI.
    valori: () => [credenzialeNota('openai_api_key')],
    istruzione:
      'la collega la CEO (o un amministratore) da Impostazioni → Integrazioni, incollando la chiave ' +
      'dell\'account OpenAI aziendale: resta cifrata sul server e nessuno in azienda deve avere un account OpenAI proprio.',
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
    // Le app nuove usano Client ID + Client Secret; il token Admin statico resta una
    // compatibilità per le vecchie custom app. Il secret dei webhook si controlla a parte.
    variabili: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'],
    riferimento: 'Integrazioni_Setup.md §3',
    valori: () => [config.shopifyStoreDomain, config.shopifyClientId, config.shopifyClientSecret],
    calcolaMancanti: () => {
      const mancanti: string[] = []
      if (!config.shopifyStoreDomain.trim()) mancanti.push('SHOPIFY_STORE_DOMAIN')
      const credenzialeNuova = config.shopifyClientId.trim() && config.shopifyClientSecret.trim()
      if (!credenzialeNuova && !config.shopifyAdminApiToken.trim()) {
        if (!config.shopifyClientId.trim()) mancanti.push('SHOPIFY_CLIENT_ID')
        if (!config.shopifyClientSecret.trim()) mancanti.push('SHOPIFY_CLIENT_SECRET')
      }
      return mancanti
    },
  },
  drive: {
    nome: 'Google Drive (foto dei capi)',
    scopo: 'leggere le cartelle Drive per collegare tutte le foto di un capo in una volta (FR-16)',
    // Una sola variabile, con due nomi possibili: il service account di Analytics va bene
    // anche per Drive, basta condividergli la cartella.
    variabili: ['GOOGLE_DRIVE_CREDENTIALS_JSON'],
    riferimento: 'Integrazioni_Setup.md §6',
    valori: () => [
      config.googleDriveCredentialsJson ||
        config.googleServiceAccountJson ||
        config.gaCredentialsJson ||
        config.driveCredentialsFile ||
        config.gaCredentialsFile,
    ],
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
  if (def.calcolaMancanti) return def.calcolaMancanti()
  return def.variabili.filter((_, i) => !def.valori()[i]?.trim())
}

export function configurata(chiave: IntegrazioneKey): boolean {
  return mancanti(chiave).length === 0
}

/** Messaggio mostrato in app quando manca la credenziale: dice cosa manca e dove si ottiene. */
export function messaggioNonConfigurata(chiave: IntegrazioneKey): string {
  const def = DEFINIZIONI[chiave]
  if (def.istruzione) return `Integrazione ${def.nome} non ancora attiva (${def.scopo}): ${def.istruzione}`
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
      istruzione: def.istruzione ?? null,
    }
  })
}
