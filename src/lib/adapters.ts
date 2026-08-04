// Fase 13 — traduzione fra la forma dell'API (Prisma) e i tipi del frontend.
//
// Due differenze sistematiche che si risolvono qui, una volta per tutte:
//  - i Decimal Prisma arrivano come stringhe ("98.36") mentre i tipi del client usano number;
//  - le relazioni molti-a-molti arrivano come righe di join ([{invoiceId, productId}])
//    mentre il client usa array di id ("prodottiCollegatiIds").
import type {
  Accessory, ActivityLogEntry, CashClosure, Customer, FixedCostItem, InventoryRecord,
  Invoice, Material, Order, Product, ProductionStep, ProductVariant, QuotaHistoryEntry,
  SheetCostLine, SheetMaterialUsage, Supplier, SupplierRequest, TechnicalSheet,
} from '../types'
import { isoDate, num } from './api'

type Row = Record<string, unknown>
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export function toProduct(r: Row): Product {
  return {
    id: s(r.id),
    nome: s(r.nome),
    codiceProdotto: s(r.codiceProdotto),
    categoria: s(r.categoria),
    collezione: s(r.collezione),
    stagione: s(r.stagione),
    linea: r.linea as Product['linea'],
    stato: r.stato as Product['stato'],
    descrizioneBreve: r.descrizioneBreve ? s(r.descrizioneBreve) : undefined,
    descrizioneBreveStato: r.descrizioneBreveStato as Product['descrizioneBreveStato'],
    descrizioneEcommerce: r.descrizioneEcommerce ? s(r.descrizioneEcommerce) : undefined,
    descrizioneTecnica: r.descrizioneTecnica ? s(r.descrizioneTecnica) : undefined,
    consigliCura: r.consigliCura ? s(r.consigliCura) : undefined,
    consigliCuraStato: r.consigliCuraStato as Product['consigliCuraStato'],
    vestibilita: r.vestibilita ? s(r.vestibilita) : undefined,
    taglieDisponibili: arr<string>(r.taglieDisponibili),
    coloriDisponibili: arr<string>(r.coloriDisponibili),
    immaginiUrl: arr<string>(r.immaginiUrl),
    prezzoVendita: num(r.prezzoVendita),
    prezzoNettoIva: num(r.prezzoNettoIva),
    prezzoShowroom: num(r.prezzoShowroom),
    prezzoConsigliato: num(r.prezzoConsigliato),
    statoPubblicazioneShopify: r.statoPubblicazioneShopify as Product['statoPubblicazioneShopify'],
    disponibilitaOnline: Boolean(r.disponibilitaOnline),
    disponibilitaShowroom: Boolean(r.disponibilitaShowroom),
    visibileShowroom: Boolean(r.visibileShowroom),
    personalizzabileSuMisura: Boolean(r.personalizzabileSuMisura),
  } as Product
}

export function toVariant(r: Row): ProductVariant {
  return {
    id: s(r.id),
    productId: s(r.productId),
    sku: s(r.sku),
    taglia: s(r.taglia),
    colore: s(r.colore),
    stockDisponibile: num(r.stockDisponibile),
    stockRiservato: num(r.stockRiservato),
    immagineUrl: r.immagineUrl ? s(r.immagineUrl) : undefined,
    statoDisponibilita: r.statoDisponibilita as ProductVariant['statoDisponibilita'],
  } as ProductVariant
}

export function toInventoryRecord(r: Row): InventoryRecord {
  return {
    id: s(r.id),
    variantId: s(r.variantId),
    qtaMagazzino: num(r.qtaMagazzino),
    qtaLaboratorio: num(r.qtaLaboratorio),
    qtaRiservata: num(r.qtaRiservata),
    qtaVenduta: num(r.qtaVenduta),
    sogliaMinima: num(r.sogliaMinima),
    stato: r.stato as InventoryRecord['stato'],
    stockShopify: num(r.stockShopify),
    divergenzaShopify: Boolean(r.divergenzaShopify),
  } as InventoryRecord
}

export function toMaterial(r: Row): Material {
  return {
    id: s(r.id),
    tipo: 'tessuto',
    nome: s(r.nome),
    codice: s(r.codice),
    supplierId: s(r.supplierId),
    composizione: s(r.composizione),
    colore: s(r.colore),
    altezzaCm: num(r.altezzaCm),
    prezzoAlMetro: num(r.prezzoAlMetro),
    metriAcquistati: num(r.metriAcquistati),
    metriUtilizzati: num(r.metriUtilizzati),
    dataAcquisto: isoDate(r.dataAcquisto),
    stagione: s(r.stagione),
    consigliLavaggio: r.consigliLavaggio ? s(r.consigliLavaggio) : undefined,
    noteTecniche: r.noteTecniche ? s(r.noteTecniche) : undefined,
    sogliaMinima: num(r.sogliaMinima),
    stato: r.stato as Material['stato'],
    unitaMisura: r.unitaMisura as Material['unitaMisura'],
    prodottiCollegatiIds: [],
    fatturaId: r.fatturaId ? s(r.fatturaId) : undefined,
  } as Material
}

