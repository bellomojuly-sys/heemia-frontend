// Punto unico di cattura degli errori non gestiti (risposte 500).
// Oggi produce un log strutturato su stdout (cercabile nei log della piattaforma);
// domani si aggancia qui un servizio esterno (Sentry o simili) leggendo una env come
// SENTRY_DSN, senza dover toccare le route o l'error handler. Vedi punto "logging" della review.
import type { FastifyRequest } from 'fastify'

export function reportError(err: unknown, req?: FastifyRequest) {
  const payload = {
    kind: 'unhandled_error',
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
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
