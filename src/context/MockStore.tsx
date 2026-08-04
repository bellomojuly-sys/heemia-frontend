import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  TechnicalSheet,
  TechnicalSheetPhoto,
  TechnicalSheetVersion,
  TipologiaCliente,
} from '../types'
// Fase 13: tutti i dati arrivano dal backend, schede tecniche comprese (OQ-18 chiusa).
import { DEFAULT_CAPI_PRODOTTI_ANNUI } from '../mock/margins'
import { computeSheetCost } from '../lib/sheetCost'
import { useRole } from './RoleContext'
import { ROLE_LABELS } from '../lib/permissions'
import { api, ApiError } from '../lib/api'
import { useAuth } from './AuthContext'
import {
  toAccessory, toActivityLog, toCashClosure, toCustomer, toFixedCostItem, toInventoryRecord,
  toInvoice, toMaterial, toOrder, toProduct, toProductionStep, toQuotaHistory, toSupplier,
  toSupplierRequest, toTechnicalSheet, toVariant,
} from '../lib/adapters'

/** Riga JSON generica in arrivo dall'API, prima dell'adattamento ai tipi del client. */
type Row = Record<string, unknown>

/**
 * Traduce una scheda tecnica dal formato del client a quello dell'API.
 * Due differenze di nome storiche: nel client le righe materiali si chiamano `materiali`
 * e le voci di costo `costiAggiuntivi`; sul server sono `righeMateriali` e `righeCosti`.
 * Foto e storico costi hanno endpoint dedicati e vengono ignorati qui.
 */
function toSheetPayload(patch?: Partial<TechnicalSheet>): Record<string, unknown> {
  if (!patch) return {}
  const {
    materiali, costiAggiuntivi, foto, storicoCosti, id, productId, versione,
    creataIl, aggiornataIl, tessutiSecondariId, accessoriIds, pdfFile, scanAI,
    ...campi
  } = patch
  const payload: Record<string, unknown> = { ...campi }
  if (materiali) {
    payload.righeMateriali = materiali.map((m) => ({
      materialId: m.materialId || undefined,
      accessoryId: m.accessoryId || undefined,
      descrizione: m.descrizione,
      unitaMisura: m.unitaMisura,
      quantitaSuggerita: m.quantitaSuggerita,
      quantitaConfermata: m.quantitaConfermata,
      percentualeScarto: m.percentualeScarto,
      supplierId: m.supplierId || undefined,
      fattureCollegateIds: m.fattureCollegateIds,
      costoUnitario: m.costoUnitario,
      fonteCosto: m.fonteCosto,
      fatturaCostoId: m.fatturaCostoId || undefined,
    }))
  }
  if (costiAggiuntivi) {
    payload.righeCosti = costiAggiuntivi.map((c) => ({
      voce: c.voce,
      label: c.label,
      importo: c.importo,
      kind: c.kind,
      fonte: c.fonte,
      fatturaId: c.fatturaId || undefined,
      ammortizzabile: c.ammortizzabile,
      quantitaPrevista: c.quantitaPrevista,
    }))
  }
  // Il PDF caricato e l'esito della scansione AI sono colonne piatte sul server.
  if (pdfFile) {
    payload.pdfFileNome = pdfFile.nome
    payload.pdfFileDataUrl = pdfFile.dataUrl
    payload.pdfFileCaricatoIl = pdfFile.caricatoIl
  }
  if (scanAI) {
    payload.scanAiAnalizzatoIl = scanAI.analizzatoIl
    payload.scanAiNomeFile = scanAI.nomeFile
    payload.scanAiNote = scanAI.note
    payload.scanAiAffidabilita = scanAI.affidabilita
    payload.scanAiVociEstratte = scanAI.vociEstratte
  }
  // Il tessuto principale è una relazione: stringa vuota significa "nessuno".
  if ('tessutoPrincipaleId' in campi && !campi.tessutoPrincipaleId) delete payload.tessutoPrincipaleId
  return payload
}

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

// Nota Fase 13: formatEuro/stockStato/variantStato sono stati rimossi da qui perché il
// calcolo di stato scorte, totali e riepiloghi ora avviene sul server (fonte unica di verità).

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

