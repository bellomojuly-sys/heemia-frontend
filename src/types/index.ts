// Tipi dati mock — riflettono le entità descritte in
// 02_Functional_Requirements/Functional_Requirements.md e 03_Technical_Specification/UI_Design_System.md
// Dati finti, nessuna persistenza reale (DEC-015).

export type Role = 'admin' | 'ceo' | 'team' | 'viewer' | 'showroom'

export interface CurrentUser {
  role: Role
  name: string
}

// ---------------------------------------------------------------------------
// Prodotti (FR-01, FR-02, FR-03)
// ---------------------------------------------------------------------------

export type ProductStage =
  | 'idea'
  | 'concept'
  | 'sviluppo_modello'
  | 'scelta_tessuto'
  | 'scelta_accessori'
  | 'prototipo'
  | 'campionario'
  | 'produzione'
  | 'foto_contenuti'
  | 'scheda_ecommerce'
  | 'pubblicato_shopify'
  | 'in_vendita'
  | 'archivio'

export const PRODUCT_STAGES: { id: ProductStage; label: string }[] = [
  { id: 'idea', label: 'Idea' },
  { id: 'concept', label: 'Disegno / concept' },
  { id: 'sviluppo_modello', label: 'Sviluppo modello' },
  { id: 'scelta_tessuto', label: 'Scelta tessuto' },
  { id: 'scelta_accessori', label: 'Scelta accessori' },
  { id: 'prototipo', label: 'Prototipo' },
  { id: 'campionario', label: 'Campionario' },
  { id: 'produzione', label: 'Produzione' },
  { id: 'foto_contenuti', label: 'Foto e contenuti' },
  { id: 'scheda_ecommerce', label: 'Scheda e-commerce' },
  { id: 'pubblicato_shopify', label: 'Pubblicato su Shopify' },
  { id: 'in_vendita', label: 'In vendita' },
  { id: 'archivio', label: 'Archivio' },
]

export type Linea = 'tessile' | 'maglieria'

export interface ProductVariant {
  id: string
  productId: string
  sku: string
  taglia: string
  colore: string
  stockDisponibile: number
  stockRiservato: number
  immagineUrl?: string
  statoDisponibilita: 'disponibile' | 'esaurito' | 'low_stock'
}

export interface Product {
  id: string
  nome: string
  codiceProdotto: string
  categoria: string
  collezione: string
  stagione: string
  linea: Linea
  stato: ProductStage
  descrizioneBreve?: string
  descrizioneBreveStato: 'bozza' | 'approvata'
  descrizioneEcommerce?: string
  descrizioneTecnica?: string
  consigliCura?: string
  consigliCuraStato: 'bozza' | 'approvata'
  vestibilita?: string
  taglieDisponibili: string[]
  coloriDisponibili: string[]
  immaginiUrl: string[]
  prezzoVendita: number
  prezzoNettoIva: number
  prezzoShowroom: number
  prezzoConsigliato: number
  statoPubblicazioneShopify: 'non_pubblicato' | 'bozza' | 'pubblicato'
  disponibilitaOnline: boolean
  /**
   * DEC-044: il capo è fisicamente esposto e appeso nello stand dello showroom. È uno stato
   * commerciale, non si deduce dalle giacenze di magazzino/laboratorio. Decide la sezione
   * "Presenti in showroom" della vista cliente.
   */
  visibileShowroom: boolean
  /** DEC-023/044: realizzabile o adattabile su misura, anche se non è appeso in showroom. */
  personalizzabileSuMisura?: boolean
  /** Tempi indicativi di realizzazione mostrati al cliente sul su misura (spec §6). */
  tempiRealizzazione?: string
  disponibilitaShowroom: boolean
  /** Data di approvazione del campione: finché è assente il capo non può entrare in produzione. */
  campioneApprovatoIl?: string
  campioneNote?: string
}

export interface ProductIdea {
  id: string
  nome: string
  concept: string
  materialiStimati: string
  quantitaStimate: number
  noteCreative?: string
  stato: 'nuova' | 'in_valutazione' | 'promossa'
  scanBozzettoUrl?: string
}

