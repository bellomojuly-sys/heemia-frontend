// Utility di data condivise da alert, scadenze e chiusure di cassa.
// Differenza dal prototipo: il client usava una TODAY fissa (14/07/2026) perché i mock
// erano statici; il server usa la data reale (API_Mapping: "scaduta derivata dal server
// dalla data, niente più TODAY fisso").

export function today(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Giorni tra oggi e una data (positivo = nel futuro). */
export function daysFromToday(date: Date): number {
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today().getTime()) / 86400000)
}

/** Mese precedente rispetto a oggi, formato "YYYY-MM". */
export function mesePrecedente(): string {
  const d = today()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MESI_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

/** "2026-06" → "giugno 2026". */
export function meseLabel(mese: string): string {
  const [anno, m] = mese.split('-')
  const i = Number(m) - 1
  return i >= 0 && i < 12 ? `${MESI_IT[i]} ${anno}` : mese
}

export function formatEuro(n: number): string {
  return `€${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
