// Fase 13: il calcolo degli alert è passato al server (GET /alerts → hook useServerAlerts),
// che applica gli stessi criteri di FR-27 e filtra già per ruolo.
// Qui resta solo la gestione delle date, usata dalle Scadenze e dall'intestazione dell'app.

/**
 * "Oggi". Nel prototipo era una data fissa (14/07/2026) perché i dati erano finti e le
 * scadenze mock erano tarate su quella. Dalla Fase 13 i dati sono reali, quindi è la data
 * corrente: altrimenti l'intestazione mostrerebbe una data sbagliata e i conteggi
 * "in scadenza tra N giorni" sarebbero riferiti a un giorno che non esiste più.
 */
export const TODAY = new Date()

/** Giorni tra oggi e una data (positivo = nel futuro). */
export function daysBetween(dateStr: string): number {
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24))
}
