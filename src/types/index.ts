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
  disponibilitaShowroom: boolean
  visibileShowroom: boolean
  /** DEC-023: il capo è proposto anche nel catalogo su misura della sub-app showroom. */
  personalizzabileSuMisura?: boolean
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
  stato: 'disponibile' | 'esaurito' | 'low_stock'
  stockShopify: number
  divergenzaShopify: boolean
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
  | 'Scadenze'
  | 'Anagrafica'
  | 'Shopify'
  | 'Report'
  | 'Ordini'

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
