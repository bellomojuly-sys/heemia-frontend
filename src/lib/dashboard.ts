import { products as staticProducts, productVariants as staticVariants } from '../mock/products'
import { inventoryRecords as staticInventoryRecords } from '../mock/inventory'
import { materials as staticMaterials, accessories as staticAccessories } from '../mock/materials'
import { invoices as staticInvoices, deadlines } from '../mock/invoices'
import { margins as staticMargins } from '../mock/margins'
import { technicalSheets } from '../mock/technicalSheets'
import type { Accessory, InventoryRecord, Invoice, Margin, Material, Order, Product, ProductionStep, ProductVariant, SupplierRequest } from '../types'
import { orders as staticOrders } from '../mock/customers'
import { monthlyReports } from '../mock/reports'
import { TODAY } from './alerts'

// Sorgenti dati: di default i mock statici; i chiamanti passano lo stato del MockStore
// così KPI e conteggi riflettono anche i record creati/modificati in sessione.
export interface DashboardSources {
  products?: Product[]
  materials?: Material[]
  accessories?: Accessory[]
  invoices?: Invoice[]
  inventoryRecords?: InventoryRecord[]
  productVariants?: ProductVariant[]
  orders?: Order[]
  margins?: Margin[]
}

export function getDashboardKpis(src: DashboardSources = {}) {
  const products = src.products ?? staticProducts
  const materials = src.materials ?? staticMaterials
  const accessories = src.accessories ?? staticAccessories
  const invoices = src.invoices ?? staticInvoices
  const liveMargins = src.margins ?? staticMargins

  const prodottiTotali = products.length
  const prodottiAttivi = products.filter((p) => p.stato !== 'archivio' && p.stato !== 'idea').length
  const prodottiInSviluppo = products.filter((p) =>
    ['concept', 'sviluppo_modello', 'scelta_tessuto', 'scelta_accessori', 'prototipo', 'campionario'].includes(p.stato),
  ).length
  // "In produzione" (FR-30): fase pipeline `produzione` — distinto da "In sviluppo" (concept→campionario). Vedi DEC-017.
  const prodottiInProduzione = products.filter((p) => p.stato === 'produzione').length
  // "Pronti per ecommerce" (FR-30): scheda e-commerce completata, non ancora pubblicati su Shopify. Vedi DEC-017.
  const prodottiProntiEcommerce = products.filter((p) => p.stato === 'scheda_ecommerce').length
  const prodottiPubblicati = products.filter((p) => p.statoPubblicazioneShopify === 'pubblicato').length
  const margineSottoTarget = liveMargins.filter((m) => m.sottoSoglia).length
  const sottoBreakEven = liveMargins.filter((m) => m.prezzoVendita <= m.breakEvenPrice).length
  const tessutiSottoSoglia = materials.filter((m) => m.stato === 'sotto_soglia' || m.stato === 'esaurito').length
  const accessoriSottoSoglia = accessories.filter((a) => a.stato === 'sotto_soglia' || a.stato === 'esaurito').length
  const fattureNonAssociate = invoices.filter((i) => !i.associata).length

  // Attenzione richiesta (FR-27 Anagrafica): stessi criteri già usati in computeAlerts, come conteggio.
  const prodottiSenzaSchedaTecnica = products.filter(
    (p) => p.stato !== 'idea' && !technicalSheets.some((ts) => ts.productId === p.id),
  ).length
  const prodottiSenzaPrezzo = products.filter((p) => p.stato !== 'idea' && p.stato !== 'archivio' && p.prezzoVendita <= 0).length

  const fabricLibraryCount = materials.length
  const collezioniCount = new Set(products.map((p) => p.collezione)).size

  const in7gg = deadlines.filter((d) => {
    const days = Math.round((new Date(d.data).getTime() - TODAY.getTime()) / 86400000)
    return days >= 0 && days <= 7
  }).length
  const in30gg = deadlines.filter((d) => {
    const days = Math.round((new Date(d.data).getTime() - TODAY.getTime()) / 86400000)
    return days > 7 && days <= 30
  }).length

  return {
    prodottiTotali,
    prodottiAttivi,
    prodottiInSviluppo,
    prodottiInProduzione,
    prodottiProntiEcommerce,
    prodottiPubblicati,
    margineSottoTarget,
    sottoBreakEven,
    tessutiSottoSoglia,
    accessoriSottoSoglia,
    fattureNonAssociate,
    prodottiSenzaSchedaTecnica,
    prodottiSenzaPrezzo,
    fabricLibraryCount,
    collezioniCount,
    scadenze7gg: in7gg,
    scadenze30gg: in30gg,
    reportPronti: monthlyReports.length,
  }
}

