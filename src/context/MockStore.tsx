import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type {
  Accessory,
  CategoriaCosto,
  Customer,
  FixedCostItem,
  Invoice,
  Linea,
  Material,
  Order,
  Product,
  ProductionStep,
  Supplier,
  SupplierCategoria,
  SupplierRequest,
  SupplierRequestStato,
  TipologiaCliente,
} from '../types'
import { supplierRequests as initialSupplierRequests } from '../mock/supplierRequests'
import { productionSteps as initialProductionSteps } from '../mock/production'
import { products as initialProducts } from '../mock/products'
import { materials as initialMaterials, accessories as initialAccessories } from '../mock/materials'
import { invoices as initialInvoices } from '../mock/invoices'
import { suppliers as initialSuppliers } from '../mock/suppliers'
import { customers as initialCustomers, orders as initialOrders } from '../mock/customers'
import { fixedCostItems as initialFixedCostItems, DEFAULT_CAPI_PRODOTTI_ANNUI } from '../mock/margins'
import { checkAdvance } from '../lib/production'

// Entità con stato mutabile a runtime nel prototipo (DEC-015: nessun backend/DB — la mutazione
// vive solo in memoria per la sessione del browser, si resetta al reload). L'elenco anagrafiche
// (prodotti, tessuti, accessori, fatture, fornitori, clienti, ordini) è mutabile qui così i
// pulsanti "Aggiungi" possono creare un nuovo record visibile subito nella lista. Le viste
// aggregate (Dashboard KPI, Alert, Report) restano calcolate sui dati mock statici iniziali:
// rifattorizzarle per riflettere in tempo reale ogni nuovo record andrebbe oltre lo scope di
// questa correzione e rischierebbe di rompere il gating FR-07 già verificato.

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
  imponibile: number
  iva: number
  categoriaCosto: CategoriaCosto
  metodoPagamento: string
  statoPagamento: 'da_pagare' | 'pagata' | 'scaduta'
  dataScadenza?: string
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
}

function stockStato(disponibili: number, sogliaMinima: number): 'disponibile' | 'sotto_soglia' | 'esaurito' {
  if (disponibili <= 0) return 'esaurito'
  if (disponibili <= sogliaMinima) return 'sotto_soglia'
  return 'disponibile'
}

interface MockStoreValue {
  supplierRequests: SupplierRequest[]
  productionSteps: ProductionStep[]
  products: Product[]
  materials: Material[]
  accessories: Accessory[]
  invoices: Invoice[]
  suppliers: Supplier[]
  customers: Customer[]
  orders: Order[]
  fixedCostItems: FixedCostItem[]
  capiProdottiAnnui: number

  setSupplierRequestStatus: (id: string, stato: SupplierRequestStato, extra?: Partial<SupplierRequest>) => void
  updateSupplierRequestDraft: (id: string, patch: Partial<Pick<SupplierRequest, 'testo' | 'quantitaRichiesta' | 'deadlineIdeale'>>) => void
  advanceProductionStep: (id: string) => { ok: boolean; reason?: string }

  addProduct: (input: NewProductInput) => Product
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
  const [supplierRequests, setSupplierRequests] = useState<SupplierRequest[]>(initialSupplierRequests)
  const [productionSteps, setProductionSteps] = useState<ProductionStep[]>(initialProductionSteps)
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [materials, setMaterials] = useState<Material[]>(initialMaterials)
  const [accessories, setAccessories] = useState<Accessory[]>(initialAccessories)
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices)
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers)
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [fixedCostItems, setFixedCostItems] = useState<FixedCostItem[]>(initialFixedCostItems)
  const [capiProdottiAnnui, setCapiProdottiAnniState] = useState<number>(DEFAULT_CAPI_PRODOTTI_ANNUI)

  const value = useMemo<MockStoreValue>(
    () => ({
      supplierRequests,
      productionSteps,
      products,
      materials,
      accessories,
      invoices,
      suppliers,
      customers,
      orders,
      fixedCostItems,
      capiProdottiAnnui,

      setSupplierRequestStatus: (id, stato, extra) => {
        setSupplierRequests((prev) => prev.map((r) => (r.id === id ? { ...r, stato, ...extra } : r)))
      },

      updateSupplierRequestDraft: (id, patch) => {
        setSupplierRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, ...patch, stato: 'modificata' } : r)),
        )
      },

      advanceProductionStep: (id) => {
        let result: { ok: boolean; reason?: string } = { ok: false, reason: 'Step non trovato.' }
        setProductionSteps((prev) =>
          prev.map((step) => {
            if (step.id !== id) return step
            const check = checkAdvance(step)
            if (!check.ok || !check.next) {
              result = { ok: false, reason: check.reason }
              return { ...step, bloccata: true, motivoBlocco: check.reason }
            }
            result = { ok: true }
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
        return product
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
        return accessory
      },

      addInvoice: (input) => {
        const invoice: Invoice = {
          id: genId('inv'),
          ...input,
          totale: Math.round((input.imponibile + input.iva) * 100) / 100,
          prodottiCollegatiIds: [],
          materialiCollegatiIds: [],
          associata: false,
        }
        setInvoices((prev) => [invoice, ...prev])
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
          prodottiIds: [],
        }
        setOrders((prev) => [order, ...prev])
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === input.customerId
              ? { ...c, numeroOrdini: c.numeroOrdini + 1, valoreTotaleAcquistato: c.valoreTotaleAcquistato + input.totale }
              : c,
          ),
        )
        return order
      },

      updateFixedCostItem: (id, importoAnnuo) => {
        setFixedCostItems((prev) => prev.map((item) => (item.id === id ? { ...item, importoAnnuo } : item)))
      },

      addFixedCostItem: (nome, importoAnnuo) => {
        setFixedCostItems((prev) => [...prev, { id: genId('fc'), nome, importoAnnuo }])
      },

      removeFixedCostItem: (id) => {
        setFixedCostItems((prev) => prev.filter((item) => item.id !== id))
      },

      setCapiProdottiAnnui: (n) => setCapiProdottiAnniState(n),
    }),
    [
      supplierRequests,
      productionSteps,
      products,
      materials,
      accessories,
      invoices,
      suppliers,
      customers,
      orders,
      fixedCostItems,
      capiProdottiAnnui,
    ],
  )

  return <MockStoreContext.Provider value={value}>{children}</MockStoreContext.Provider>
}

export function useMockStore(): MockStoreValue {
  const ctx = useContext(MockStoreContext)
  if (!ctx) throw new Error('useMockStore deve essere usato dentro MockStoreProvider')
  return ctx
}
