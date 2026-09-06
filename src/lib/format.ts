export function formatDateIt(dateStr?: string): string {
  if (!dateStr) return '–'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTimeIt(dateStr?: string): string {
  if (!dateStr) return '–'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatCurrency(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(value)
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

const MESI_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

/** "2026-06" → "giugno 2026". Gemella di `meseLabel` in server/src/core/dates.ts. */
export function meseLabel(mese: string): string {
  const [anno, m] = mese.split('-')
  const i = Number(m) - 1
  return i >= 0 && i < 12 ? `${MESI_IT[i]} ${anno}` : mese
}