/** Campi compilabili di una scheda tecnica: tutto tranne id/productId/versione, gestiti dallo store. */
export type TechnicalSheetInput = Partial<Omit<TechnicalSheet, 'id' | 'productId' | 'versione'>>

// I valori di default di una scheda nuova sono ora quelli del database (colonne con
// DEFAULT), non più costruiti nel client.

interface MockStoreValue {
  supplierRequests: SupplierRequest[]
  technicalSheets: TechnicalSheet[]
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

  /** true mentre i dati vengono caricati dal backend (Fase 13). */
  caricamento: boolean
  /** Messaggio se il caricamento dal backend è fallito (es. server spento). */
  erroreCaricamento: string | null
  /** Ricarica tutte le collezioni dal backend. */
  ricarica: () => Promise<void>

  /** Registra un'azione critica nell'activity log (FR-18) con il ruolo attivo come utente. */
  logAction: (azione: string, entita: string, entitaId: string, valoreNuovo?: string, valorePrecedente?: string) => void
  /** FR-05: genera una bozza email fornitore precompilata da un materiale/accessorio sotto scorta. */
  addSupplierRequest: (input: { materialId?: string; accessoryId?: string }) => Promise<SupplierRequest | null>
  /** FR-19: associa una fattura a prodotti/materiali (aggiorna anche il flag `associata`). */
  updateInvoiceAssociations: (id: string, prodottiIds: string[], materialiIds: string[]) => Promise<void>
  /** FR-40: registra la quota corrente nello storico per stagione/periodo. */
  saveQuotaSnapshot: (periodo: string, nota?: string) => Promise<void>
  /** FR-41: registra la chiusura di cassa di un mese dall'export scontrini Billy. */
  addCashClosure: (input: NewCashClosureInput) => Promise<CashClosure>

  /** FR-14: crea una versione della scheda tecnica (preliminare/finale/piazzamento). */
  addTechnicalSheet: (productId: string, versione: TechnicalSheetVersion, input?: TechnicalSheetInput) => Promise<TechnicalSheet>
  /** Aggiorna una scheda tecnica esistente; aggiorna anche `aggiornataIl`. */
  updateTechnicalSheet: (id: string, patch: TechnicalSheetInput) => Promise<void>
  addSheetPhoto: (sheetId: string, photo: Omit<TechnicalSheetPhoto, 'id' | 'caricataIl'>) => Promise<void>
  removeSheetPhoto: (sheetId: string, photoId: string) => Promise<void>
  /** Spec §6: fotografa il costo corrente nello storico della scheda, senza sovrascrivere il passato. */
  recordSheetCostSnapshot: (sheetId: string, motivo: string) => Promise<void>
  /** Esito dell'ultimo salvataggio su localStorage: null se ok, messaggio se fallito (es. quota foto). */
  persistenzaAvviso: string | null

  setSupplierRequestStatus: (id: string, stato: SupplierRequestStato, extra?: Partial<SupplierRequest>) => Promise<void>
  updateSupplierRequestDraft: (id: string, patch: Partial<Pick<SupplierRequest, 'testo' | 'quantitaRichiesta' | 'deadlineIdeale'>>) => Promise<void>
  advanceProductionStep: (id: string) => Promise<{ ok: boolean; reason?: string }>

  addProduct: (input: NewProductInput) => Promise<Product>
  updateProduct: (id: string, patch: Partial<Product>) => Promise<void>
  addVariant: (input: NewVariantInput) => Promise<ProductVariant>
  updateVariantQuantities: (variantId: string, patch: VariantQuantitiesPatch) => Promise<void>
  addMaterial: (input: NewMaterialInput) => Promise<Material>
  addAccessory: (input: NewAccessoryInput) => Promise<Accessory>
  addInvoice: (input: NewInvoiceInput) => Promise<Invoice>
  addSupplier: (input: NewSupplierInput) => Promise<Supplier>
  addCustomer: (input: NewCustomerInput) => Promise<Customer>
  addOrder: (input: NewOrderInput) => Promise<Order>

