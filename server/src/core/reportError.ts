// Punto unico di cattura degli errori non gestiti (risposte 500).
// Oggi produce un log strutturato su stdout (cercabile nei log della piattaforma);
// domani si aggancia qui un servizio esterno (Sentry o simili) leggendo una env come
// SENTRY_DSN, senza dover toccare le route o l'error handler. Vedi punto "logging" della review.
import type { FastifyRequest } from 'fastify'

/**
 * Toglie dal testo i valori delle variabili d'ambiente sensibili e le stringhe di
 * connessione. Un errore di Prisma può contenere il `DATABASE_URL` completo, password
 * inclusa, e da lì finirebbe nei log della piattaforma — che sono più accessibili del
 * database e restano archiviati. Stessa regola già applicata ai report degli hook.
 */
function redigi(testo: string | undefined): string | undefined {
  if (!testo) return testo
  let sicuro = testo
  const nomeSensibile = /(?:KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|COOKIE|CREDENTIAL)/i
  for (const [nome, valore] of Object.entries(process.env)) {
    if (nomeSensibile.test(nome) && typeof valore === 'string' && valore.length >= 8) {
      sicuro = sicuro.split(valore).join(`[${nome} nascosto]`)
    }
  }
  return sicuro.replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s'"`]+/gi, '[URL database nascosto]')
}

export function reportError(err: unknown, req?: FastifyRequest) {
  const payload = {
    kind: 'unhandled_error',
    message: redigi(err instanceof Error ? err.message : String(err)),
    stack: redigi(err instanceof Error ? err.stack : undefined),
    method: req?.method,
    url: req?.url,
    userId: req?.user?.id,
    time: new Date().toISOString(),
  }

  // Log strutturato: singola riga JSON, facile da filtrare/alertare in produzione.
  if (req) req.log.error(payload, 'Errore non gestito')
  else console.error(JSON.stringify({ ...payload, msg: 'Errore non gestito' }))

  // TODO integrazione monitoring: quando si sceglie il servizio, agganciarlo qui, es.
  //   if (process.env.SENTRY_DSN) Sentry.captureException(err, { extra: payload })
}
