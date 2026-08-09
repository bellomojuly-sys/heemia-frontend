import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  Accessory,
  ActivityLogEntry,
  CashClosure,
  CategoriaCosto,
  Customer,
  FixedCostItem,
  InventoryRecord,
  LabDetail,
  Invoice,
  Linea,
  Material,
  Order,
  Product,
  ProductionStep,
  ProductVariant,
  PatternDocument,
  PatternDocumentNoteTipo,
  PatternDocumentStato,
  PatternDocumentTipo,
  QuotaHistoryEntry,
  StockMovement,
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
  toLabDetail, toPatternDocument, toStockMovement, toSupplierRequest, toTechnicalSheet, toVariant,
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
    materiali, costiAggiuntivi, foto, storicoCosti, misure, id, productId, versione,
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
  if (misure) {
    payload.misure = misure.map((m) => ({
      nome: m.nome,
      valore: m.valore,
      unita: m.unita,
      tagliaRiferimento: m.tagliaRiferimento || undefined,
      tolleranza: m.tolleranza || undefined,
      nota: m.nota || undefined,
      fonte: m.fonte,
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
  /** Attributi commerciali della vista cliente (DEC-044): si scelgono già alla creazione. */
  visibileShowroom: boolean
  personalizzabileSuMisura: boolean
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

/** Esito dell'import fatture elettroniche, riga per riga (FR-19/20). */
export type EsitoRigaImport =
  | { file: string; esito: 'importata'; invoiceId: string; fornitore: string; numero: string; totale: number }
  | { file: string; esito: 'gia_presente'; fornitore: string; numero: string }
  | { file: string; esito: 'scartata'; motivo: string }

export interface EsitoImportFatture {
  importate: number
  giaPresenti: number
  scartate: number
  /** Fornitori che non erano in anagrafica e sono stati creati: hanno la categoria da sistemare. */
  fornitoriCreati: string[]
  righe: EsitoRigaImport[]
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
  /** Soglia sotto la quale il laboratorio va reintegrato dal magazzino. */
  sogliaMinimaLaboratorio?: number
}

// Esito della verifica prima di eliminare un capo (GET /products/:id/deletion-check).
// `blocchi` è già scritto in italiano dal server: la UI lo mostra così com'è.
export interface VerificaEliminazioneProdotto {
  nome: string
  eliminabile: boolean
  blocchi: string[]
  conseguenze: {
    varianti: number
    schedeTecniche: number
    documentiModellista: number
    fasiPipeline: number
    pezziInGiacenza: number
  }
}

export interface SuggerimentoMisureInput {
  categoria: string
  descrizione?: string
  vestibilita?: string
  stile?: string
  genere?: string
  lunghezza?: string
  volume?: string
  dettagliCostruttivi?: string
}

export interface SuggerimentoMisure {
  misure: { nome: string; unita: 'cm' | 'mm' | 'in'; tolleranza: string | null; nota: string | null }[]
  note: string
}

export interface NewPatternDocumentInput {
  fileName: string
  dataUrl: string
  tipologia: PatternDocumentTipo
  versione?: string
  autore?: string
}

export interface RequisitiCampione {
  requisiti: { chiave: string; etichetta: string; soddisfatto: boolean; dettaglio?: string }[]
  approvabile: boolean
  giaApprovato: boolean
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
  /**
   * Invio vero della richiesta al fornitore (FR-06). Passa dall'endpoint dedicato, non
   * dal cambio di stato: lo stato "inviata" lo mette il server **dopo** che l'email è
   * partita. Finché l'invio non è attivo (Fase 15.1) la chiamata fallisce spiegando cosa
   * manca, e la richiesta resta "approvata" invece di sembrare spedita.
   */
  sendSupplierRequest: (id: string) => Promise<void>

  /**
   * Import delle fatture elettroniche ricevute (FR-19/20): accetta lo ZIP scaricato
   * dall'area riservata dell'Agenzia o un singolo XML, anche firmato. Restituisce l'esito
   * file per file — non solleva errore se qualche file è illeggibile: quelli si vedono
   * come "scartati" con il motivo, e il resto entra lo stesso.
   */
  importaFattureElettroniche: (input: {
    nomeFile: string
    contenutoBase64: string
    partitaIvaHeemia?: string
  }) => Promise<EsitoImportFatture>
  advanceProductionStep: (id: string) => Promise<{ ok: boolean; reason?: string }>

  addProduct: (input: NewProductInput) => Promise<Product>
  updateProduct: (id: string, patch: Partial<Product>) => Promise<void>
  /** Verifica preventiva: dice se il capo si può eliminare e cosa sparirebbe con lui. */
  checkProductDeletion: (id: string) => Promise<VerificaEliminazioneProdotto>
  deleteProduct: (id: string) => Promise<void>
  addVariant: (input: NewVariantInput) => Promise<ProductVariant>
  updateVariantQuantities: (variantId: string, patch: VariantQuantitiesPatch) => Promise<void>
  transferStock: (variantId: string, direzione: 'to_lab' | 'to_warehouse', quantita: number, note?: string, motivo?: string) => Promise<void>
  /**
   * Distribuzione iniziale (FR-49). `modalita` è la risposta alla domanda della capretta:
   * `redistribuisci` = erano già compresi nel totale · `aggiungi` = non erano contati ·
   * `colma` = erano nel totale ma non assegnati a nessuna ubicazione (chiude lo scarto).
   */
  sistemaDistribuzione: (
    variantId: string,
    input: { ubicazione: 'magazzino' | 'laboratorio'; quantita: number; modalita: 'redistribuisci' | 'aggiungi' | 'colma' },
  ) => Promise<void>
  /** Chiude la distribuzione iniziale di una variante: da qui in poi vale la gestione ordinaria. */
  confermaDistribuzione: (variantId: string) => Promise<void>
  loadStockMovements: (variantId: string) => Promise<StockMovement[]>
  /** Dettaglio del laboratorio: giacenza, reintegri, consumi e capi in produzione. */
  loadLabDetail: (variantId: string) => Promise<LabDetail>
  mandaInProduzione: (variantId: string, quantita: number, note?: string, productId?: string) => Promise<void>
  chiudiLavorazione: (id: string, esito: 'terminato' | 'annullato') => Promise<void>

  /** Misure suggerite da Claude: propone QUALI misure servono, i valori si compilano a mano. */
  suggerisciMisure: (input: SuggerimentoMisureInput) => Promise<SuggerimentoMisure>

  loadPatternDocuments: (productId: string) => Promise<PatternDocument[]>
  addPatternDocument: (productId: string, input: NewPatternDocumentInput) => Promise<PatternDocument>
  setPatternDocumentStato: (id: string, stato: PatternDocumentStato) => Promise<PatternDocument>
  removePatternDocument: (id: string) => Promise<void>
  addPatternDocumentNote: (id: string, testo: string, tipo?: PatternDocumentNoteTipo) => Promise<PatternDocument>

  /** Checklist dei documenti richiesti prima di poter approvare il campione. */
  checkRequisitiCampione: (productId: string) => Promise<RequisitiCampione>
  approvaCampione: (productId: string, note?: string) => Promise<void>
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
      // Sessione scaduta: non è un guasto del caricamento. Ci pensa AuthContext a riportare
      // al login, qui non mostriamo il banner rosso "Dati non caricati".
      if (e instanceof ApiError && e.isAuthError) return
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

      sendSupplierRequest: async (id) => {
        await persisti(api.post(`/supplier-requests/${id}/send`, {}))
      },

      importaFattureElettroniche: async (input) =>
        persisti(api.post<EsitoImportFatture>('/invoices/import-fatture-elettroniche', input)),

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

      // Cosa comporta eliminare un capo: si chiede al server PRIMA di mostrare la conferma,
      // perché solo lui sa se ci sono ordini, fatture o movimenti che lo bloccano.
      checkProductDeletion: (id) => api.get<VerificaEliminazioneProdotto>(`/products/${id}/deletion-check`),

      deleteProduct: async (id) => {
        await persisti(api.del(`/products/${id}`))
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

      // Il server verifica la disponibilità nell'ubicazione di partenza e rifiuta
      // i trasferimenti che porterebbero la quantità sotto zero.
      transferStock: async (variantId, direzione, quantita, note, motivo) => {
        await persisti(api.post<Row>(`/inventory/${variantId}/transfer`, { direzione, quantita, note, motivo }))
      },

      // Il significato dell'operazione lo dichiara chi la fa: il server non lo deduce
      // dai numeri, altrimenti "3 in magazzino" resterebbe ambiguo (FR-49).
      sistemaDistribuzione: async (variantId, input) => {
        await persisti(api.post<Row>(`/inventory/${variantId}/migration`, input))
      },

      // Il server rifiuta se la somma delle ubicazioni non coincide col totale registrato.
      confermaDistribuzione: async (variantId) => {
        await persisti(api.post<Row>(`/inventory/${variantId}/migration/confirm`, {}))
      },

      loadStockMovements: async (variantId) => {
        const righe = await api.get<Row[]>(`/inventory/${variantId}/movements`)
        return righe.map(toStockMovement)
      },

      loadLabDetail: async (variantId) => toLabDetail(await api.get<Row>(`/inventory/${variantId}/lab`)),

      // Avviare una lavorazione toglie i capi dalla giacenza di laboratorio: diventano
      // una giacenza a sé, "in produzione" (DEC-047).
      mandaInProduzione: async (variantId, quantita, note, productId) => {
        await persisti(api.post(`/inventory/${variantId}/in-produzione`, { quantita, note, productId }))
      },

      // In entrambi gli esiti i capi rientrano in laboratorio: da lì erano usciti
      // all'avvio della lavorazione (DEC-047). "terminato" = capo finito, "annullato" =
      // lavorazione decaduta.
      chiudiLavorazione: async (id, esito) => {
        await persisti(api.patch(`/in-produzione/${id}`, { esito }))
      },

      // La chiave Claude vive solo sul server: senza chiave l'endpoint risponde
      // con un messaggio esplicito e le misure si aggiungono a mano.
      suggerisciMisure: (input) => api.post<SuggerimentoMisure>('/ai/suggest-measurements', input),

      loadPatternDocuments: async (productId) => {
        const righe = await api.get<Row[]>(`/products/${productId}/pattern-documents`)
        return righe.map(toPatternDocument)
      },

      addPatternDocument: async (productId, input) => {
        const creato = await api.post<Row>(`/products/${productId}/pattern-documents`, input)
        return toPatternDocument(creato)
      },

      setPatternDocumentStato: async (id, stato) => {
        const aggiornato = await api.patch<Row>(`/pattern-documents/${id}`, { statoApprovazione: stato })
        return toPatternDocument(aggiornato)
      },

      removePatternDocument: async (id) => {
        await api.del(`/pattern-documents/${id}`)
      },

      addPatternDocumentNote: async (id, testo, tipo) => {
        const aggiornato = await api.post<Row>(`/pattern-documents/${id}/notes`, { testo, tipo })
        return toPatternDocument(aggiornato)
      },

      checkRequisitiCampione: (productId) =>
        api.get<RequisitiCampione>(`/production/${productId}/sample-check`),

      // Il server rifiuta con 409 se manca un documento, elencando cosa manca.
      approvaCampione: async (productId, note) => {
        await persisti(api.post(`/production/${productId}/approve-sample`, { note }))
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
