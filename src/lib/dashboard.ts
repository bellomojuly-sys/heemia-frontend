import { products } from '../mock/products'
import { productVariants } from '../mock/products'
import { inventoryRecords } from '../mock/inventory'
import { materials, accessories } from '../mock/materials'
import { invoices, deadlines } from '../mock/invoices'
import { margins } from '../mock/margins'
import type { ProductionStep, SupplierRequest } from '../types'
import { orders } from '../mock/customers'
import { monthlyReports } from '../mock/reports'
import { TODAY } from './alerts'

export function getDashboardKpis() {
  const prodottiAttivi = products.filter((p) => p.stato !== 'archivio' && p.stato !== 'idea').length
  const prodottiInSviluppo = products.filter((p) =>
    ['concept', 'sviluppo_modello', 'scelta_tessuto', 'scelta_accessori', 'prototipo', 'campionario'].includes(p.stato),
  ).length
  const prodottiPubblicati = products.filter((p) => p.statoPubblicazioneShopify === 'pubblicato').length
  const margineSottoTarget = margins.filter((m) => m.sottoSoglia).length
  const sottoBreakEven = margins.filter((m) => m.prezzoVendita <= m.breakEvenPrice).length
  const tessutiSottoSoglia = materials.filter((m) => m.stato === 'sotto_soglia' || m.stato === 'esaurito').length
  const accessoriSottoSoglia = accessories.filter((a) => a.stato === 'sotto_soglia' || a.stato === 'esaurito').length
  const fattureNonAssociate = invoices.filter((i) => !i.associata).length

  const in7gg = deadlines.filter((d) => {
    const days = Math.round((new Date(d.data).getTime() - TODAY.getTime()) / 86400000)
    return days >= 0 && days <= 7
  }).length
  const in30gg = deadlines.filter((d) => {
    const days = Math.round((new Date(d.data).getTime() - TODAY.getTime()) / 86400000)
    return days > 7 && days <= 30
  }).length

  return {
    prodottiAttivi,
    prodottiInSviluppo,
    prodottiPubblicati,
    margineSottoTarget,
    sottoBreakEven,
    tessutiSottoSoglia,
    accessoriSottoSoglia,
    fattureNonAssociate,
    scadenze7gg: in7gg,
    scadenze30gg: in30gg,
    reportPronti: monthlyReports.length,
  }
}

export function getTopSellingProducts(limit = 5) {
  const salesByProduct = new Map<string, number>()
  for (const rec of inventoryRecords) {
    const variant = productVariants.find((v) => v.id === rec.variantId)
    if (!variant) continue
    salesByProduct.set(variant.productId, (salesByProduct.get(variant.productId) ?? 0) + rec.qtaVenduta)
  }
  return [...salesByProduct.entries()]
    .map(([productId, venduto]) => ({ product: products.find((p) => p.id === productId), venduto }))
    .filter((r) => r.product)
    .sort((a, b) => b.venduto - a.venduto)
    .slice(0, limit) as { product: NonNullable<ReturnType<typeof products.find>>; venduto: number }[]
}

export function getRecentOrders(limit = 5) {
  return [...orders].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, limit)
}

// productionSteps e supplierRequests vivono nel MockStore (stato mutabile a runtime),
// quindi queste funzioni li ricevono come parametro invece di importarli staticamente.
export function getActiveProduction(productionSteps: ProductionStep[]) {
  return productionSteps.filter((s) => s.fase !== 'archivio')
}

export function getPendingEmailDrafts(supplierRequests: SupplierRequest[]) {
  return supplierRequests.filter((r) =>
    ['bozza_generata', 'in_attesa_approvazione', 'modificata', 'approvata'].includes(r.stato),
  )
}

export function getStockOverview() {
  const disponibile = inventoryRecords.reduce((sum, r) => sum + r.qtaMagazzino, 0)
  const riservato = inventoryRecords.reduce((sum, r) => sum + r.qtaRiservata, 0)
  const lowStock = inventoryRecords.filter((r) => r.stato === 'low_stock').length
  const esaurito = inventoryRecords.filter((r) => r.stato === 'esaurito').length
  return { disponibile, riservato, lowStock, esaurito }
}
