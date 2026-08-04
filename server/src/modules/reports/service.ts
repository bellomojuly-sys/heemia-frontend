// FR-31 — report mensile. Non esiste una tabella `monthly_reports`: come da
// Database_Schema §"MonthlyReport" il report è **generato on-demand da query**
// (export PDF+Excel, DEC-025). Qui si calcola; l'export file arriva in Fase 14.
import { prisma } from '../../core/prisma.js'
import { meseLabel } from '../../core/dates.js'
import { computeAllMargins } from '../margins/service.js'

const r2 = (n: number) => Math.round(n * 100) / 100

export interface MonthlyReport {
  mese: string
  meseLabel: string
  generatoIl: string
  margineMedio: number
  costoMedioProdotto: number
  ricaviTotali: number
  costiTotali: number
  prodottoPiuCostoso: string | null
  prodottoMenoRedditizio: string | null
}

/** Estremi del mese "YYYY-MM" come intervallo [inizio, inizioMeseSuccessivo). */
function meseRange(mese: string): { from: Date; to: Date } {
  const [anno, m] = mese.split('-').map(Number)
  return { from: new Date(Date.UTC(anno, m - 1, 1)), to: new Date(Date.UTC(anno, m, 1)) }
}

export async function generateReport(mese: string): Promise<MonthlyReport> {
  const { from, to } = meseRange(mese)

  const [orders, invoices, margins] = await Promise.all([
    prisma.order.findMany({ where: { data: { gte: from, lt: to }, stato: { not: 'annullato' } } }),
    prisma.invoice.findMany({ where: { data: { gte: from, lt: to } } }),
    computeAllMargins(),
  ])

  const ricaviTotali = r2(orders.reduce((s, o) => s + Number(o.totale), 0))
  const costiTotali = r2(invoices.reduce((s, i) => s + Number(i.imponibile), 0))

  // Media sui soli prodotti con un margine calcolabile (prezzo netto > 0), come nel prototipo.
  const calcolabili = margins.filter((m) => m.prezzoNettoIva > 0)
  const margineMedio = calcolabili.length
    ? Math.round((calcolabili.reduce((s, m) => s + m.marginePercentuale, 0) / calcolabili.length) * 10) / 10
    : 0
  const costoMedioProdotto = calcolabili.length
    ? r2(calcolabili.reduce((s, m) => s + m.costoTotale, 0) / calcolabili.length)
    : 0

  const piuCostoso = [...margins].sort((a, b) => b.costoTotale - a.costoTotale)[0]
  const menoRedditizio = [...calcolabili].sort((a, b) => a.marginePercentuale - b.marginePercentuale)[0]

  return {
    mese,
    meseLabel: meseLabel(mese),
    generatoIl: new Date().toISOString(),
    margineMedio,
    costoMedioProdotto,
    ricaviTotali,
    costiTotali,
    prodottoPiuCostoso: piuCostoso?.nome ?? null,
    prodottoMenoRedditizio: menoRedditizio?.nome ?? null,
  }
}

/**
 * Elenco report: i mesi che hanno movimenti (ordini o fatture), dal più recente.
 * Ogni voce è calcolata al volo — non c'è storico persistito da leggere.
 */
export async function listReports(limit = 12): Promise<MonthlyReport[]> {
  const [orders, invoices] = await Promise.all([
    prisma.order.findMany({ select: { data: true } }),
    prisma.invoice.findMany({ select: { data: true } }),
  ])
  const mesi = new Set<string>()
  for (const d of [...orders, ...invoices]) {
    mesi.add(`${d.data.getUTCFullYear()}-${String(d.data.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  const ordinati = [...mesi].sort().reverse().slice(0, limit)
  return Promise.all(ordinati.map((m) => generateReport(m)))
}