export function toAccessory(r: Row): Accessory {
  return {
    id: s(r.id),
    tipo: 'accessorio',
    nome: s(r.nome),
    codice: s(r.codice),
    categoria: s(r.categoria),
    supplierId: s(r.supplierId),
    quantitaAcquistata: num(r.quantitaAcquistata),
    quantitaUtilizzata: num(r.quantitaUtilizzata),
    costoUnitario: num(r.costoUnitario),
    sogliaMinima: num(r.sogliaMinima),
    stato: r.stato as Accessory['stato'],
    unitaMisura: r.unitaMisura as Accessory['unitaMisura'],
    prodottiCollegatiIds: [],
    fatturaId: r.fatturaId ? s(r.fatturaId) : undefined,
  } as Accessory
}

export function toSupplier(r: Row): Supplier {
  return {
    id: s(r.id),
    nome: s(r.nome),
    categoria: s(r.categoria).replace(/_/g, ' ') as Supplier['categoria'],
    citta: s(r.citta),
    paese: s(r.paese),
    email: r.email ? s(r.email) : undefined,
    referente: r.referente ? s(r.referente) : undefined,
    telefono: r.telefono ? s(r.telefono) : undefined,
    tempiMediConsegnaGiorni: r.tempiMediConsegnaGg ? num(r.tempiMediConsegnaGg) : undefined,
    condizioniPagamento: r.condizioniPagamento ? s(r.condizioniPagamento) : undefined,
    note: r.note ? s(r.note) : undefined,
    materialiIds: [],
    accessoriIds: [],
  } as Supplier
}

export function toCustomer(r: Row): Customer {
  return {
    id: s(r.id),
    nome: s(r.nome),
    email: r.email ? s(r.email) : undefined,
    paese: s(r.paese),
    tipologia: r.tipologia as Customer['tipologia'],
    valoreTotaleAcquistato: num(r.valoreTotaleAcquistato),
    numeroOrdini: num(r.numeroOrdini),
    sconto: r.sconto !== null && r.sconto !== undefined ? num(r.sconto) : undefined,
    note: r.note ? s(r.note) : undefined,
  } as Customer
}

export function toOrder(r: Row): Order {
  const items = arr<Row>(r.items)
  return {
    id: s(r.id),
    numero: s(r.numero),
    customerId: s(r.customerId),
    canale: r.canale as Order['canale'],
    stato: r.stato as Order['stato'],
    priorita: r.priorita as Order['priorita'],
    data: isoDate(r.data),
    totale: num(r.totale),
    prodottiIds: items.map((i) => s(i.productId)).filter(Boolean),
  } as Order
}

export function toInvoice(r: Row): Invoice {
  return {
    id: s(r.id),
    numero: s(r.numero),
    data: isoDate(r.data),
    fornitoreId: r.fornitoreId ? s(r.fornitoreId) : undefined,
    clienteId: r.clienteId ? s(r.clienteId) : undefined,
    paese: s(r.paese).replace('_', '-') as Invoice['paese'],
    valuta: s(r.valuta),
    tassoCambio: r.tassoCambio ? num(r.tassoCambio) : undefined,
    dataCambio: r.dataCambio ? isoDate(r.dataCambio) : undefined,
    imponibileValutaOriginale: r.imponibileValutaOriginale ? num(r.imponibileValutaOriginale) : undefined,
    totaleValutaOriginale: r.totaleValutaOriginale ? num(r.totaleValutaOriginale) : undefined,
    imponibile: num(r.imponibile),
    iva: num(r.iva),
    totale: num(r.totale),
    categoriaCosto: r.categoriaCosto as Invoice['categoriaCosto'],
    metodoPagamento: s(r.metodoPagamento),
    statoPagamento: r.statoPagamento as Invoice['statoPagamento'],
    dataScadenza: r.dataScadenza ? isoDate(r.dataScadenza) : undefined,
    documentoUrl: r.documentoUrl ? s(r.documentoUrl) : undefined,
    noteAmministrative: r.noteAmministrative ? s(r.noteAmministrative) : undefined,
    associata: Boolean(r.associata),
    reverseCharge: Boolean(r.reverseCharge),
    // Righe di join → array di id, la forma che usano le pagine.
    prodottiCollegatiIds: arr<Row>(r.products).map((p) => s(p.productId)),
    materialiCollegatiIds: arr<Row>(r.materialiLinks).map((m) => s(m.materialId)),
  } as Invoice
}

