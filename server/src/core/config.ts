// Configurazione centralizzata. Nessun valore di default sensibile: i secrets arrivano
// solo da variabili d'ambiente (Environment_Setup.md, DEC-005).
function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variabile d'ambiente mancante: ${name}. Vedi server/.env.example`)
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

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
  appBaseUrl: conSchema(process.env.APP_BASE_URL ?? 'http://localhost:3001'),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map(conSchema).filter(Boolean),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
  // Chiave Claude API per la scansione AI delle schede tecniche (FR-14/FR-28).
  // Volutamente NON obbligatoria: senza chiave il server parte lo stesso e solo
  // l'endpoint /ai/* risponde con un errore chiaro, invece di bloccare tutta l'app.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Google Analytics 4 (backlog "note" §10-11). Come la chiave Claude: NON obbligatorie.
  // Senza credenziali il server parte lo stesso e solo /analytics/* risponde che manca la
  // configurazione. `gaCredentialsJson` è il JSON del service account su una riga; in
  // alternativa vale GOOGLE_APPLICATION_CREDENTIALS (percorso del file), che la libreria
  // Google legge da sé. Le credenziali non escono mai dal server.
  gaPropertyId: (process.env.GA_PROPERTY_ID ?? '').replace(/^properties\//, ''),
  gaCredentialsJson: process.env.GA_CREDENTIALS_JSON ?? '',
  gaCredentialsFile: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
}