// ---------------------------------------------------------------------------
// Scheda tecnica (FR-14)
// ---------------------------------------------------------------------------

export type TechnicalSheetVersion = 'preliminare' | 'piazzamento' | 'finale'

// Provenienza dichiarata di un valore di costo (tracciabilità, spec §6). `stimato` = calcolato
// dall'app (es. consumo stimato); `manuale` = inserito a mano; `ai` = estratto dalla scansione
// del PDF della scheda tecnica; gli altri risalgono all'origine dato.
export type CostSource = 'fattura' | 'materiale' | 'fornitore' | 'manuale' | 'stimato' | 'ai'

// Un costo o è diretto del capo, o è un costo di sviluppo/progettazione da ammortizzare sui capi previsti.
export type CostKind = 'diretto' | 'sviluppo_ammortizzato'

// Riga "materiale utilizzato" della scheda tecnica (spec §2 e §3). Tiene separato il valore
// suggerito automaticamente dall'app (quantitaSuggerita) da quello confermato dall'utente
// (quantitaConfermata): entrambi vengono conservati.
export interface SheetMaterialUsage {
  id: string
  /** Collegamento a un tessuto (Material) o a un accessorio (Accessory) in anagrafica. */
  materialId?: string
  accessoryId?: string
  /** Descrizione libera se non collegato a un'anagrafica. */
  descrizione: string
  unitaMisura: string
  /** Stima automatica del consumo per un capo (motore in lib/materialCosting.ts). */
  quantitaSuggerita: number
  /** Quantità confermata/corretta a mano dall'utente. Se assente, si usa la suggerita. */
  quantitaConfermata?: number
  percentualeScarto: number
  supplierId?: string
  fattureCollegateIds: string[]
  /** Costo unitario risolto (medio ponderato da fatture o fallback), fotografato per tracciabilità. */
  costoUnitario: number
  fonteCosto: CostSource
  fatturaCostoId?: string
  costoUnitarioAggiornatoIl: string
}

// Voce di costo aggiuntiva della scheda oltre ai materiali (spec §4: le 12 categorie di costo).
export type SheetCostVoce =
  | 'accessori'
  | 'lavorazioni'
  | 'taglio'
  | 'confezione'
  | 'ricamo_stampa'
  | 'sviluppo_modello'
  | 'disegno'
  | 'scheda_tecnica'
  | 'prototipazione'
  | 'logistica'
  | 'altro'

export interface SheetCostLine {
  id: string
  voce: SheetCostVoce
  label: string
  importo: number
  kind: CostKind
  fonte: CostSource
  fatturaId?: string
  /** true per i costi di sviluppo/progettazione/disegno/prototipazione da ripartire sui capi. */
  ammortizzabile: boolean
  /** Divisore di ammortamento; se assente usa sheet.quantitaPrevistaProduzione. */
  quantitaPrevista?: number
}

// Foto del prototipo caricata dall'utente (spec §1). data URL (base64) persistito in localStorage.
export interface TechnicalSheetPhoto {
  id: string
  dataUrl: string
  nome: string
  caricataIl: string
}

// Snapshot storico del calcolo costi (spec §6): mai sovrascritto, si aggiunge in coda.
export interface SheetCostSnapshot {
  id: string
  registratoIl: string
  motivo: string
  costoMaterialiUnitario: number
  costoTotaleUnitario: number
  prezzoBreakEven: number
}

export type StatoScheda = 'bozza' | 'in_revisione' | 'approvata' | 'archiviata'

export interface TechnicalSheet {
  id: string
  productId: string
  versione: TechnicalSheetVersion
  tessutoPrincipaleId: string
  tessutiSecondariId: string[]
  accessoriIds: string[]
  composizioneCompleta: string
  pesoCapoGrammi: number
  lavorazione: string
  trattamenti: string
  lavaggioConsigliato: string
  noteProduzione?: string
  difficoltaProduttiva: 'bassa' | 'media' | 'alta'
  tempiStimatiOre: number
  costoManodopera: number
  costoTessuto: number
  costoAccessori: number
  costoPackaging: number
  altriCostiDiretti: number
  altriCostiIndiretti: number
  creataIl: string
  archiviata: boolean
  /** Documento PDF collegato a questa versione (DEC-021). Link Drive, non file caricato — FR-16. */
  pdfUrl?: string
  pdfCaricatoIl?: string