export function toProductionStep(r: Row): ProductionStep {
  return {
    id: s(r.id),
    productId: s(r.productId),
    fase: r.fase as ProductionStep['fase'],
    responsabile: s(r.responsabile),
    dataInizio: isoDate(r.dataInizio),
    dataFine: r.dataFine ? isoDate(r.dataFine) : undefined,
    note: r.note ? s(r.note) : undefined,
    bloccata: Boolean(r.bloccata),
    motivoBlocco: r.motivoBlocco ? s(r.motivoBlocco) : undefined,
  } as ProductionStep
}

export function toSupplierRequest(r: Row): SupplierRequest {
  return {
    id: s(r.id),
    supplierId: s(r.supplierId),
    materialId: r.materialId ? s(r.materialId) : undefined,
    accessoryId: r.accessoryId ? s(r.accessoryId) : undefined,
    productId: r.productId ? s(r.productId) : undefined,
    oggetto: s(r.oggetto),
    testo: s(r.testo),
    quantitaRichiesta: num(r.quantitaRichiesta),
    quantitaDisponibile: num(r.quantitaDisponibile),
    quantitaMancante: num(r.quantitaMancante),
    urgenza: r.urgenza as SupplierRequest['urgenza'],
    deadlineIdeale: r.deadlineIdeale ? isoDate(r.deadlineIdeale) : undefined,
    stato: r.stato as SupplierRequest['stato'],
    noteTecniche: r.noteTecniche ? s(r.noteTecniche) : undefined,
    rispostaFornitore: r.rispostaFornitore ? s(r.rispostaFornitore) : undefined,
    creataIl: isoDate(r.createdAt),
    inviataIl: r.inviataIl ? isoDate(r.inviataIl) : undefined,
  } as SupplierRequest
}

export function toActivityLog(r: Row): ActivityLogEntry {
  const user = r.user as Row | null
  return {
    id: s(r.id),
    utente: user ? s(user.nome) : 'Sistema',
    azione: s(r.azione),
    entita: s(r.entita),
    entitaId: s(r.entitaId),
    valorePrecedente: r.valorePrecedente ? s(r.valorePrecedente) : undefined,
    valoreNuovo: r.valoreNuovo ? s(r.valoreNuovo) : undefined,
    data: s(r.createdAt),
  }
}

