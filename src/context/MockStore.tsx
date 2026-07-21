import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type {
  Accessory,
  ActivityLogEntry,
  CashClosure,
  CategoriaCosto,
  Customer,
  FixedCostItem,
  InventoryRecord,
  Invoice,
  Linea,
  Material,
  Order,
  Product,
  ProductionStep,
  ProductVariant,
  QuotaHistoryEntry,
  Supplier,
  SupplierCategoria,
  SupplierRequest,
  SupplierRequestStato,
  TipologiaCliente,
} from '../types'
import { supplierRequests as initialSupplierRequests } from '../mock/supplierRequests'
import { productionSteps as initialProductionSteps } from '../mock/production'
import { products as initialProducts, productVariants as initialVariants } from '../mock/products'
import { inventoryRecords as initialInventoryRecords } from '../mock/inventory'
import { materials as initialMaterials, accessories as initialAccessories } from '../mock/materials'
import { invoices as initialInvoices } from '../mock/invoices'
import { suppliers as initialSuppliers } from '../mock/suppliers'
import { customers as initialCustomers, orders as initialOrders } from '../mock/customers'
import { activityLogs as initialActivityLogs } from '../mock/activityLogs'
import { cashClosures as initialCashClosures } from '../mock/cashClosures'
import { fixedCostItems as initialFixedCostItems, DEFAULT_CAPI_PRODOTTI_ANNUI, initialQuotaHistory } from '../mock/margins'
import { checkAdvance, stageLabel } from '../lib/production'
import { computeQuotaPerCapo } from '../lib/margins'
import { useRole } from './RoleContext'
import { ROLE_LABELS } from '../lib/permissions'

// Entità con stato mutabile a runtime nel prototipo (DEC-015: nessun backend/DB — la mutazione
// vive solo in memoria per la sessione del browser, si resetta al reload). Tutte le anagrafiche
// sono mutabili qui e le viste aggregate (Dashboard KPI, alert, conteggi Inventario) ricevono
// questo stato come sorgente, così i record creati in sessione compaiono ovunque. Le azioni
// critiche vengono registrate in activityLogs (FR-18) con il ruolo attivo come utente.

let idCounter = 0
function genId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

export interface NewProductInput {
  nome: string
  codiceProdotto: string
  categoria: string
  collezione: string
  stagione: string
  linea: Linea
}

export interface NewMaterialInput {
  nome: string
  codice: string
  supplierId: string
  composizione: string
  colore: string
  altezzaCm?: number
  prezzoAlMetro: number
  metriAcquistati: number
  sogliaMinima: number
  stagione: string
}

export interface NewAccessoryInput {
  nome: string
  codice: string
  categoria: string
  supplierId: string
  costoUnitario: number
  quantitaAcquistata: number
  sogliaMinima: number
}

export interface NewInvoiceInput {
  numero: string
  data: string
  fornitoreId?: string
  clienteId?: string
  paese: 'IT' | 'EU' | 'Extra-EU'
  valuta: string
  /** FR-22 (fatture estere): tasso e data cambio; imponibile/iva restano in EUR. */
  tassoCambio?: number
  dataCambio?: string
  imponibileValutaOriginale?: number
  totaleValutaOriginale?: number
  imponibile: number
  iva: number
  categoriaCosto: CategoriaCosto
  metodoPagamento: string
  statoPagamento: 'da_pagare' | 'pagata' | 'scaduta'
  dataScadenza?: string
  /** FR-19: link al PDF della fattura (Drive, coerente con FR-16). */
  documentoUrl?: string
  prodottiCollegatiIds?: string[]
  materialiCollegatiIds?: string[]
  noteAmministrative?: string
}

export interface NewSupplierInput {
  nome: string
  categoria: SupplierCategoria
  citta: string
  email?: string
  paese: string
  tempiMediConsegnaGiorni?: number
}

export interface NewCustomerInput {
  nome: string
  email?: string
  paese: string
  tipologia: TipologiaCliente
}

export interface NewOrderInput {
  customerId: string
  numero: string
  canale: 'shopify' | 'fisico'
  stato: 'in_lavorazione' | 'spedito' | 'consegnato' | 'annullato'
  data: string
  totale: number
  /** Prodotti dell'ordine (es. capo base di un ordine su misura, DEC-023). */
  prodottiIds?: string[]
}