  // --- Scheda tecnica strutturata (compilabile dal form, campi opzionali retro-compatibili) ---
  /** Anagrafica denormalizzata sulla scheda: precompilata dal Product ma editabile per versione. */
  nomeProdotto?: string
  codiceProdotto?: string
  collezione?: string
  categoria?: string
  statoScheda?: StatoScheda
  descrizioneTecnica?: string
  taglieDisponibili?: string[]
  misureVestibilita?: string
  istruzioniConfezione?: string
  noteTecniche?: string
  /** Fornitore o laboratorio di confezione coinvolto (Supplier). */
  fornitoreLaboratorioId?: string
  /** Righe materiali con stima consumo e costo (spec §2/§3). */
  materiali?: SheetMaterialUsage[]
  /** Voci di costo aggiuntive oltre ai materiali (spec §4). */
  costiAggiuntivi?: SheetCostLine[]
  /** Numero di capi previsti in produzione, divisore per l'ammortamento dei costi di sviluppo. */
  quantitaPrevistaProduzione?: number
  foto?: TechnicalSheetPhoto[]
  aggiornataIl?: string
  /** Storico dei calcoli costo (spec §6), non sovrascritto. */
  storicoCosti?: SheetCostSnapshot[]
  /** Misure tecniche del capo: elenco variabile per categoria, modificabile e riordinabile. */
  misure?: SheetMeasurement[]

  // --- Versioni Finale e Piazzamento: PDF caricato + note + scansione AI ---
  /** PDF della scheda caricato dal dispositivo (data URL), persistito come le foto. */
  pdfFile?: { dataUrl: string; nome: string; caricatoIl: string }
  /** Note libere sulla versione, scritte a mano accanto al PDF. */
  noteVersione?: string
  /** Esito dell'ultima scansione AI del PDF: i costi estratti finiscono in `materiali`/`costiAggiuntivi`. */
  scanAI?: {
    analizzatoIl: string
    nomeFile?: string
    note: string
    affidabilita: 'alta' | 'media' | 'bassa'
    vociEstratte: number
  }
}

/** Una misura tecnica del capo. Il valore lo compila il modellista, non l'AI. */
export interface SheetMeasurement {
  id: string
  nome: string
  valore?: number
  unita: 'cm' | 'mm' | 'in'
  tagliaRiferimento?: string
  tolleranza?: string
  nota?: string
  /** `ai` quando la misura è stata proposta da Claude, `manuale` quando l'ha aggiunta una persona. */
  fonte: CostSource
}

// ---------------------------------------------------------------------------
// Documenti delle modelliste (backlog "Note" §4)
// ---------------------------------------------------------------------------

export type PatternDocumentTipo =
  | 'cartamodello' | 'scheda_misure' | 'revisione_modellista'
  | 'piazzamento' | 'documento_taglio' | 'altro'

export type PatternDocumentStato = 'in_attesa' | 'approvato' | 'rifiutato' | 'richiede_revisione'

export type PatternDocumentNoteTipo =
  | 'commento' | 'correzione' | 'problema' | 'modifica_misure'
  | 'indicazione_taglio' | 'approvazione' | 'richiesta_nuova_versione'

export interface PatternDocumentNote {
  id: string
  testo: string
  tipo: PatternDocumentNoteTipo
  autore?: string
  createdAt: string
}

export interface PatternDocument {
  id: string
  productId: string
  fileName: string
  dataUrl: string
  tipologia: PatternDocumentTipo
  /** Testo libero (V1, V2, finale…): caricare una nuova versione non sovrascrive le precedenti. */
  versione: string
  autore?: string
  statoApprovazione: PatternDocumentStato
  caricatoDa?: string
  createdAt: string
  note: PatternDocumentNote[]
}