// Sezione "Alert materiali" (FR-30 §4): tessuti/accessori sotto soglia o esauriti, stessa fonte
// di FR-05/FR-27, esposti come lista invece che come conteggio per distinguere i due livelli.
export interface MaterialAlertRow {
  id: string
  nome: string
  tipo: 'tessuto' | 'accessorio'
  stato: 'sotto_soglia' | 'esaurito'
  link: string
}

export function getMaterialAlerts(src: DashboardSources = {}): MaterialAlertRow[] {
  const materials = src.materials ?? staticMaterials
  const accessories = src.accessories ?? staticAccessories
  const tessuti: MaterialAlertRow[] = materials
    .filter((m) => m.stato === 'sotto_soglia' || m.stato === 'esaurito')
    .map((m) => ({ id: m.id, nome: m.nome, tipo: 'tessuto', stato: m.stato as 'sotto_soglia' | 'esaurito', link: '/inventario/tessuti' }))
  const acc: MaterialAlertRow[] = accessories
    .filter((a) => a.stato === 'sotto_soglia' || a.stato === 'esaurito')
    .map((a) => ({ id: a.id, nome: a.nome, tipo: 'accessorio', stato: a.stato as 'sotto_soglia' | 'esaurito', link: '/inventario/accessori' }))
  const rank = { esaurito: 0, sotto_soglia: 1 }
  return [...tessuti, ...acc].sort((a, b) => rank[a.stato] - rank[b.stato])
}

// "Per categoria" / "Per stagione" (FR-30 §5): conteggio neutro prodotti, nessun colore semantico.
export function getProductsByCategoria(products: Product[] = staticProducts): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of products) counts.set(p.categoria, (counts.get(p.categoria) ?? 0) + 1)
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

export function getProductsByStagione(products: Product[] = staticProducts): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of products) counts.set(p.stagione, (counts.get(p.stagione) ?? 0) + 1)
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

export function getTopSellingProducts(limit = 5, src: DashboardSources = {}) {
  const products = src.products ?? staticProducts
  const inventoryRecords = src.inventoryRecords ?? staticInventoryRecords
  const productVariants = src.productVariants ?? staticVariants
  const salesByProduct = new Map<string, number>()
  for (const rec of inventoryRecords) {
    const variant = productVariants.find((v) => v.id === rec.variantId)
    if (!variant) continue
    salesByProduct.set(variant.productId, (salesByProduct.get(variant.productId) ?? 0) + rec.qtaVenduta)
  }
  return [...salesByProduct.entries()]
    .map(([productId, venduto]) => ({ product: products.find((p) => p.id === productId), venduto }))
    .filter((r): r is { product: Product; venduto: number } => Boolean(r.product))
    .sort((a, b) => b.venduto - a.venduto)
    .slice(0, limit)
}

export function getRecentOrders(limit = 5, orders: Order[] = staticOrders) {
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

// records: passare i record dal MockStore (mutabili in sessione) per riflettere le quantità
// modificate; se omesso usa i dati mock statici iniziali.
export function getStockOverview(records: InventoryRecord[] = staticInventoryRecords) {
  const disponibile = records.reduce((sum, r) => sum + r.qtaMagazzino, 0)
  const riservato = records.reduce((sum, r) => sum + r.qtaRiservata, 0)
  const lowStock = records.filter((r) => r.stato === 'low_stock').length
  const esaurito = records.filter((r) => r.stato === 'esaurito').length
  return { disponibile, riservato, lowStock, esaurito }
}
