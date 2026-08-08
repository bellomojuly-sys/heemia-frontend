// Configurazione centralizzata. Nessun valore di default sensibile: i secrets arrivano
// solo da variabili d'ambiente (Environment_Setup.md, DEC-005).
function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variabile d'ambiente mancante: ${name}. Vedi server/.env.example`)
  return v
}

/**
 * Segreto di firma: deve essere lungo e casuale (Fase 15).
 * Il server si RIFIUTA di partire con un segreto corto invece di accettarlo in silenzio:
 * un valore debole rende falsificabili i cookie firmati, e un errore all'avvio si nota
 * subito, mentre una sessione falsificabile no. 32 caratteri = i 24 byte di
 * `openssl rand -base64 24`, il comando indicato in Environment_Setup.
 */
function segreto(name: string): string {
  const v = required(name)
  if (v.length < 32) {
    throw new Error(
      `${name} troppo corto (${v.length} caratteri, minimo 32). ` +
        'Generane uno con: openssl rand -base64 32',
    )
  }
  return v
}

// Render inietta gli host senza schema (es. "heemia-app.onrender.com"). Il confronto CORS
// avviene sull'origin completo, quindi qui lo normalizziamo: senza https:// nessuna
// richiesta del frontend passerebbe.
function conSchema(v: string): string {
  const t = v.trim().replace(/\/$/, '')
  if (!t) return t
  return /^https?:\/\//.test(t) ? t : `https://${t}`
}

/**
 * Durata della sessione, in ore.
 *
 * Si rifiuta di partire se il valore c'è ma non è un numero positivo. Il motivo è che un
 * valore storto qui non si nota: `Number('')` fa 0 e `Number('quindici')` fa NaN, la
 * sessione nasce già scaduta e **tutti restano fuori dall'app** con "sessione scaduta"
 * subito dopo un login riuscito — con le credenziali giuste. Un errore all'avvio invece
 * blocca il deploy e lascia online la versione precedente, che funziona.
 *
 * Nota: `??` da solo non basterebbe, perché una variabile d'ambiente impostata a stringa
 * vuota non è né null né undefined e passerebbe indisturbata.
 */
function durataSessione(): number {
  const raw = process.env.SESSION_TTL_HOURS?.trim()
  if (!raw) return 360
  const ore = Number(raw)
  if (!Number.isFinite(ore) || ore <= 0) {
    throw new Error(`SESSION_TTL_HOURS non valido ("${raw}"): serve un numero di ore maggiore di zero.`)
  }
  return ore
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: segreto('SESSION_SECRET'),
  appBaseUrl: conSchema(process.env.APP_BASE_URL ?? 'http://localhost:3001'),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map(conSchema).filter(Boolean),
  // 360 ore = 15 giorni (scelta di Giulia, 2026-08-06). La sessione NON si rinnova con
  // l'uso: la scadenza è fissata al login, quindi ogni 15 giorni si rientra con le
  // credenziali. Resta revocabile dal server (le sessioni stanno a database).
  sessionTtlHours: durataSessione(),
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
  // Chiave OpenAI per la scansione AI delle schede tecniche (FR-14/FR-28), fornitore
  // scelto in DEC-050 perché l'azienda usa già ChatGPT. Volutamente NON obbligatoria:
  // senza chiave il server parte lo stesso e solo l'endpoint /ai/* risponde con un
  // errore chiaro, invece di bloccare tutta l'app.
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  // Il modello è una variabile e non una costante nel codice: OpenAI ne pubblica di
  // nuovi spesso, e cambiarlo (o tornare indietro se un aggiornamento peggiora le
  // estrazioni) deve essere una riga in Render, non una modifica da ricompilare.
  // Default: il modello intermedio, il rapporto qualità/prezzo giusto per leggere un PDF.
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-5.6-terra',
  // Google Analytics 4 (backlog "note" §10-11). Come la chiave OpenAI: NON obbligatorie.
  // Senza credenziali il server parte lo stesso e solo /analytics/* risponde che manca la
  // configurazione. `gaCredentialsJson` è il JSON del service account su una riga; in
  // alternativa vale GOOGLE_APPLICATION_CREDENTIALS (percorso del file), che la libreria
  // Google legge da sé. Le credenziali non escono mai dal server.
  gaPropertyId: (process.env.GA_PROPERTY_ID ?? '').replace(/^properties\//, ''),
  gaCredentialsJson: process.env.GA_CREDENTIALS_JSON ?? '',
  gaCredentialsFile: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
  // --- Gmail: invio delle richieste ai fornitori (FR-06, DEC-028) ---
  // Stessa regola delle altre integrazioni: NON obbligatorie, il server parte comunque e
  // solo l'invio email risponde spiegando cosa manca. Il refresh token appartiene
  // all'account aziendale che autorizza una volta sola lo scope `gmail.send`: il server
  // lo scambia con un access token a ogni invio, quindi nessun login interattivo.
  // `gmailMittente` è l'indirizzo da cui parte la posta, e deve essere quello che ha
  // dato l'autorizzazione (Gmail rifiuta un mittente diverso).
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN ?? '',
  gmailMittente: process.env.GMAIL_MITTENTE ?? '',
  // --- Shopify: sincronizzazione prodotti e giacenze (FR-17, DEC-009/DEC-027) ---
  // Il dominio si scrive come "nome-negozio.myshopify.com": qui togliamo schema e barra
  // finale, così incollarlo dalla barra del browser non rompe le chiamate.
  // La versione API è fissata (Shopify ne pubblica una nuova ogni trimestre e quelle
  // vecchie scadono): resta una variabile per poterla alzare senza toccare il codice.
  shopifyStoreDomain: (process.env.SHOPIFY_STORE_DOMAIN ?? '').trim().replace(/^https?:\/\//, '').replace(/\/$/, ''),
  shopifyAdminApiToken: process.env.SHOPIFY_ADMIN_API_TOKEN ?? '',
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION ?? '2026-04',
  // Firma dei webhook: senza, un webhook in arrivo non è distinguibile da una richiesta
  // qualunque. Si controlla quando i webhook verranno accesi, non all'avvio.
  shopifyWebhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET ?? '',
}