  updateFixedCostItem: (id: string, importoAnnuo: number) => Promise<void>
  addFixedCostItem: (nome: string, importoAnnuo: number) => Promise<void>
  removeFixedCostItem: (id: string) => Promise<void>
  setCapiProdottiAnnui: (n: number) => Promise<void>
}

const MockStoreContext = createContext<MockStoreValue | undefined>(undefined)

export function MockStoreProvider({ children }: { children: ReactNode }) {
  const { role } = useRole()
  const { user } = useAuth()
  const [supplierRequests, setSupplierRequests] = useState<SupplierRequest[]>([])
  // Le schede tecniche sono l'unico dato persistito su localStorage: contengono data-entry reale
  // e foto del prototipo, che devono sopravvivere al reload (deviazione concordata da DEC-015).
  // Dal 2026-07-30 le schede arrivano dal database (chiude OQ-18), non più da localStorage.
  const [technicalSheets, setTechnicalSheets] = useState<TechnicalSheet[]>([])
  // Errore dell'ultimo salvataggio verso il server, mostrato in ProductDetail.
  const [persistenzaAvviso, setPersistenzaAvviso] = useState<string | null>(null)
  // Fase 13: le collezioni partono VUOTE e vengono riempite dal backend (loadAll, sotto).
  // I mock restano importati solo come struttura di riferimento per le schede tecniche.
  const [productionSteps, setProductionSteps] = useState<ProductionStep[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([])
  const [inventoryRecords, setInventoryRecords] = useState<InventoryRecord[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [accessories, setAccessories] = useState<Accessory[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [fixedCostItems, setFixedCostItems] = useState<FixedCostItem[]>([])
  const [capiProdottiAnnui, setCapiProdottiAnniState] = useState<number>(DEFAULT_CAPI_PRODOTTI_ANNUI)
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([])
  const [quotaHistory, setQuotaHistory] = useState<QuotaHistoryEntry[]>([])
  const [cashClosures, setCashClosures] = useState<CashClosure[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [erroreCaricamento, setErroreCaricamento] = useState<string | null>(null)

  // Carica dai rispettivi endpoint tutto ciò che serve alle pagine. Le liste riservate
  // (fatture, margini, clienti, log) danno 403 ai ruoli senza permesso: in quel caso la
  // collezione resta vuota invece di far fallire l'intero caricamento.
  const loadAll = useCallback(async () => {
    if (!user) return
    setCaricamento(true)
    setErroreCaricamento(null)
    const opzionale = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await p
      } catch (e) {
        if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) return fallback
        throw e
      }
    }
    try {
      const [
        prodottiRaw, materialiRaw, accessoriRaw, fornitoriRaw, produzioneRaw, richiesteRaw,
        inventarioRaw, ordiniRaw, clientiRaw, fattureRaw, chiusureRaw, costiFissiRaw,
        quotaRaw, logRaw,
      ] = await Promise.all([
        api.get<Row[]>('/products'),
        api.get<Row[]>('/materials'),
        api.get<Row[]>('/accessories'),
        api.get<Row[]>('/suppliers'),
        api.get<Row[]>('/production'),
        api.get<Row[]>('/supplier-requests'),
        opzionale(api.get<Row[]>('/inventory'), []),
        opzionale(api.get<Row[]>('/orders'), []),
        opzionale(api.get<Row[]>('/customers'), []),
        opzionale(api.get<Row[]>('/invoices'), []),
        opzionale(api.get<Row[]>('/cash-closures'), []),
        opzionale(api.get<Row[]>('/fixed-costs'), []),
        opzionale(api.get<Row[]>('/quota-history'), []),
        opzionale(api.get<Row[]>('/activity-log'), []),
      ])

      const prodotti = prodottiRaw.map(toProduct)
      setProducts(prodotti)
      // Le schede tecniche stanno su un endpoint per prodotto: si caricano in parallelo.
      const schede = await Promise.all(
        prodotti.map((p) =>
          api.get<Row[]>(`/products/${p.id}/technical-sheets`).catch(() => [] as Row[]),
        ),
      )
      setTechnicalSheets(schede.flat().map(toTechnicalSheet))
      // Le varianti arrivano dentro ogni prodotto (include Prisma), non da un endpoint a sé.
      setProductVariants(prodottiRaw.flatMap((p) => ((p.variants as Row[]) ?? []).map(toVariant)))
      setMaterials(materialiRaw.map(toMaterial))
      setAccessories(accessoriRaw.map(toAccessory))
      setSuppliers(fornitoriRaw.map(toSupplier))
      // /production restituisce una riga per prodotto con l'ultimo step (`ultimoStep`).
      // Se un prodotto non ha ancora uno step registrato ne costruiamo uno dalla sua fase
      // corrente, così compare comunque nel kanban: l'avanzamento usa `productId`, non l'id.
      setProductionSteps(
        produzioneRaw.map((riga) => {
          const ultimo = riga.ultimoStep as Row | null
          if (ultimo) return toProductionStep(ultimo)
          return {
            id: `pipeline-${String(riga.productId)}`,
            productId: String(riga.productId),
            fase: riga.fase as ProductionStep['fase'],
            responsabile: 'Da assegnare',
            dataInizio: '',
            bloccata: false,
          } as ProductionStep
        }),
      )
      setSupplierRequests(richiesteRaw.map(toSupplierRequest))
      setInventoryRecords(inventarioRaw.map(toInventoryRecord))
      setOrders(ordiniRaw.map(toOrder))
      setCustomers(clientiRaw.map(toCustomer))
      setInvoices(fattureRaw.map(toInvoice))
      setCashClosures(chiusureRaw.map(toCashClosure))
      setFixedCostItems(costiFissiRaw.map(toFixedCostItem))
      setQuotaHistory(quotaRaw.map(toQuotaHistory))
      setActivityLogs(logRaw.map(toActivityLog))

      const quota = await opzionale(
        api.get<{ capiProdottiAnnui: number }>('/margins/quota'),
        { capiProdottiAnnui: DEFAULT_CAPI_PRODOTTI_ANNUI },
      )
      if (quota.capiProdottiAnnui > 0) setCapiProdottiAnniState(quota.capiProdottiAnnui)
    } catch (e) {
      setErroreCaricamento(e instanceof Error ? e.message : 'Errore di caricamento dei dati')
    } finally {
      setCaricamento(false)
    }
  }, [user])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // Il salvataggio su localStorage è stato rimosso il 2026-07-30: le schede tecniche sono
  // nel database, quindi non c'è più né il limite di spazio del browser né il rischio di
  // perdere le foto. `persistenzaAvviso` resta nell'interfaccia per segnalare un eventuale
  // errore di salvataggio verso il server.

  const utente = ROLE_LABELS[role]
  // L'activity log vero lo scrive il server a ogni operazione (FR-18): qui teniamo solo
  // una riga ottimistica, sostituita dai dati reali al successivo caricamento.
  const pushLog = (azione: string, entita: string, entitaId: string, valoreNuovo?: string, valorePrecedente?: string) => {
    setActivityLogs((prev) => [
      { id: genId('log'), utente, azione, entita, entitaId, valorePrecedente, valoreNuovo, data: new Date().toISOString() },
      ...prev,
    ])
  }

  // Ogni scrittura passa da qui: chiama l'API e poi ricarica, così lo stato mostrato
  // è quello del database (id reali, stati e totali calcolati dal server) e non una copia locale.
  const persisti = async <T,>(chiamata: Promise<T>): Promise<T> => {
    try {
      const esito = await chiamata
      setPersistenzaAvviso(null)
      await loadAll()
      return esito
    } catch (e) {
      // L'avviso resta visibile finché un salvataggio successivo non riesce.
      setPersistenzaAvviso(e instanceof Error ? e.message : 'Salvataggio non riuscito')
      throw e
    }
  }

  const value = useMemo<MockStoreValue>(
    () => ({
      caricamento,
      erroreCaricamento,
      ricarica: loadAll,
      supplierRequests,
      technicalSheets,
      persistenzaAvviso,
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

      // Testo, quantità e urgenza della bozza li compone il server dalla stessa regola
      // del prototipo (soglia × 3, minimo 10), così restano identici ovunque.
      addSupplierRequest: async ({ materialId, accessoryId }) => {
        const creata = await persisti(api.post<Row>('/supplier-requests', { materialId, accessoryId }))
        return toSupplierRequest(creata)
      },

      updateInvoiceAssociations: async (id, prodottiIds, materialiIds) => {
        await persisti(api.put(`/invoices/${id}/associations`, { prodottiIds, materialiIds }))
      },

      saveQuotaSnapshot: async (periodo, nota) => {
        await persisti(api.post('/quota-history', { periodo, nota }))
      },

      // Ricaricare l'export dello stesso mese sostituisce la chiusura precedente (upsert lato server),
      // che calcola anche totale e riepilogo con la stessa formula del prototipo.
      addCashClosure: async (input) => {
        const creata = await persisti(api.post<Row>('/cash-closures', input))
        return toCashClosure(creata)
      },

      // Dal 2026-07-30 le schede tecniche vivono nel database (chiude OQ-18): sono
      // condivise fra utenti e incluse nei backup, non più solo nel browser.
      addTechnicalSheet: async (productId, versione, input) => {
        const creata = await persisti(
          api.post<Row>(`/products/${productId}/technical-sheets`, { versione, ...toSheetPayload(input) }),
        )
        return toTechnicalSheet(creata)
      },

      // Righe materiali e voci di costo vengono inviate per intero: il server sostituisce
      // il set della scheda in un'unica transazione, senza stati intermedi incoerenti.
      updateTechnicalSheet: async (id, patch) => {
        await persisti(api.patch(`/technical-sheets/${id}`, toSheetPayload(patch)))
      },

      addSheetPhoto: async (sheetId, photo) => {
        await persisti(api.post(`/technical-sheets/${sheetId}/photos`, { nome: photo.nome, dataUrl: photo.dataUrl }))
      },

      removeSheetPhoto: async (sheetId, photoId) => {
        await persisti(api.del(`/technical-sheets/${sheetId}/photos/${photoId}`))
      },

      // Spec §6: lo storico non viene mai sovrascritto — ogni ricalcolo aggiunge una riga
      // con data e motivo, così si può leggere la variazione rispetto al calcolo precedente.
      recordSheetCostSnapshot: async (sheetId, motivo) => {
        const scheda = technicalSheets.find((s) => s.id === sheetId)
        if (!scheda) return
        const costo = computeSheetCost(scheda, { materials, accessories, invoices })
        await persisti(
          api.post(`/technical-sheets/${sheetId}/cost-snapshots`, {
            motivo,
            costoMaterialiUnitario: costo.costoMateriali,
            costoTotaleUnitario: costo.costoTotaleUnitario,
            prezzoBreakEven: costo.prezzoBreakEven,
          }),
        )
      },

      // Le transizioni consentite sono verificate dal server (macchina a stati FR-05):
      // una transizione non valida torna 409 invece di essere applicata comunque.
      setSupplierRequestStatus: async (id, stato, extra) => {
        await persisti(api.patch(`/supplier-requests/${id}/status`, { stato, rispostaFornitore: extra?.rispostaFornitore }))
      },

      updateSupplierRequestDraft: async (id, patch) => {
        await persisti(api.patch(`/supplier-requests/${id}`, patch))
      },

      // Il gate FR-05/FR-07 (scheda tecnica mancante, materiale esaurito) lo applica il
      // server e risponde 409 con la ragione: qui diventa il messaggio mostrato all'utente.
      advanceProductionStep: async (id) => {
        const step = productionSteps.find((s) => s.id === id)
        if (!step) return { ok: false, reason: 'Step non trovato.' }
        try {
          await persisti(api.post(`/production/${step.productId}/advance`, {}))
          return { ok: true }
        } catch (e) {
          if (e instanceof ApiError) return { ok: false, reason: e.message }
          throw e
        }
      },

      // Il prodotto (e il suo primo step di pipeline) li crea il server: qui si aspetta
      // la risposta per avere l'id reale, che serve alla pagina per aprire il dettaglio.
      addProduct: async (input) => {
        const creato = await persisti(api.post<Row>('/products', input))
        return toProduct(creato)
      },

      updateProduct: async (id, patch) => {
        await persisti(api.patch<Row>(`/products/${id}`, patch))
      },

      // Variante + record inventario nascono insieme e restano collegati: la quantità
      // si modifica con updateVariantQuantities, che aggiorna entrambi (FR-03/FR-INV-01).
      addVariant: async (input) => {
        const { productId, ...resto } = input
        const creata = await persisti(api.post<Row>(`/products/${productId}/variants`, resto))
        return toVariant(creata)
      },

      // Il server ricalcola stato scorta e divergenza Shopify e tiene allineati
      // variante e record di inventario: qui si invia solo la quantità.
      updateVariantQuantities: async (variantId, patch) => {
        await persisti(api.patch<Row>(`/variants/${variantId}/quantities`, patch))
      },

      addMaterial: async (input) => {
        const creato = await persisti(api.post<Row>('/materials', input))
        return toMaterial(creato)
      },

      addAccessory: async (input) => {
        const creato = await persisti(api.post<Row>('/accessories', input))
        return toAccessory(creato)
      },

      // Il totale (imponibile + iva) e il flag `associata` li calcola il server.
      addInvoice: async (input) => {
        const { prodottiCollegatiIds, materialiCollegatiIds, paese, ...resto } = input
        const creata = await persisti(
          api.post<Row>('/invoices', {
            ...resto,
            paese: paese === 'Extra-EU' ? 'Extra_EU' : paese,
            prodottiIds: prodottiCollegatiIds ?? [],
            materialiIds: materialiCollegatiIds ?? [],
          }),
        )
        return toInvoice(creata)
      },

      addSupplier: async (input) => {
        const { tempiMediConsegnaGiorni, categoria, ...resto } = input
        const creato = await persisti(
          api.post<Row>('/suppliers', {
            ...resto,
            // L'API usa i nomi enum di Prisma ("Asole_Bottoni"), l'UI le etichette leggibili.
            categoria: categoria.replace(/[ /]/g, '_'),
            tempiMediConsegnaGg: tempiMediConsegnaGiorni,
          }),
        )
        return toSupplier(creato)
      },

      // La deduplica per email è server-side: una email già presente restituisce
      // il cliente esistente invece di crearne un altro.
      addCustomer: async (input) => {
        const creato = await persisti(api.post<Row>('/customers', input))
        return toCustomer(creato)
      },

      // Il server aggiorna anche numero ordini e valore acquistato del cliente.
      addOrder: async (input) => {
        const { prodottiIds, ...resto } = input
        const creato = await persisti(
          api.post<Row>('/orders', {
            ...resto,
            items: (prodottiIds ?? []).map((productId) => ({ productId })),
          }),
        )
        return toOrder(creato)
      },

      updateFixedCostItem: async (id, importoAnnuo) => {
        await persisti(api.patch(`/fixed-costs/${id}`, { importoAnnuo }))
      },

      addFixedCostItem: async (nome, importoAnnuo) => {
        await persisti(api.post('/fixed-costs', { nome, importoAnnuo }))
      },

      removeFixedCostItem: async (id) => {
        await persisti(api.del(`/fixed-costs/${id}`))
      },

      setCapiProdottiAnnui: async (n) => {
        setCapiProdottiAnniState(n)
        await persisti(api.put('/settings/capi-annui', { capiProdottiAnnui: n }))
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      supplierRequests,
      technicalSheets,
      persistenzaAvviso,
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
      caricamento,
      erroreCaricamento,
      loadAll,
    ],
  )

  return <MockStoreContext.Provider value={value}>{children}</MockStoreContext.Provider>
}

export function useMockStore(): MockStoreValue {
  const ctx = useContext(MockStoreContext)
  if (!ctx) throw new Error('useMockStore deve essere usato dentro MockStoreProvider')
  return ctx
}