// Scheda tecnica completa: dal 2026-07-30 vive nel database, collezioni comprese
// (righe materiali, voci di costo, foto, storico costi) — prima erano solo nel browser.
export function toTechnicalSheet(r: Row): TechnicalSheet {
  return {
    id: s(r.id),
    productId: s(r.productId),
    versione: r.versione as TechnicalSheet['versione'],
    tessutoPrincipaleId: s(r.tessutoPrincipaleId),
    tessutiSecondariId: [],
    accessoriIds: [],
    composizioneCompleta: s(r.composizioneCompleta),
    pesoCapoGrammi: num(r.pesoCapoGrammi),
    lavorazione: s(r.lavorazione),
    trattamenti: s(r.trattamenti),
    lavaggioConsigliato: s(r.lavaggioConsigliato),
    noteProduzione: r.noteProduzione ? s(r.noteProduzione) : undefined,
    difficoltaProduttiva: r.difficoltaProduttiva as TechnicalSheet['difficoltaProduttiva'],
    tempiStimatiOre: num(r.tempiStimatiOre),
    costoManodopera: num(r.costoManodopera),
    costoTessuto: num(r.costoTessuto),
    costoAccessori: num(r.costoAccessori),
    costoPackaging: num(r.costoPackaging),
    altriCostiDiretti: num(r.altriCostiDiretti),
    altriCostiIndiretti: num(r.altriCostiIndiretti),
    creataIl: isoDate(r.createdAt),
    aggiornataIl: isoDate(r.updatedAt),
    archiviata: Boolean(r.archiviata),
    pdfUrl: r.pdfUrl ? s(r.pdfUrl) : undefined,
    pdfCaricatoIl: r.pdfCaricatoIl ? isoDate(r.pdfCaricatoIl) : undefined,

    statoScheda: (r.statoScheda ?? 'bozza') as TechnicalSheet['statoScheda'],
    nomeProdotto: r.nomeProdotto ? s(r.nomeProdotto) : undefined,
    codiceProdotto: r.codiceProdotto ? s(r.codiceProdotto) : undefined,
    collezione: r.collezione ? s(r.collezione) : undefined,
    categoria: r.categoria ? s(r.categoria) : undefined,
    descrizioneTecnica: r.descrizioneTecnica ? s(r.descrizioneTecnica) : undefined,
    taglieDisponibili: arr<string>(r.taglieDisponibili),
    misureVestibilita: r.misureVestibilita ? s(r.misureVestibilita) : undefined,
    istruzioniConfezione: r.istruzioniConfezione ? s(r.istruzioniConfezione) : undefined,
    noteTecniche: r.noteTecniche ? s(r.noteTecniche) : undefined,
    fornitoreLaboratorioId: r.fornitoreLaboratorioId ? s(r.fornitoreLaboratorioId) : undefined,
    quantitaPrevistaProduzione: num(r.quantitaPrevistaProduzione) || 50,
    noteVersione: r.noteVersione ? s(r.noteVersione) : undefined,

    materiali: arr<Row>(r.righeMateriali).map((m) => ({
      id: s(m.id),
      materialId: m.materialId ? s(m.materialId) : undefined,
      accessoryId: m.accessoryId ? s(m.accessoryId) : undefined,
      descrizione: s(m.descrizione),
      unitaMisura: s(m.unitaMisura),
      quantitaSuggerita: num(m.quantitaSuggerita),
      quantitaConfermata: m.quantitaConfermata === null || m.quantitaConfermata === undefined ? undefined : num(m.quantitaConfermata),
      percentualeScarto: num(m.percentualeScarto),
      supplierId: m.supplierId ? s(m.supplierId) : undefined,
      fattureCollegateIds: arr<string>(m.fattureCollegateIds),
      costoUnitario: num(m.costoUnitario),
      fonteCosto: m.fonteCosto as SheetMaterialUsage['fonteCosto'],
      fatturaCostoId: m.fatturaCostoId ? s(m.fatturaCostoId) : undefined,
      costoUnitarioAggiornatoIl: isoDate(m.costoUnitarioAggiornatoIl),
    })),
    costiAggiuntivi: arr<Row>(r.righeCosti).map((c) => ({
      id: s(c.id),
      voce: c.voce as SheetCostLine['voce'],
      label: s(c.label),
      importo: num(c.importo),
      kind: c.kind as SheetCostLine['kind'],
      fonte: c.fonte as SheetCostLine['fonte'],
      fatturaId: c.fatturaId ? s(c.fatturaId) : undefined,
      ammortizzabile: Boolean(c.ammortizzabile),
      quantitaPrevista: c.quantitaPrevista ? num(c.quantitaPrevista) : undefined,
    })),
    foto: arr<Row>(r.foto).map((f) => ({
      id: s(f.id),
      nome: s(f.nome),
      dataUrl: s(f.dataUrl),
      caricataIl: isoDate(f.caricataIl),
    })),
    storicoCosti: arr<Row>(r.storicoCosti).map((h) => ({
      id: s(h.id),
      registratoIl: isoDate(h.registratoIl),
      motivo: s(h.motivo),
      costoMaterialiUnitario: num(h.costoMaterialiUnitario),
      costoTotaleUnitario: num(h.costoTotaleUnitario),
      prezzoBreakEven: num(h.prezzoBreakEven),
    })),
    pdfFile: r.pdfFileDataUrl
      ? { dataUrl: s(r.pdfFileDataUrl), nome: s(r.pdfFileNome), caricatoIl: isoDate(r.pdfFileCaricatoIl) }
      : undefined,
    scanAI: r.scanAiAnalizzatoIl
      ? {
          analizzatoIl: isoDate(r.scanAiAnalizzatoIl),
          nomeFile: r.scanAiNomeFile ? s(r.scanAiNomeFile) : undefined,
          note: s(r.scanAiNote),
          affidabilita: r.scanAiAffidabilita as 'alta' | 'media' | 'bassa',
          vociEstratte: num(r.scanAiVociEstratte),
        }
      : undefined,
  } as TechnicalSheet
}

export function toFixedCostItem(r: Row): FixedCostItem {
  return { id: s(r.id), nome: s(r.nome), importoAnnuo: num(r.importoAnnuo) } as FixedCostItem
}

export function toQuotaHistory(r: Row): QuotaHistoryEntry {
  return {
    id: s(r.id),
    periodo: s(r.periodo),
    capiProdottiAnnui: num(r.capiProdottiAnnui),
    totaleCostiFissi: num(r.totaleCostiFissi),
    quotaPerCapo: num(r.quotaPerCapo),
    registrataIl: isoDate(r.registrataIl),
    nota: r.nota ? s(r.nota) : undefined,
  } as QuotaHistoryEntry
}

export function toCashClosure(r: Row): CashClosure {
  return {
    id: s(r.id),
    mese: s(r.mese),
    totaleIncassato: num(r.totaleIncassato),
    numeroScontrini: num(r.numeroScontrini),
    fileNome: r.fileNome ? s(r.fileNome) : undefined,
    importatoIl: isoDate(r.importatoIl),
    riepilogoAI: r.riepilogoAi ? s(r.riepilogoAi) : undefined,
    note: r.note ? s(r.note) : undefined,
  } as CashClosure
}