// ---------------------------------------------------------------------------
// Produzione (FR-07)
// ---------------------------------------------------------------------------

export interface ProductionStep {
  id: string
  productId: string
  fase: ProductStage
  responsabile: string
  dataInizio?: string
  dataFine?: string
  note?: string
  bloccata: boolean
  motivoBlocco?: string
}

// ---------------------------------------------------------------------------
// Materiali (FR-04)
// ---------------------------------------------------------------------------

export type StatoDisponibilitaMateriale = 'disponibile' | 'sotto_soglia' | 'esaurito' | 'da_verificare'

export interface Material {
  id: string
  tipo: 'tessuto'
  nome: string
  codice: string
  supplierId: string
  composizione: string
  colore: string
  altezzaCm?: number
  prezzoAlMetro: number
  metriAcquistati: number
  metriUtilizzati: number
  fatturaId?: string
  dataAcquisto: string
  stagione: string
  prodottiCollegatiIds: string[]
  consigliLavaggio?: string
  noteTecniche?: string
  sogliaMinima: number
  stato: StatoDisponibilitaMateriale
  unitaMisura: 'm' | 'kg'
}

export interface Accessory {
  id: string
  tipo: 'accessorio'
  nome: string
  codice: string
  categoria: string
  supplierId: string
  quantitaAcquistata: number
  quantitaUtilizzata: number
  costoUnitario: number
  fatturaId?: string
  prodottiCollegatiIds: string[]
  sogliaMinima: number
  stato: StatoDisponibilitaMateriale
  unitaMisura: 'cad' | 'm'
}

// ---------------------------------------------------------------------------
// Inventario prodotti finiti (FR-INV-01)
// ---------------------------------------------------------------------------

export interface InventoryRecord {
  id: string
  variantId: string
  qtaMagazzino: number
  qtaLaboratorio: number
  qtaRiservata: number
  qtaVenduta: number
  sogliaMinima: number
  /** Soglia della sola giacenza di laboratorio: sotto questa scatta l'alert di reintegro. */
  sogliaMinimaLaboratorio: number
  stato: 'disponibile' | 'esaurito' | 'low_stock'
  stockShopify: number
  divergenzaShopify: boolean
  /** Magazzino + laboratorio: i capi finiti in casa, quindi vendibili. Esclude i capi in lavorazione. */
  disponibileTotale: number
  /** Capi in lavorazione: giacenza a sé, già uscita dal laboratorio (DEC-047). */
  qtaInProduzione: number
  laboratorioSottoSoglia: boolean

  // --- Distribuzione iniziale (FR-49) ---
  /** Totale registrato per questa variante: il dato che arriva dall'import. */
  totaleDichiarato: number
  /** Magazzino + laboratorio come sono adesso. */
  totaleDistribuito: number
  /** `distribuito - dichiarato`: zero significa che la distribuzione torna. */
  differenzaMigrazione: number
  /** Finché è falso la variante è in distribuzione iniziale: niente gestione ordinaria. */
  migrazioneCompletata: boolean
  migrazioneConfermabile: boolean
  /** Reintegro suggerito dal magazzino, calcolato dal server. Null se non serve. */
  reintegro: ReintegroSuggerito | null
}

/** Quanto serve al laboratorio per tornare a soglia e quanto se ne può davvero spostare. */
export interface ReintegroSuggerito {
  /** Capi che mancano per arrivare alla soglia. */
  mancanti: number
  /** Capi realmente trasferibili adesso: il minore fra mancanti e giacenza di magazzino. */
  quantitaSuggerita: number
  inMagazzino: number
  /** Falso se il magazzino non basta: dopo il trasferimento si resta sotto soglia. */
  copreLaSoglia: boolean
}

/** Capi mandati in produzione: restano in laboratorio finché non vengono consumati. */
export interface Lavorazione {
  id: string
  variantId: string
  quantita: number
  stato: 'in_produzione' | 'terminato' | 'annullato'
  prodotto?: string
  note?: string
  utente?: string
  createdAt: string
  chiusoIl?: string
}

