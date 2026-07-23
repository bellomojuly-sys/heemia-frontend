// Configurazione centralizzata. Nessun valore di default sensibile: i secrets arrivano
// solo da variabili d'ambiente (Environment_Setup.md, DEC-005).
function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variabile d'ambiente mancante: ${name}. Vedi server/.env.example`)
  return v
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3001',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
}
