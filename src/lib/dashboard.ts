import type { Accessory, InventoryRecord, Invoice, Margin, Material, Order, Product, ProductionStep, ProductVariant, SupplierRequest } from '../types'

// Sorgenti dati: di default i mock statici; i chiamanti passano lo stato del DataStore
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

// getDashboardKpis è passato al server (GET /dashboard, hook useServerDashboard):
// i conteggi includono tutti i record del database.

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
  const materials = src.materials ?? []
  const accessories = src.accessories ?? []
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
export function getProductsByCategoria(products: Product[] = []): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of products) counts.set(p.categoria, (counts.get(p.categoria) ?? 0) + 1)
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

export function getProductsByStagione(products: Product[] = []): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of products) counts.set(p.stagione, (counts.get(p.stagione) ?? 0) + 1)
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

export function getTopSellingProducts(limit = 5, src: DashboardSources = {}) {
  const products = src.products ?? []
  const inventoryRecords = src.inventoryRecords ?? []
  const productVariants = src.productVariants ?? []
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

export function getRecentOrders(limit = 5, orders: Order[] = []) {
  return [...orders].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, limit)
}

// productionSteps e supplierRequests vivono nel DataStore (stato mutabile a runtime),
// quindi queste funzioni li ricevono come parametro invece di importarli staticamente.
export function getActiveProduction(productionSteps: ProductionStep[]) {
  return productionSteps.filter((s) => s.fase !== 'archivio')
}

export function getPendingEmailDrafts(supplierRequests: SupplierRequest[]) {
  return supplierRequests.filter((r) =>
    ['bozza_generata', 'in_attesa_approvazione', 'modificata', 'approvata'].includes(r.stato),
  )
}

// records: passare i record dal DataStore (mutabili in sessione) per riflettere le quantità
// modificate; se omesso usa i dati mock statici iniziali.
export function getStockOverview(records: InventoryRecord[] = []) {
  // Disponibile = magazzino + laboratorio: sono entrambe giacenze di capi finiti.
  const disponibile = records.reduce((sum, r) => sum + r.qtaMagazzino + r.qtaLaboratorio, 0)
  const inMagazzino = records.reduce((sum, r) => sum + r.qtaMagazzino, 0)
  const inLaboratorio = records.reduce((sum, r) => sum + r.qtaLaboratorio, 0)
  const inProduzione = records.reduce((sum, r) => sum + (r.qtaInProduzione ?? 0), 0)
  const riservato = records.reduce((sum, r) => sum + r.qtaRiservata, 0)
  const lowStock = records.filter((r) => r.stato === 'low_stock').length
  const esaurito = records.filter((r) => r.stato === 'esaurito').length
  // Varianti la cui giacenza di laboratorio è scesa sotto la soglia di reintegro.
  const daReintegrare = records.filter((r) => r.laboratorioSottoSoglia).length
  return { disponibile, inMagazzino, inLaboratorio, inProduzione, riservato, lowStock, esaurito, daReintegrare }
}
