// Errori applicativi con status HTTP. L'handler globale (app.ts) li traduce in risposta JSON.
export class AppError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

export const badRequest = (m: string) => new AppError(400, m, 'BAD_REQUEST')
export const unauthorized = (m = 'Non autenticato') => new AppError(401, m, 'UNAUTHORIZED')
export const forbidden = (m = 'Accesso non consentito per il tuo ruolo') => new AppError(403, m, 'FORBIDDEN')
export const notFound = (m = 'Risorsa non trovata') => new AppError(404, m, 'NOT_FOUND')
export const conflict = (m: string) => new AppError(409, m, 'CONFLICT')