/** Vista di dettaglio del laboratorio per una variante. */
export interface LabDetail {
  variantId: string
  sku: string
  prodotto: string
  taglia: string
  colore: string
  qtaLaboratorio: number
  qtaMagazzino: number
  disponibileTotale: number
  qtaInProduzione: number
  disponibileInLaboratorio: number
  sogliaMinimaLaboratorio: number
  sottoSoglia: boolean
  movimenti: StockMovement[]
  reintegri: StockMovement[]
  /** Capi usciti dal laboratorio verso una lavorazione. */
  usciteLavorazione: StockMovement[]
  inProduzione: Lavorazione[]
  storicoLavorazioni: Lavorazione[]
}

/** Movimento di stock tra magazzino e laboratorio, o rettifica manuale di una quantità. */
export interface StockMovement {
  id: string
  variantId: string
  tipo: 'carico' | 'scarico' | 'trasferimento' | 'rettifica'
  quantita: number
  origine?: string
  destinazione?: string
  utente?: string
  /** Perché il movimento è avvenuto (reintegro, rientro, correzione, distribuzione iniziale…). */
  motivo?: string
  note?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Fornitori (FR-08)
// ---------------------------------------------------------------------------

export type SupplierCategoria =
  | 'Tessuti'
  | 'Filati'
  | 'Passamaneria'
  | 'Lycra'
  | 'Felpa'
  | 'Asole/Bottoni'
  | 'Fodere'
  | 'Cartellini/Etichette'
  | 'Accessori'
  | 'Zip'
  | 'Bottoni'
  | 'Accessori vari'
  | 'Biglietti'
  | 'Spalline'
  | 'Modellistica/Confezione'
  | 'Modellistica'
  | 'Ricami'
  | 'Smacchinatore'
  | 'Confezione'
  | 'Commercialista'
  | 'Marchi e brevetti'
  | 'Consulenza'

export interface Supplier {
  id: string
  nome: string
  categoria: SupplierCategoria
  citta: string
  email?: string
  referente?: string
  telefono?: string
  paese: string
  materialiIds: string[]
  accessoriIds: string[]
  tempiMediConsegnaGiorni?: number
  condizioniPagamento?: string
  note?: string
}

// ---------------------------------------------------------------------------
// Bozze email fornitori (FR-05, FR-06)
// ---------------------------------------------------------------------------

export type SupplierRequestStato =
  | 'bozza_generata'
  | 'in_attesa_approvazione'
  | 'modificata'
  | 'approvata'
  | 'inviata'
  | 'risposta_ricevuta'
  | 'chiusa'
  | 'annullata'

export interface SupplierRequest {
  id: string
  supplierId: string
  materialId?: string
  accessoryId?: string
  productId?: string
  oggetto: string
  testo: string
  quantitaRichiesta: number
  quantitaDisponibile: number
  quantitaMancante: number
  urgenza: 'bassa' | 'media' | 'alta'
  deadlineIdeale?: string
  stato: SupplierRequestStato
  noteTecniche?: string
  rispostaFornitore?: string
  creataIl: string
  approvataDa?: string
}

// ---------------------------------------------------------------------------
// Fatture e costi (FR-19, FR-20, FR-21, FR-22)
// ---------------------------------------------------------------------------

export type CategoriaCosto =
  | 'tessuto'
  | 'accessori'
  | 'manodopera'
  | 'packaging'
  | 'spedizione'
  | 'marketing'
  | 'logistica'
  | 'servizi'
  | 'costi_generali'

export interface Invoice {
  id: string
  numero: string
  data: string
  fornitoreId?: string
  clienteId?: string
  paese: 'IT' | 'EU' | 'Extra-EU'
  valuta: string
  tassoCambio?: number
  /** Data del cambio applicato (FR-22, fatture estere). */
  dataCambio?: string
  /** Imponibile nella valuta originale (FR-22); `imponibile` resta il valore in EUR. */
  imponibileValutaOriginale?: number
  /** Totale nella valuta originale (FR-22); la conversione EUR è calcolata con `tassoCambio`. */
  totaleValutaOriginale?: number
  imponibile: number
  iva: number
  totale: number
  categoriaCosto: CategoriaCosto
  metodoPagamento: string
  statoPagamento: 'da_pagare' | 'pagata' | 'scaduta'
  dataScadenza?: string
  documentoUrl?: string
  prodottiCollegatiIds: string[]
  materialiCollegatiIds: string[]
  noteAmministrative?: string
  associata: boolean
  reverseCharge?: boolean
  /** Nome del file da cui la fattura è stata importata (canale fiscale, FR-19/20): assente se inserita a mano. */
  origineXml?: string
}

// ---------------------------------------------------------------------------
// Allocazione costi indiretti (FR-23)
// ---------------------------------------------------------------------------

export type ModalitaAllocazione =
  | 'diretto_prodotto'
  | 'per_categoria'
  | 'per_collezione'
  | 'per_numero_capi'
  | 'per_fatturato'
  | 'per_mese'
  | 'non_allocabile'

export interface CostAllocation {
  id: string
  invoiceId: string
  modalita: ModalitaAllocazione
  targetId?: string
  note?: string
}

// ---------------------------------------------------------------------------
// Margini (FR-09, FR-10)
// ---------------------------------------------------------------------------

export interface Margin {
  productId: string
  prezzoVendita: number
  prezzoNettoIva: number
  costoDiretto: number
  costoIndirettoAllocato: number
  costoTotale: number
  margineLordo: number
  margineNettoStimato: number
  marginePercentuale: number
  breakEvenPrice: number
  prezzoMinimoConsigliato: number
  tipoDato: 'reale' | 'stimato'
  sottoSoglia: boolean
}

// Voce di costo fisso annuo (Business_Analysis §6.1): affitto, dipendenti, utenze, ecc.
// La somma di queste voci, divisa per i capi prodotti nell'anno, dà la quota costi fissi
// per capo applicata al calcolo margini (§6.2) — non più un valore fisso hardcoded.
export interface FixedCostItem {
  id: string
  nome: string
  importoAnnuo: number
}

// Registrazione storica della quota per stagione/periodo (FR-40): il valore corrente si può
// salvare esplicitamente, mai sovrascritto in silenzio.
export interface QuotaHistoryEntry {
  id: string
  periodo: string
  capiProdottiAnnui: number
  totaleCostiFissi: number
  quotaPerCapo: number
  registrataIl: string
  nota?: string
}

// ---------------------------------------------------------------------------
// Scadenze (FR-24)
// ---------------------------------------------------------------------------

export type TipoScadenza =
  | 'fattura_da_pagare'
  | 'fattura_da_incassare'
  | 'iva'
  | 'contributi'
  | 'fornitore'
  | 'commercialista'
  | 'reminder'
  | 'abbonamento'

export interface Deadline {
  id: string
  tipo: TipoScadenza
  descrizione: string
  data: string
  importo?: number
  stato: 'in_arrivo' | 'in_ritardo' | 'saldata'
  collegatoA?: string
}

// ---------------------------------------------------------------------------
// Alert e notifiche (FR-05, FR-27)
// ---------------------------------------------------------------------------

export type AlertModulo =
  | 'Margini'
  | 'Costi'
  | 'Fatture'
  | 'Inventario tessuti'
  | 'Inventario accessori'
  | 'Inventario prodotti finiti'
  | 'Scadenze'
  | 'Anagrafica'
  | 'Shopify'
  | 'Report'
  | 'Ordini'
  | 'Produzione'

export interface AlertItem {
  id: string
  modulo: AlertModulo
  messaggio: string
  livello: 'critico' | 'attenzione' | 'info'
  data: string
  entitaId?: string
  link?: string
}

// ---------------------------------------------------------------------------
// Clienti (FR-25)
// ---------------------------------------------------------------------------

export type TipologiaCliente = 'ecommerce' | 'showroom' | 'b2b' | 'retailer' | 'showroom_partner'

export interface Customer {
  id: string
  nome: string
  email?: string
  paese: string
  tipologia: TipologiaCliente
  valoreTotaleAcquistato: number
  numeroOrdini: number
  sconto?: number
  note?: string
}

export interface Order {
  id: string
  numero: string
  customerId?: string
  canale: 'shopify' | 'fisico'
  stato: 'in_lavorazione' | 'spedito' | 'consegnato' | 'annullato'
  priorita: 'normale' | 'alta'
  data: string
  totale: number
  prodottiIds: string[]
}

// ---------------------------------------------------------------------------
// Activity log (FR-18)
// ---------------------------------------------------------------------------

export interface ActivityLogEntry {
  id: string
  utente: string
  azione: string
  entita: string
  entitaId: string
  valorePrecedente?: string
  valoreNuovo?: string
  data: string
}

// ---------------------------------------------------------------------------
// AI Assistant (FR-28)
// ---------------------------------------------------------------------------

export interface AiMessage {
  id: string
  autore: 'utente' | 'assistant'
  testo: string
  data: string
}

// ---------------------------------------------------------------------------
// Showroom (FR-29)
// ---------------------------------------------------------------------------

export interface ShowroomClient {
  id: string
  nome: string
  email: string
  registratoIl: string
}

// ---------------------------------------------------------------------------
// Report (FR-26)
// ---------------------------------------------------------------------------

export interface MonthlyReport {
  id: string
  mese: string
  generatoIl: string
  margineMedio: number
  costoMedioProdotto: number
  ricaviTotali: number
  costiTotali: number
  prodottoPiuCostoso: string
  prodottoMenoRedditizio: string
}

// ---------------------------------------------------------------------------
// Chiusura di cassa mensile (FR-41)
// ---------------------------------------------------------------------------
// Heemia vende con scontrino (corrispettivi), non fattura: l'incassato reale si
// conosce solo caricando una volta al mese l'export scontrini da Billy. Questa è
// la "chiusura di cassa": import manuale del file + totale del mese, riepilogato
// dall'AI assistant. Nessuna API Billy (non esposta) — vedi DEC-031.
export interface CashClosure {
  id: string
  /** Mese di riferimento in formato "YYYY-MM". */
  mese: string
  totaleIncassato: number
  numeroScontrini: number
  /** Nome del file export Billy caricato (traccia di provenienza). */
  fileNome?: string
  importatoIl: string
  /** Riepilogo generato dall'AI assistant sul mese (FR-28). */
  riepilogoAI: string
  note?: string
}

// ---------------------------------------------------------------------------
// Richieste dalla vista cliente showroom (spec 2026-08-06 §7, DEC-044)
// ---------------------------------------------------------------------------
// Il cliente in showroom apre una richiesta dal catalogo; nel gestionale diventa una
// scheda che l'atelier lavora fino alla conferma. Alla conferma nasce l'ordine SM-*:
// prima di quel punto non c'è un impegno commerciale, solo una trattativa.

export type StatoRichiestaShowroom =
  | 'nuova_richiesta'
  | 'da_contattare'
  | 'appuntamento_fissato'
  | 'misure_raccolte'
  | 'preventivo_inviato'
  | 'confermato'
  | 'in_produzione'
  | 'pronto'
  | 'consegnato'
  | 'annullato'

export interface ShowroomRequest {
  id: string
  numero: string
  tipo: 'personalizzazione' | 'informazioni'
  stato: StatoRichiestaShowroom
  createdAt: string
  cliente: { id: string; nome: string; cognome?: string; email?: string; consensoMarketing: boolean }
  prodotto?: { id: string; nome: string; codiceProdotto: string; categoria?: string }
  /** Dati inseriti dal cliente. */
  tagliaBase?: string
  coloreDesiderato?: string
  lunghezza?: string
  modifiche?: string
  note?: string
  misure?: Record<string, string>
  dataDesiderata?: string
  immagini: { id: string; nome: string; dataUrl: string }[]
  /** Dati compilati dall'atelier. */
  noteInterne?: string
  preventivoImporto?: number
  preventivoInviatoIl?: string
  appuntamentoIl?: string
  ordine?: { id: string; numero: string; stato: string }
}
