// FR-30 — KPI e riquadri della dashboard. Porting di src/lib/dashboard.ts (getDashboardKpis
// e funzioni collegate). A differenza del prototipo i conteggi vengono dal database, quindi
// includono sempre tutti i record (il limite documentato nel MockStore non esiste più).
import { prisma } from '../../core/prisma.js'
import { daysFromToday } from '../../core/dates.js'
import { computeAllMargins } from '../margins/service.js'

const IN_SVILUPPO = ['concept', 'sviluppo_modello', 'scelta_tessuto', 'scelta_accessori', 'prototipo', 'campionario']

export async function getDashboardKpis() {
  const [products, materials, accessories, invoices, deadlines, margins, sheets, inventoryRecords] = await Promise.all([
    prisma.product.findMany(),
    prisma.material.findMany(),
    prisma.accessory.findMany(),
    prisma.invoice.findMany(),
    prisma.deadline.findMany(),
    computeAllMargins(),
    prisma.technicalSheet.findMany({ select: { productId: true } }),
    prisma.inventoryRecord.findMany({ select: { qtaMagazzino: true, qtaLaboratorio: true } }),
  ])

  const productIdsWithSheet = new Set(sheets.map((s) => s.productId))

  const mesiConMovimenti = new Set(
    invoices.map((i) => `${i.data.getUTCFullYear()}-${i.data.getUTCMonth()}`),
  )

  const scadenzeGiorni = deadlines
    .filter((d) => d.stato !== 'saldata')
    .map((d) => daysFromToday(d.data))

  return {
    prodottiTotali: products.length,
    prodottiAttivi: products.filter((p) => p.stato !== 'archivio' && p.stato !== 'idea').length,
    prodottiInSviluppo: products.filter((p) => IN_SVILUPPO.includes(p.stato)).length,
    // "In produzione" (FR-30): fase pipeline `produzione`, distinto da "In sviluppo" (DEC-017).
    prodottiInProduzione: products.filter((p) => p.stato === 'produzione').length,
    // "Pronti per ecommerce": scheda e-commerce completata, non ancora pubblicati (DEC-017).
    prodottiProntiEcommerce: products.filter((p) => p.stato === 'scheda_ecommerce').length,
    prodottiPubblicati: products.filter((p) => p.statoPubblicazioneShopify === 'pubblicato').length,
    margineSottoTarget: margins.filter((m) => m.sottoSoglia).length,
    sottoBreakEven: margins.filter((m) => m.prezzoNettoIva <= m.breakEvenPrice).length,
    tessutiSottoSoglia: materials.filter((m) => m.stato === 'sotto_soglia' || m.stato === 'esaurito').length,
    accessoriSottoSoglia: accessories.filter((a) => a.stato === 'sotto_soglia' || a.stato === 'esaurito').length,
    fattureNonAssociate: invoices.filter((i) => !i.associata).length,
    prodottiSenzaSchedaTecnica: products.filter((p) => p.stato !== 'idea' && !productIdsWithSheet.has(p.id)).length,
    prodottiSenzaPrezzo: products.filter(
      (p) => p.stato !== 'idea' && p.stato !== 'archivio' && Number(p.prezzoVendita) <= 0,
    ).length,
    fabricLibraryCount: materials.length,
    // Backlog "Note" §7: i due KPI di stock sono quantità di capi, non conteggi di righe.
    // "Riservati al laboratorio" = capi fisicamente spostati in laboratorio; "In magazzino"
    // = capi ancora a magazzino. La somma dei due è il disponibile totale.
    capiInLaboratorio: inventoryRecords.reduce((s, r) => s + r.qtaLaboratorio, 0),
    capiInMagazzino: inventoryRecords.reduce((s, r) => s + r.qtaMagazzino, 0),
    collezioniCount: new Set(products.map((p) => p.collezione).filter(Boolean)).size,
    scadenze7gg: scadenzeGiorni.filter((g) => g >= 0 && g <= 7).length,
    scadenze30gg: scadenzeGiorni.filter((g) => g > 7 && g <= 30).length,
    // Report disponibili = mesi che hanno movimenti (i report sono generati on-demand,
    // non persistiti: vedi Database_Schema, MonthlyReport).
    reportPronti: mesiConMovimenti.size,
  }
}

// Sezione "Alert materiali" (FR-30 §4): stessa fonte di FR-05, esposta come lista.
export async function getMaterialAlerts() {
  const [materials, accessories] = await Promise.all([
    prisma.material.findMany({ where: { stato: { in: ['sotto_soglia', 'esaurito'] } } }),
    prisma.accessory.findMany({ where: { stato: { in: ['sotto_soglia', 'esaurito'] } } }),
  ])
  const rows = [
    ...materials.map((m) => ({ id: m.id, nome: m.nome, tipo: 'tessuto' as const, stato: m.stato, link: '/inventario/tessuti' })),
    ...accessories.map((a) => ({ id: a.id, nome: a.nome, tipo: 'accessorio' as const, stato: a.stato, link: '/inventario/accessori' })),
  ]
  const rank: Record<string, number> = { esaurito: 0, sotto_soglia: 1 }
  return rows.sort((a, b) => (rank[a.stato] ?? 9) - (rank[b.stato] ?? 9))
}

export async function getStockOverview() {
  const records = await prisma.inventoryRecord.findMany()
  return {
    disponibile: records.reduce((s, r) => s + r.qtaMagazzino, 0),
    riservato: records.reduce((s, r) => s + r.qtaRiservata, 0),
    lowStock: records.filter((r) => r.stato === 'low_stock').length,
    esaurito: records.filter((r) => r.stato === 'esaurito').length,
  }
}

export async function getRecentOrders(limit = 5) {
  return prisma.order.findMany({ orderBy: { data: 'desc' }, take: limit, include: { customer: true } })
}

export async function getTopSellingProducts(limit = 5) {
  const records = await prisma.inventoryRecord.findMany({ include: { variant: { include: { product: true } } } })
  const byProduct = new Map<string, { nome: string; venduto: number }>()
  for (const rec of records) {
    const product = rec.variant?.product
    if (!product) continue
    const prev = byProduct.get(product.id)
    byProduct.set(product.id, { nome: product.nome, venduto: (prev?.venduto ?? 0) + rec.qtaVenduta })
  }
  return [...byProduct.entries()]
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.venduto - a.venduto)
    .slice(0, limit)
}

// Conteggi neutri per categoria/stagione (FR-30 §5).
export async function getProductBreakdowns() {
  const products = await prisma.product.findMany({ select: { categoria: true, stagione: true } })
  const count = (key: 'categoria' | 'stagione') => {
    const map = new Map<string, number>()
    for (const p of products) {
      const label = p[key] ?? 'Non specificata'
      map.set(label, (map.get(label) ?? 0) + 1)
    }
    return [...map.entries()].map(([label, c]) => ({ label, count: c })).sort((a, b) => b.count - a.count)
  }
  return { perCategoria: count('categoria'), perStagione: count('stagione') }
}