export interface NewCashClosureInput {
  /** Mese "YYYY-MM" a cui si riferisce la chiusura. */
  mese: string
  totaleIncassato: number
  numeroScontrini: number
  fileNome?: string
  note?: string
}

const MESI_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/** "2026-06" → "giugno 2026". */
export function meseLabel(mese: string): string {
  const [anno, m] = mese.split('-')
  const idx = Number(m) - 1
  return idx >= 0 && idx < 12 ? `${MESI_IT[idx]} ${anno}` : mese
}

function formatEuro(n: number): string {
  return `€${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function stockStato(disponibili: number, sogliaMinima: number): 'disponibile' | 'sotto_soglia' | 'esaurito' {
  if (disponibili <= 0) return 'esaurito'
  if (disponibili <= sogliaMinima) return 'sotto_soglia'
  return 'disponibile'
}

// Stato per varianti e inventario prodotti finiti (usa 'low_stock', non 'sotto_soglia').
function variantStato(qta: number, sogliaMinima: number): 'disponibile' | 'low_stock' | 'esaurito' {
  if (qta <= 0) return 'esaurito'
  if (qta <= sogliaMinima) return 'low_stock'
  return 'disponibile'
}

export interface NewVariantInput {
  productId: string
  sku: string
  taglia: string
  colore: string
  stockIniziale: number
  sogliaMinima: number
  /** Immagine specifica della variante (FR-03, opzionale) — link, coerente con FR-16. */
  immagineUrl?: string
}

export interface VariantQuantitiesPatch {
  qtaMagazzino?: number
  qtaRiservata?: number
  qtaLaboratorio?: number
}

interface MockStoreValue {
  supplierRequests: SupplierRequest[]
  productionSteps: ProductionStep[]
  products: Product[]
  productVariants: ProductVariant[]
  inventoryRecords: InventoryRecord[]
  materials: Material[]
  accessories: Accessory[]
  invoices: Invoice[]
  suppliers: Supplier[]
  customers: Customer[]
  orders: Order[]
  fixedCostItems: FixedCostItem[]
  capiProdottiAnnui: number
  activityLogs: ActivityLogEntry[]
  quotaHistory: QuotaHistoryEntry[]
  cashClosures: CashClosure[]

  /** Registra un'azione critica nell'activity log (FR-18) con il ruolo attivo come utente. */
  logAction: (azione: string, entita: string, entitaId: string, valoreNuovo?: string, valorePrecedente?: string) => void
  /** FR-05: genera una bozza email fornitore precompilata da un materiale/accessorio sotto scorta. */
  addSupplierRequest: (input: { materialId?: string; accessoryId?: string }) => SupplierRequest | null
  /** FR-19: associa una fattura a prodotti/materiali (aggiorna anche il flag `associata`). */
  updateInvoiceAssociations: (id: string, prodottiIds: string[], materialiIds: string[]) => void
  /** FR-40: registra la quota corrente nello storico per stagione/periodo. */
  saveQuotaSnapshot: (periodo: string, nota?: string) => void
  /** FR-41: registra la chiusura di cassa di un mese dall'export scontrini Billy. */
  addCashClosure: (input: NewCashClosureInput) => CashClosure

  setSupplierRequestStatus: (id: string, stato: SupplierRequestStato, extra?: Partial<SupplierRequest>) => void
  updateSupplierRequestDraft: (id: string, patch: Partial<Pick<SupplierRequest, 'testo' | 'quantitaRichiesta' | 'deadlineIdeale'>>) => void
  advanceProductionStep: (id: string) => { ok: boolean; reason?: string }

  addProduct: (input: NewProductInput) => Product
  updateProduct: (id: string, patch: Partial<Product>) => void
  addVariant: (input: NewVariantInput) => ProductVariant
  updateVariantQuantities: (variantId: string, patch: VariantQuantitiesPatch) => void
  addMaterial: (input: NewMaterialInput) => Material
  addAccessory: (input: NewAccessoryInput) => Accessory
  addInvoice: (input: NewInvoiceInput) => Invoice
  addSupplier: (input: NewSupplierInput) => Supplier
  addCustomer: (input: NewCustomerInput) => Customer
  addOrder: (input: NewOrderInput) => Order

  updateFixedCostItem: (id: string, importoAnnuo: number) => void
  addFixedCostItem: (nome: string, importoAnnuo: number) => void
  removeFixedCostItem: (id: string) => void
  setCapiProdottiAnnui: (n: number) => void
}

const MockStoreContext = createContext<MockStoreValue | undefined>(undefined)

export function MockStoreProvider({ children }: { children: ReactNode }) {
  const { role } = useRole()
  const [supplierRequests, setSupplierRequests] = useState<SupplierRequest[]>(initialSupplierRequests)
  const [productionSteps, setProductionSteps] = useState<ProductionStep[]>(initialProductionSteps)
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [productVariants, setProductVariants] = useState<ProductVariant[]>(initialVariants)
  const [inventoryRecords, setInventoryRecords] = useState<InventoryRecord[]>(initialInventoryRecords)
  const [materials, setMaterials] = useState<Material[]>(initialMaterials)
  const [accessories, setAccessories] = useState<Accessory[]>(initialAccessories)
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices)
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers)
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [fixedCostItems, setFixedCostItems] = useState<FixedCostItem[]>(initialFixedCostItems)
  const [capiProdottiAnnui, setCapiProdottiAnniState] = useState<number>(DEFAULT_CAPI_PRODOTTI_ANNUI)
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>(initialActivityLogs)
  const [quotaHistory, setQuotaHistory] = useState<QuotaHistoryEntry[]>(initialQuotaHistory)
  const [cashClosures, setCashClosures] = useState<CashClosure[]>(initialCashClosures)

  const utente = ROLE_LABELS[role]
  const pushLog = (azione: string, entita: string, entitaId: string, valoreNuovo?: string, valorePrecedente?: string) => {
    setActivityLogs((prev) => [
      { id: genId('log'), utente, azione, entita, entitaId, valorePrecedente, valoreNuovo, data: new Date().toISOString() },
      ...prev,
    ])
  }

  const value = useMemo<MockStoreValue>(
    () => ({
      supplierRequests,
      productionSteps,
      products,
      productVariants,
      inventoryRecords,
      materials,
      accessories,
      invoices,
      suppliers,
      customers,
      orders,
      fixedCostItems,
      capiProdottiAnnui,
      activityLogs,
      quotaHistory,
      cashClosures,

      logAction: (azione, entita, entitaId, valoreNuovo, valorePrecedente) =>
        pushLog(azione, entita, entitaId, valoreNuovo, valorePrecedente),

      addSupplierRequest: ({ materialId, accessoryId }) => {
        const material = materialId ? materials.find((m) => m.id === materialId) : undefined
        const accessory = accessoryId ? accessories.find((a) => a.id === accessoryId) : undefined
        const item = material ?? accessory
        if (!item) return null
        const disponibile = material
          ? material.metriAcquistati - material.metriUtilizzati
          : accessory!.quantitaAcquistata - accessory!.quantitaUtilizzata
        const richiesta = Math.max(item.sogliaMinima * 3, 10)
        const mancante = Math.max(richiesta - Math.max(disponibile, 0), 0)
        const esaurito = item.stato === 'esaurito'
        const request: SupplierRequest = {
          id: genId('sr'),
          supplierId: item.supplierId,
          materialId,
          accessoryId,
          oggetto: `${esaurito ? 'Riordino urgente' : 'Richiesta disponibilità'} ${item.nome}: ${esaurito ? 'scorta esaurita' : 'sotto soglia minima'}`,
          testo: `Buongiorno, la scorta di ${item.nome} (${item.codice}) risulta ${esaurito ? 'esaurita' : `sotto la soglia minima di ${item.sogliaMinima}`}. Potete confermare disponibilità, tempi di consegna, costo aggiornato e quantità minima ordinabile per un riordino di almeno ${richiesta} ${material ? material.unitaMisura : accessory!.unitaMisura}?`,
          quantitaRichiesta: richiesta,
          quantitaDisponibile: Math.max(disponibile, 0),
          quantitaMancante: mancante,
          urgenza: esaurito ? 'alta' : 'media',
          stato: 'bozza_generata',
          creataIl: new Date().toISOString().slice(0, 10),
        }
        setSupplierRequests((prev) => [request, ...prev])
        pushLog('Generazione bozza email fornitore', 'supplier_requests', request.id, `stato: bozza_generata (${item.nome})`)
        return request
      },

      updateInvoiceAssociations: (id, prodottiIds, materialiIds) => {
        setInvoices((prev) =>
          prev.map((i) =>
            i.id === id
              ? { ...i, prodottiCollegatiIds: prodottiIds, materialiCollegatiIds: materialiIds, associata: prodottiIds.length > 0 || materialiIds.length > 0 }
              : i,
          ),
        )
        pushLog('Associazione fattura', 'invoices', id, `${prodottiIds.length} prodotti, ${materialiIds.length} materiali`)
      },

      saveQuotaSnapshot: (periodo, nota) => {
        const totale = fixedCostItems.reduce((sum, item) => sum + item.importoAnnuo, 0)
        const quota = computeQuotaPerCapo(fixedCostItems, capiProdottiAnnui)
        setQuotaHistory((prev) => [
          {
            id: genId('qh'), periodo, capiProdottiAnnui, totaleCostiFissi: Math.round(totale * 100) / 100,
            quotaPerCapo: quota, registrataIl: new Date().toISOString().slice(0, 10), nota,
          },
          ...prev,
        ])
        pushLog('Registrazione quota costi fissi', 'margins', periodo, `€${quota.toFixed(2)}/capo su ${capiProdottiAnnui} capi`)
      },

      addCashClosure: (input) => {
        const media = input.numeroScontrini > 0 ? input.totaleIncassato / input.numeroScontrini : 0
        // Riepilogo "AI" nel prototipo: testo derivato dai dati caricati (nessun backend AI).
        // In produzione questo sarà l'endpoint POST /api/v1/ai/cash-closure che chiama Claude API.
        const riepilogoAI = `A ${meseLabel(input.mese)} sono entrati ${formatEuro(input.totaleIncassato)} con ${input.numeroScontrini} scontrini (media ${formatEuro(media)} a scontrino). Dato da chiusura di cassa: è quanto effettivamente incassato dagli scontrini del mese.`
        const closure: CashClosure = {
          id: genId('cc'),
          mese: input.mese,
          totaleIncassato: Math.round(input.totaleIncassato * 100) / 100,
          numeroScontrini: input.numeroScontrini,
          fileNome: input.fileNome,
          importatoIl: new Date().toISOString().slice(0, 10),
          riepilogoAI,
          note: input.note,
        }
        // Se esiste già una chiusura per quel mese, la sostituisce (ri-caricamento export).
        setCashClosures((prev) => [closure, ...prev.filter((c) => c.mese !== input.mese)])
        pushLog('Chiusura di cassa mensile', 'cash_closures', input.mese, `${formatEuro(input.totaleIncassato)} · ${input.numeroScontrini} scontrini`)
        return closure
      },

      setSupplierRequestStatus: (id, stato, extra) => {
        setSupplierRequests((prev) => prev.map((r) => (r.id === id ? { ...r, stato, ...extra } : r)))
        pushLog('Cambio stato bozza email', 'supplier_requests', id, `stato: ${stato}`)
      },

      updateSupplierRequestDraft: (id, patch) => {
        setSupplierRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, ...patch, stato: 'modificata' } : r)),
        )
        pushLog('Modifica bozza email', 'supplier_requests', id, 'stato: modificata')
      },

      advanceProductionStep: (id) => {
        let result: { ok: boolean; reason?: string } = { ok: false, reason: 'Step non trovato.' }
        setProductionSteps((prev) =>
          prev.map((step) => {
            if (step.id !== id) return step
            const check = checkAdvance(step, { materials, accessories })
            if (!check.ok || !check.next) {
              result = { ok: false, reason: check.reason }
              return { ...step, bloccata: true, motivoBlocco: check.reason }
            }
            result = { ok: true }
            pushLog('Cambio fase produzione', 'production', step.id, stageLabel(check.next), stageLabel(step.fase))
            return { ...step, fase: check.next, bloccata: false, motivoBlocco: undefined }
          }),
        )
        return result
      },

      addProduct: (input) => {
        const product: Product = {
          id: genId('prod'),
          ...input,
          stato: 'idea',
          descrizioneBreveStato: 'bozza',
          consigliCuraStato: 'bozza',
          taglieDisponibili: [],
          coloriDisponibili: [],
          immaginiUrl: [],
          prezzoVendita: 0,
          prezzoNettoIva: 0,
          prezzoShowroom: 0,
          prezzoConsigliato: 0,
          statoPubblicazioneShopify: 'non_pubblicato',
          disponibilitaOnline: false,
          disponibilitaShowroom: false,
          visibileShowroom: false,
        }
        setProducts((prev) => [product, ...prev])
        pushLog('Creazione prodotto', 'products', product.id, `${product.nome} (stato: idea)`)
        // Ogni prodotto entra subito in pipeline dalla fase "Idea" (FR-07): senza questo step
        // il capo non comparirebbe nel kanban Produzione né nella tabella sotto.
        setProductionSteps((prev) => [
          {
            id: genId('step'),
            productId: product.id,
            fase: 'idea',
            responsabile: 'Da assegnare',
            dataInizio: new Date().toISOString().slice(0, 10),
            bloccata: false,
          },
          ...prev,
        ])
        return product
      },

      updateProduct: (id, patch) => {
        setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
        pushLog('Modifica prodotto', 'products', id, Object.keys(patch).join(', '))
      },

      // Variante + record inventario nascono insieme e restano collegati: la quantità
      // si modifica con updateVariantQuantities, che aggiorna entrambi (FR-03/FR-INV-01).
      addVariant: (input) => {
        const variant: ProductVariant = {
          id: genId('var'),
          productId: input.productId,
          sku: input.sku,
          taglia: input.taglia,
          colore: input.colore,
          stockDisponibile: input.stockIniziale,
          stockRiservato: 0,
          immagineUrl: input.immagineUrl,
          statoDisponibilita: variantStato(input.stockIniziale, input.sogliaMinima),
        }
        setProductVariants((prev) => [...prev, variant])
        pushLog('Creazione variante', 'product_variants', variant.id, variant.sku)
        setInventoryRecords((prev) => [
          ...prev,
          {
            id: genId('inv-rec'),
            variantId: variant.id,
            qtaMagazzino: input.stockIniziale,
            qtaLaboratorio: 0,
            qtaRiservata: 0,
            qtaVenduta: 0,
            sogliaMinima: input.sogliaMinima,
            stato: variantStato(input.stockIniziale, input.sogliaMinima),
            stockShopify: input.stockIniziale,
            divergenzaShopify: false,
          },
        ])
        return variant
      },

      updateVariantQuantities: (variantId, patch) => {
        const rec = inventoryRecords.find((r) => r.variantId === variantId)
        const next: InventoryRecord = rec
          ? { ...rec, ...patch }
          : {
              // Variante senza record inventario (non dovrebbe accadere: addVariant li crea in coppia).
              id: genId('inv-rec'),
              variantId,
              qtaMagazzino: patch.qtaMagazzino ?? 0,
              qtaLaboratorio: patch.qtaLaboratorio ?? 0,
              qtaRiservata: patch.qtaRiservata ?? 0,
              qtaVenduta: 0,
              sogliaMinima: 0,
              stato: 'disponibile',
              stockShopify: patch.qtaMagazzino ?? 0,
              divergenzaShopify: false,
            }
        next.stato = variantStato(next.qtaMagazzino, next.sogliaMinima)
        next.divergenzaShopify = next.stockShopify !== next.qtaMagazzino
        setInventoryRecords((prev) => (rec ? prev.map((r) => (r.variantId === variantId ? next : r)) : [...prev, next]))
        setProductVariants((prev) =>
          prev.map((v) =>
            v.id === variantId
              ? { ...v, stockDisponibile: next.qtaMagazzino, stockRiservato: next.qtaRiservata, statoDisponibilita: next.stato }
              : v,
          ),
        )
      },

      addMaterial: (input) => {
        const material: Material = {
          id: genId('mat'),
          tipo: 'tessuto',
          ...input,
          metriUtilizzati: 0,
          prodottiCollegatiIds: [],
          dataAcquisto: new Date().toISOString().slice(0, 10),
          stato: stockStato(input.metriAcquistati, input.sogliaMinima),
          unitaMisura: 'm',
        }
        setMaterials((prev) => [material, ...prev])
        pushLog('Creazione tessuto', 'materials', material.id, material.nome)
        return material
      },

      addAccessory: (input) => {
        const accessory: Accessory = {
          id: genId('acc'),
          tipo: 'accessorio',
          ...input,
          quantitaUtilizzata: 0,
          prodottiCollegatiIds: [],
          stato: stockStato(input.quantitaAcquistata, input.sogliaMinima),
          unitaMisura: 'cad',
        }
        setAccessories((prev) => [accessory, ...prev])
        pushLog('Creazione accessorio', 'accessories', accessory.id, accessory.nome)
        return accessory
      },

      addInvoice: (input) => {
        const prodottiCollegatiIds = input.prodottiCollegatiIds ?? []
        const materialiCollegatiIds = input.materialiCollegatiIds ?? []
        const invoice: Invoice = {
          id: genId('inv'),
          ...input,
          totale: Math.round((input.imponibile + input.iva) * 100) / 100,
          prodottiCollegatiIds,
          materialiCollegatiIds,
          associata: prodottiCollegatiIds.length > 0 || materialiCollegatiIds.length > 0,
        }
        setInvoices((prev) => [invoice, ...prev])
        pushLog('Caricamento fattura', 'invoices', invoice.id, `${invoice.numero} (${invoice.statoPagamento})`)
        return invoice
      },

      addSupplier: (input) => {
        const supplier: Supplier = {
          id: genId('sup'),
          ...input,
          materialiIds: [],
          accessoriIds: [],
        }
        setSuppliers((prev) => [supplier, ...prev])
        pushLog('Creazione fornitore', 'suppliers', supplier.id, supplier.nome)
        return supplier
      },

      addCustomer: (input) => {
        const customer: Customer = {
          id: genId('cust'),
          ...input,
          valoreTotaleAcquistato: 0,
          numeroOrdini: 0,
        }
        setCustomers((prev) => [customer, ...prev])
        pushLog('Creazione cliente', 'customers', customer.id, customer.nome)
        return customer
      },

      addOrder: (input) => {
        const order: Order = {
          id: genId('ord'),
          numero: input.numero,
          customerId: input.customerId,
          canale: input.canale,
          stato: input.stato,
          priorita: 'normale',
          data: input.data,
          totale: input.totale,
          prodottiIds: input.prodottiIds ?? [],
        }
        setOrders((prev) => [order, ...prev])
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === input.customerId
              ? { ...c, numeroOrdini: c.numeroOrdini + 1, valoreTotaleAcquistato: c.valoreTotaleAcquistato + input.totale }
              : c,
          ),
        )
        pushLog('Creazione ordine', 'orders', order.id, order.numero)
        return order
      },

      updateFixedCostItem: (id, importoAnnuo) => {
        setFixedCostItems((prev) => prev.map((item) => (item.id === id ? { ...item, importoAnnuo } : item)))
        pushLog('Modifica voce costi fissi', 'costs', id, `€${importoAnnuo}`)
      },

      addFixedCostItem: (nome, importoAnnuo) => {
        setFixedCostItems((prev) => [...prev, { id: genId('fc'), nome, importoAnnuo }])
        pushLog('Nuova voce costi fissi', 'costs', nome, `€${importoAnnuo}`)
      },

      removeFixedCostItem: (id) => {
        setFixedCostItems((prev) => prev.filter((item) => item.id !== id))
        pushLog('Rimozione voce costi fissi', 'costs', id)
      },

      setCapiProdottiAnnui: (n) => setCapiProdottiAnniState(n),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      supplierRequests,
      productionSteps,
      products,
      productVariants,
      inventoryRecords,
      materials,
      accessories,
      invoices,
      suppliers,
      customers,
      orders,
      fixedCostItems,
      capiProdottiAnnui,
      activityLogs,
      quotaHistory,
      cashClosures,
      role,
    ],
  )

  return <MockStoreContext.Provider value={value}>{children}</MockStoreContext.Provider>
}

export function useMockStore(): MockStoreValue {
  const ctx = useContext(MockStoreContext)
  if (!ctx) throw new Error('useMockStore deve essere usato dentro MockStoreProvider')
  return ctx
}
