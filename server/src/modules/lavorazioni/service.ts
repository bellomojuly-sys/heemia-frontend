// Bolle / DDT di lavorazione esterna (richiesta di Giulia 2026-08-10).
//
// La regola che tiene insieme tutto il file: **il materiale affidato a un lavorante è
// ancora nostro**. Non è venduto, non è consumato — è solo altrove. Per questo ogni
// articolo ha due residui diversi e non uno:
//
//     patrimonio          = acquistato − utilizzato                  (quanto possediamo)
//     disponibile in casa = acquistato − utilizzato − presso terzisti (quanto possiamo usare oggi)
//
// L'emissione di una bolla sposta quantità dal secondo al "presso terzisti" senza toccare
// il primo. Il rientro decide il destino di quelle quantità: quelle restituite tornano
// disponibili, quelle consumate e quelle scartate escono dal patrimonio.
//
// Atomicità. Emissione, rientro, chiusura e annullamento passano tutti da una sola
// `prisma.$transaction`: o si scrivono documento, quantità e movimenti insieme, o non si
// scrive niente. Nessuna di queste operazioni deve poter lasciare una bolla emessa con le
// giacenze ferme, o viceversa.
import { Prisma } from '@prisma/client'
import type {
  BollaCausale, BollaLavorazioneStato, BollaRigaProvenienza, CostSource,
  LavorazioneUbicazione, MovimentoLavorazioneTipo,
} from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { badRequest, conflict, notFound, forbidden } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import { derivaStato } from '../materials/service.js'
import { calcolaDisponibilita } from '../inventory/service.js'

/** Le quantità di magazzino si confrontano a 4 decimali, come le colonne che le ospitano. */
const D = (n: Prisma.Decimal | number | string) => new Prisma.Decimal(n)
/** Tolleranza di confronto: sotto questo scarto due quantità sono la stessa quantità. */
const EPS = 1e-9

type Tx = Prisma.TransactionClient

// ---------------------------------------------------------------------------
// Articoli: tessuto, accessorio o variante di capo (il semilavorato)
// ---------------------------------------------------------------------------

export type TipoArticolo = 'materiale' | 'accessorio' | 'variante'
export type ProvenienzaRiga = 'magazzino' | 'scampoli'

/**
 * Un articolo qualunque visto dalla bolla: descrizione, unità di misura e — la parte che
 * conta — quanto se ne può consegnare adesso.
 *
 * Il "disponibile" **non è** il residuo storico: toglie anche ciò che è già presso altri
 * lavoranti. È questo il numero contro cui si valida un'uscita, altrimenti si potrebbero
 * promettere due volte gli stessi metri.
 */
export interface ArticoloDisponibile {
  tipo: TipoArticolo
  id: string
  descrizione: string
  sku: string | null
  unitaMisura: string
  disponibile: number
  scampoli: number
  pressoTerzisti: number
  patrimonio: number
  colore?: string | null
}

/** Elenco per il selettore di riga: articoli reali dell'inventario, con disponibilità vera. */
export async function listArticoliDisponibili(filtro?: { q?: string; tipo?: TipoArticolo }) {
  const q = filtro?.q?.trim()
  const cerca = q
    ? { OR: [{ nome: { contains: q, mode: 'insensitive' as const } }, { codice: { contains: q, mode: 'insensitive' as const } }] }
    : {}

  const vuoiTipo = (t: TipoArticolo) => !filtro?.tipo || filtro.tipo === t

  const [materiali, accessori, varianti] = await Promise.all([
    vuoiTipo('materiale') ? prisma.material.findMany({ where: cerca, orderBy: { nome: 'asc' }, take: 300 }) : [],
    vuoiTipo('accessorio') ? prisma.accessory.findMany({ where: cerca, orderBy: { nome: 'asc' }, take: 300 }) : [],
    vuoiTipo('variante')
      ? prisma.productVariant.findMany({
          where: q ? { OR: [{ sku: { contains: q, mode: 'insensitive' } }, { product: { nome: { contains: q, mode: 'insensitive' } } }] } : {},
          orderBy: { sku: 'asc' },
          take: 300,
          include: { product: { select: { nome: true } }, inventory: true },
        })
      : [],
  ])

  const out: ArticoloDisponibile[] = []

  for (const m of materiali) {
    const patrimonio = Number(m.metriAcquistati) - Number(m.metriUtilizzati)
    const presso = Number(m.metriPressoTerzisti)
    const scampoli = Number(m.metriScampoli)
    out.push({
      tipo: 'materiale', id: m.id, descrizione: `${m.nome} (${m.codice})`, sku: m.codice,
      unitaMisura: m.unitaMisura, colore: m.colore,
      disponibile: round4(patrimonio - presso - scampoli), scampoli: round4(scampoli),
      pressoTerzisti: round4(presso), patrimonio: round4(patrimonio),
    })
  }
  for (const a of accessori) {
    const patrimonio = Number(a.quantitaAcquistata) - Number(a.quantitaUtilizzata)
    const presso = Number(a.quantitaPressoTerzisti)
    const scampoli = Number(a.quantitaScampoli)
    out.push({
      tipo: 'accessorio', id: a.id, descrizione: `${a.nome} (${a.codice})`, sku: a.codice,
      unitaMisura: a.unitaMisura,
      disponibile: round4(patrimonio - presso - scampoli), scampoli: round4(scampoli),
      pressoTerzisti: round4(presso), patrimonio: round4(patrimonio),
    })
  }
  for (const v of varianti) {
    // Per un capo il "disponibile da consegnare" è ciò che sta in magazzino: il laboratorio
    // è la postazione operativa interna, non un deposito da cui si spedisce a un terzista.
    const magazzino = v.inventory?.qtaMagazzino ?? 0
    const presso = v.inventory?.qtaPressoTerzisti ?? 0
    const scampoli = v.inventory?.qtaScampoli ?? 0
    out.push({
      tipo: 'variante', id: v.id, descrizione: `${v.product?.nome ?? 'Capo'} · ${v.taglia}/${v.colore}`,
      sku: v.sku, unitaMisura: 'pz', colore: v.colore,
      disponibile: magazzino, scampoli, pressoTerzisti: presso,
      patrimonio: magazzino + (v.inventory?.qtaLaboratorio ?? 0) + presso + scampoli,
    })
  }

  return out.sort((a, b) => a.descrizione.localeCompare(b.descrizione, 'it'))
}

function round4(n: number) {
  return Math.round(n * 1e4) / 1e4
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ---------------------------------------------------------------------------
// Lettura
// ---------------------------------------------------------------------------

const includeBolla = {
  supplier: { select: { id: true, nome: true, partitaIva: true, categoria: true, email: true, citta: true } },
  product: { select: { id: true, nome: true, codiceProdotto: true } },
  technicalSheet: { select: { id: true, versione: true, statoScheda: true } },
  order: { select: { id: true, numero: true } },
  creataDa: { select: { id: true, nome: true, email: true } },
  emittente: { select: { id: true, nome: true, email: true } },
  chiuditore: { select: { id: true, nome: true, email: true } },
  righe: { orderBy: { ordine: 'asc' as const } },
  allegati: {
    where: { rientroId: null },
    select: { id: true, nome: true, caricatoIl: true, createdBy: true },
    orderBy: { caricatoIl: 'desc' as const },
  },
  rientri: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      righe: true,
      capi: true,
      registratoDa: { select: { id: true, nome: true, email: true } },
      allegati: { select: { id: true, nome: true, caricatoIl: true }, orderBy: { caricatoIl: 'desc' as const } },
    },
  },
} satisfies Prisma.BollaLavorazioneInclude

export interface FiltriBolle {
  supplierId?: string
  stato?: BollaLavorazioneStato
  numero?: string
  dataDa?: string
  dataA?: string
  productId?: string
}

export async function listBolle(f: FiltriBolle) {
  const where: Prisma.BollaLavorazioneWhereInput = {}
  if (f.supplierId) where.supplierId = f.supplierId
  if (f.stato) where.stato = f.stato
  if (f.productId) where.productId = f.productId
  if (f.numero) where.numero = { contains: f.numero, mode: 'insensitive' }
  if (f.dataDa || f.dataA) {
    where.data = {}
    if (f.dataDa) where.data.gte = new Date(f.dataDa)
    if (f.dataA) where.data.lte = new Date(f.dataA)
  }

  const righe = await prisma.bollaLavorazione.findMany({
    where,
    // Le bozze non hanno numero: si ordina per data e poi per creazione, così l'elenco ha
    // sempre un ordine stabile anche prima dell'emissione.
    orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
    include: includeBolla,
  })
  return righe.map(decoraBolla)
}

export async function getBolla(id: string) {
  const b = await prisma.bollaLavorazione.findUnique({ where: { id }, include: includeBolla })
  if (!b) throw notFound('Bolla non trovata')
  return decoraBolla(b)
}

/** Registro completo dei movimenti generati da una bolla, dal più recente. */
export function listMovimenti(bollaId: string) {
  return prisma.movimentoLavorazione.findMany({
    where: { bollaId },
    orderBy: { createdAt: 'desc' },
    include: { eseguitoDa: { select: { id: true, nome: true, email: true } } },
  })
}

export async function getAllegato(id: string) {
  const a = await prisma.bollaAllegato.findUnique({ where: { id } })
  if (!a) throw notFound('Allegato non trovato')
  return a
}

type BollaConRelazioni = Prisma.BollaLavorazioneGetPayload<{ include: typeof includeBolla }>

/**
 * Aggiunge alla bolla i numeri che l'interfaccia mostra ovunque e che nessuno deve
 * ricalcolarsi a mano: quanto è ancora fuori riga per riga, quanti capi sono rientrati
 * rispetto agli attesi, e se la lavorazione risulta riconciliata.
 */
function decoraBolla(b: BollaConRelazioni) {
  const righe = b.righe.map((r) => {
    const inviata = Number(r.quantitaInviata)
    const utilizzata = Number(r.quantitaUtilizzata)
    const restituita = Number(r.quantitaRestituita)
    const scartoRecuperato = Number(r.quantitaScartoRecuperato)
    const scartoPerso = Number(r.quantitaScartoPerso)
    const costoUnitario = Number(r.costoUnitario)
    return {
      ...r,
      quantitaInviata: inviata,
      quantitaUtilizzata: utilizzata,
      quantitaRestituita: restituita,
      quantitaScartoRecuperato: scartoRecuperato,
      quantitaScartoPerso: scartoPerso,
      costoUnitario,
      costoConsumato: round2(utilizzata * costoUnitario),
      costoPerso: round2(scartoPerso * costoUnitario),
      /** Il numero che dice se la riga è chiusa: quanto di quella consegna è ancora dal lavorante. */
      quantitaPressoLavorante: round4(inviata - utilizzata - restituita - scartoRecuperato - scartoPerso),
    }
  })

  const capiRientrati = b.rientri.reduce((s, r) => s + r.capi.reduce((x, c) => x + c.quantita, 0), 0)
  const tuttoRiconciliato = righe.every((r) => Math.abs(r.quantitaPressoLavorante) < EPS)

  return {
    ...b,
    righe,
    capiRientrati,
    tuttoRiconciliato,
    costoConsumato: round2(righe.reduce((s, r) => s + r.costoConsumato, 0)),
    costoPerso: round2(righe.reduce((s, r) => s + r.costoPerso, 0)),
    costoLavorazione: round2(righe.reduce((s, r) => s + r.costoConsumato + r.costoPerso, 0)),
    /** Etichetta pronta: una bozza non ha ancora un numero di documento. */
    etichetta: b.numero ?? `Bozza · ${b.id.slice(0, 8)}`,
    materialeAncoraFuori: round4(righe.reduce((s, r) => s + r.quantitaPressoLavorante, 0)),
  }
}

// ---------------------------------------------------------------------------
// Creazione e modifica della bozza
// ---------------------------------------------------------------------------

export interface RigaInput {
  tipo: TipoArticolo
  articoloId: string
  quantita: number
  provenienza?: ProvenienzaRiga
  lotto?: string
  colore?: string
  variante?: string
  note?: string
}

export interface BollaInput {
  supplierId: string
  data: string
  causale?: BollaCausale
  productId?: string
  technicalSheetId?: string
  commessa?: string
  orderId?: string
  quantitaAttesa?: number
  note?: string
  righe: RigaInput[]
}

/**
 * Legge l'articolo dall'anagrafica e ne congela i dati sulla riga. Le copie (descrizione,
 * SKU, unità di misura) servono a rendere la bolla leggibile per sempre: se fra un anno il
 * tessuto cambia codice o viene rinominato, il documento continua a dire cosa è uscito.
 */
async function componiRiga(db: Tx, r: RigaInput, ordine: number): Promise<Prisma.BollaRigaCreateWithoutBollaInput> {
  if (!(r.quantita > 0)) throw badRequest('Ogni riga deve avere una quantità maggiore di zero.')

  const base = {
    quantitaInviata: D(r.quantita),
    provenienza: (r.provenienza ?? 'magazzino') as BollaRigaProvenienza,
    lotto: r.lotto, colore: r.colore, variante: r.variante, note: r.note, ordine,
  }

  if (r.tipo === 'materiale') {
    const m = await db.material.findUnique({ where: { id: r.articoloId } })
    if (!m) throw notFound('Tessuto non trovato')
    return {
      ...base, material: { connect: { id: m.id } }, descrizione: m.nome, sku: m.codice,
      unitaMisura: m.unitaMisura, colore: r.colore ?? m.colore,
      costoUnitario: m.prezzoAlMetro, fonteCosto: 'materiale' as CostSource,
    }
  }
  if (r.tipo === 'accessorio') {
    const a = await db.accessory.findUnique({ where: { id: r.articoloId } })
    if (!a) throw notFound('Accessorio non trovato')
    return {
      ...base, accessory: { connect: { id: a.id } }, descrizione: a.nome, sku: a.codice,
      unitaMisura: a.unitaMisura, costoUnitario: a.costoUnitario,
      fonteCosto: 'materiale' as CostSource,
    }
  }
  const v = await db.productVariant.findUnique({ where: { id: r.articoloId }, include: { product: { select: { nome: true } } } })
  if (!v) throw notFound('Variante non trovata')
  // Un semilavorato si conta a pezzi: una frazione di capo non esiste.
  if (!Number.isInteger(r.quantita)) throw badRequest('I capi e i semilavorati si consegnano a pezzi interi.')
  return {
    ...base, variant: { connect: { id: v.id } },
    descrizione: `${v.product?.nome ?? 'Capo'} · ${v.taglia}/${v.colore}`,
    sku: v.sku, unitaMisura: 'pz', colore: r.colore ?? v.colore, variante: r.variante ?? v.taglia,
    costoUnitario: D(0), fonteCosto: 'stimato' as CostSource,
  }
}

/** Nuova bolla, sempre in bozza: creare un documento non muove nulla in magazzino. */
export async function creaBolla(input: BollaInput, userId: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } })
  if (!supplier) throw notFound('Lavorante non trovato')
  if (input.righe.length === 0) throw badRequest('Una bolla deve avere almeno una riga di materiale.')

  return prisma.$transaction(async (tx) => {
    const righe = await Promise.all(input.righe.map((r, i) => componiRiga(tx, r, i)))
    const creata = await tx.bollaLavorazione.create({
      data: {
        supplierId: input.supplierId,
        data: new Date(input.data),
        causale: input.causale ?? 'conto_lavorazione',
        productId: input.productId ?? null,
        technicalSheetId: input.technicalSheetId ?? null,
        commessa: input.commessa ?? null,
        orderId: input.orderId ?? null,
        quantitaAttesa: input.quantitaAttesa ?? 0,
        note: input.note ?? null,
        createdBy: userId,
        righe: { create: righe },
      },
      include: includeBolla,
    })
    await logActivity(tx, {
      userId, azione: 'crea_bolla_lavorazione', entita: 'bolla_lavorazione', entitaId: creata.id,
      valoreNuovo: `bozza per ${supplier.nome} · ${righe.length} righe`,
    })
    return decoraBolla(creata)
  })
}

/**
 * Modifica di una bolla. Una bolla **emessa non si modifica liberamente**: ha già mosso
 * giacenze e il lavorante ne ha una copia in mano. Restano scrivibili solo le note, che
 * non cambiano nessuna quantità. Per correggere il resto si annulla e si riemette, così
 * la correzione lascia una traccia invece di riscrivere la storia.
 */
export async function aggiornaBolla(id: string, input: Partial<BollaInput>, userId: string) {
  const before = await prisma.bollaLavorazione.findUnique({ where: { id }, include: { righe: true } })
  if (!before) throw notFound('Bolla non trovata')

  if (before.stato !== 'bozza') {
    const soloNote = Object.keys(input).every((k) => k === 'note')
    if (!soloNote) {
      throw conflict(
        `Questa bolla è ${before.stato}: righe, quantità e destinatario non si cambiano più. ` +
          'Annullala e riemettila, oppure registra un rientro per correggere le quantità.',
      )
    }
    const aggiornata = await prisma.bollaLavorazione.update({ where: { id }, data: { note: input.note ?? null }, include: includeBolla })
    await logActivity(prisma, { userId, azione: 'aggiorna_note_bolla', entita: 'bolla_lavorazione', entitaId: id, valoreNuovo: input.note ?? '' })
    return decoraBolla(aggiornata)
  }

  return prisma.$transaction(async (tx) => {
    // In bozza le righe si riscrivono per intero: è più semplice e più prevedibile di un
    // diff riga per riga, e non ci sono movimenti agganciati da preservare.
    if (input.righe) {
      if (input.righe.length === 0) throw badRequest('Una bolla deve avere almeno una riga di materiale.')
      await tx.bollaRiga.deleteMany({ where: { bollaId: id } })
      const righe = await Promise.all(input.righe.map((r, i) => componiRiga(tx, r, i)))
      await tx.bollaRiga.createMany({
        data: righe.map((r) => ({
          bollaId: id,
          materialId: r.material?.connect?.id ?? null,
          accessoryId: r.accessory?.connect?.id ?? null,
          variantId: r.variant?.connect?.id ?? null,
          descrizione: r.descrizione, sku: r.sku ?? null, unitaMisura: r.unitaMisura,
          lotto: r.lotto ?? null, colore: r.colore ?? null, variante: r.variante ?? null,
          note: r.note ?? null, ordine: r.ordine ?? 0,
          provenienza: r.provenienza as BollaRigaProvenienza,
          costoUnitario: r.costoUnitario as Prisma.Decimal,
          fonteCosto: r.fonteCosto as CostSource,
          quantitaInviata: r.quantitaInviata as Prisma.Decimal,
        })),
      })
    }

    const aggiornata = await tx.bollaLavorazione.update({
      where: { id },
      data: {
        supplierId: input.supplierId,
        data: input.data ? new Date(input.data) : undefined,
        causale: input.causale,
        productId: input.productId === undefined ? undefined : input.productId || null,
        technicalSheetId: input.technicalSheetId === undefined ? undefined : input.technicalSheetId || null,
        commessa: input.commessa === undefined ? undefined : input.commessa || null,
        orderId: input.orderId === undefined ? undefined : input.orderId || null,
        quantitaAttesa: input.quantitaAttesa,
        note: input.note === undefined ? undefined : input.note || null,
      },
      include: includeBolla,
    })
    await logActivity(tx, { userId, azione: 'aggiorna_bolla_lavorazione', entita: 'bolla_lavorazione', entitaId: id, valoreNuovo: 'bozza aggiornata' })
    return decoraBolla(aggiornata)
  })
}

/** Una bozza si può eliminare: non ha mosso niente. Dall'emissione in poi si annulla. */
export async function eliminaBozza(id: string, userId: string) {
  const b = await prisma.bollaLavorazione.findUnique({ where: { id } })
  if (!b) throw notFound('Bolla non trovata')
  if (b.stato !== 'bozza') throw conflict(`Questa bolla è ${b.stato}: non si elimina, si annulla.`)
  return prisma.$transaction(async (tx) => {
    await tx.bollaLavorazione.delete({ where: { id } })
    await logActivity(tx, { userId, azione: 'elimina_bozza_bolla', entita: 'bolla_lavorazione', entitaId: id, valorePrecedente: 'bozza' })
    return { id, eliminata: true }
  })
}

// ---------------------------------------------------------------------------
// Emissione
// ---------------------------------------------------------------------------

/**
 * Numero progressivo per anno, assegnato **solo all'emissione**.
 *
 * Il lock consultivo di transazione serializza due emissioni simultanee: senza, due
 * richieste che leggono lo stesso massimo produrrebbero lo stesso numero e la seconda
 * fallirebbe sul vincolo di unicità (o, peggio, in assenza di vincolo, creerebbe un
 * doppione). Il lock si rilascia da sé a fine transazione.
 */
async function prossimoNumero(tx: Tx, anno: number) {
  // Il cast a `int` è necessario: Prisma manda i numeri JavaScript come bigint, e la
  // versione a due argomenti di pg_advisory_xact_lock esiste solo per (int, int).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bolle_lavorazione_numero'), ${anno}::int)`
  const ultima = await tx.bollaLavorazione.findFirst({
    where: { anno },
    orderBy: { progressivo: 'desc' },
    select: { progressivo: true },
  })
  const progressivo = (ultima?.progressivo ?? 0) + 1
  return { progressivo, numero: `DDT-${anno}-${String(progressivo).padStart(4, '0')}` }
}

function articoloDellaRiga(r: { materialId: string | null; accessoryId: string | null; variantId: string | null }) {
  if (r.materialId) return { tipo: 'materiale' as const, id: r.materialId }
  if (r.accessoryId) return { tipo: 'accessorio' as const, id: r.accessoryId }
  if (r.variantId) return { tipo: 'variante' as const, id: r.variantId }
  return null
}

/** Riga del registro movimenti. Ogni movimento sa da quale riga di bolla è nato. */
async function registraMovimento(
  tx: Tx,
  m: {
    bollaId: string
    rigaId?: string | null
    rientroId?: string | null
    tipo: MovimentoLavorazioneTipo
    da: LavorazioneUbicazione
    a: LavorazioneUbicazione
    quantita: number
    materialId?: string | null
    accessoryId?: string | null
    variantId?: string | null
    descrizione: string
    unitaMisura: string
    costoUnitario?: number
    motivo?: string
    note?: string
    userId: string
  },
) {
  await tx.movimentoLavorazione.create({
    data: {
      bollaId: m.bollaId, rigaId: m.rigaId ?? null, rientroId: m.rientroId ?? null,
      tipo: m.tipo, da: m.da, a: m.a, quantita: D(m.quantita),
      materialId: m.materialId ?? null, accessoryId: m.accessoryId ?? null, variantId: m.variantId ?? null,
      descrizione: m.descrizione, unitaMisura: m.unitaMisura,
      costoUnitario: D(m.costoUnitario ?? 0),
      valore: D(round2(m.quantita * (m.costoUnitario ?? 0))),
      motivo: m.motivo ?? null, note: m.note ?? null, createdBy: m.userId,
    },
  })
}

/**
 * Emette la bolla: i materiali escono dal magazzino e si fermano presso il lavorante.
 *
 * Tre cose che questa funzione garantisce e che vanno lette insieme:
 *
 *  1. **Non si consegna più di quanto c'è.** Il confronto è contro il disponibile *in casa*
 *     (patrimonio meno quanto già affidato ad altri), non contro il residuo storico.
 *  2. **Una doppia conferma non fa doppio scarico.** Il passaggio bozza→emessa è un
 *     `updateMany` condizionato allo stato: la seconda richiesta aggiorna zero righe e viene
 *     respinta prima di toccare qualsiasi quantità.
 *  3. **O tutto o niente.** Documento, quantità e movimenti stanno nella stessa transazione.
 */
export async function emettiBolla(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const bolla = await tx.bollaLavorazione.findUnique({
      where: { id },
      include: { righe: { orderBy: { ordine: 'asc' } }, supplier: true },
    })
    if (!bolla) throw notFound('Bolla non trovata')
    if (bolla.stato !== 'bozza') throw conflict(`Questa bolla è già ${bolla.stato}: non può essere emessa di nuovo.`)
    if (bolla.righe.length === 0) throw badRequest('Non si può emettere una bolla senza righe di materiale.')

    // Più righe possono puntare allo stesso articolo: la disponibilità va verificata sul
    // totale richiesto, non riga per riga. Controllando riga per riga, due righe da 30 m su
    // un tessuto che ne ha 50 passerebbero entrambe.
    const richiestoPerArticolo = new Map<string, number>()
    for (const r of bolla.righe) {
      const art = articoloDellaRiga(r)
      if (!art) throw badRequest(`La riga "${r.descrizione}" non è collegata a nessun articolo dell'inventario.`)
      const chiave = `${art.tipo}:${art.id}:${r.provenienza}`
      richiestoPerArticolo.set(chiave, (richiestoPerArticolo.get(chiave) ?? 0) + Number(r.quantitaInviata))
    }

    for (const [chiave, richiesto] of richiestoPerArticolo) {
      const [tipo, articoloId, provenienza] = chiave.split(':') as [TipoArticolo, string, ProvenienzaRiga]
      await verificaEScala(tx, tipo, articoloId, richiesto, provenienza)
    }

    // Compare-and-set: solo la prima richiesta trova ancora lo stato `bozza`.
    const anno = new Date(bolla.data).getFullYear()
    const { numero, progressivo } = await prossimoNumero(tx, anno)
    const esito = await tx.bollaLavorazione.updateMany({
      where: { id, stato: 'bozza' },
      data: {
        stato: 'emessa', numero, anno, progressivo,
        emessaDa: userId, emessaIl: new Date(),
        lavoranteNome: bolla.supplier.nome,
        lavorantePartitaIva: bolla.supplier.partitaIva,
      },
    })
    if (esito.count !== 1) throw conflict('La bolla è stata emessa da un\'altra operazione un istante fa.')

    // Un movimento per riga, non per articolo: il registro deve poter risalire alla riga
    // esatta del documento, anche quando due righe muovono lo stesso tessuto.
    for (const r of bolla.righe) {
      await registraMovimento(tx, {
        bollaId: id, rigaId: r.id, tipo: 'uscita_materiale',
        da: 'magazzino', a: 'produzione_esterna', quantita: Number(r.quantitaInviata),
        materialId: r.materialId, accessoryId: r.accessoryId, variantId: r.variantId,
        descrizione: r.descrizione, unitaMisura: r.unitaMisura,
        costoUnitario: Number(r.costoUnitario),
        motivo: `Consegna a ${bolla.supplier.nome}`, note: r.note ?? undefined, userId,
      })
    }

    await logActivity(tx, {
      userId, azione: 'emetti_bolla_lavorazione', entita: 'bolla_lavorazione', entitaId: id,
      valorePrecedente: 'bozza',
      valoreNuovo: `${numero} emessa a ${bolla.supplier.nome} · ${bolla.righe.length} righe`,
    })

    const finale = await tx.bollaLavorazione.findUniqueOrThrow({ where: { id }, include: includeBolla })
    return decoraBolla(finale)
  })
}

/**
 * Toglie una quantità dal disponibile in casa e la mette "presso terzisti", rifiutando
 * l'operazione se non ce n'è abbastanza. Il patrimonio non cambia: la merce è ancora nostra.
 */
async function verificaEScala(
  tx: Tx,
  tipo: TipoArticolo,
  articoloId: string,
  richiesto: number,
  provenienza: ProvenienzaRiga,
) {
  if (tipo === 'materiale') {
    const m = await tx.material.findUnique({ where: { id: articoloId } })
    if (!m) throw notFound('Tessuto non trovato')
    const disponibile = provenienza === 'scampoli'
      ? Number(m.metriScampoli)
      : Number(m.metriAcquistati) - Number(m.metriUtilizzati) - Number(m.metriPressoTerzisti) - Number(m.metriScampoli)
    if (richiesto > disponibile + EPS) {
      throw badRequest(
        `"${m.nome}": ${provenienza === 'scampoli' ? 'scampoli disponibili' : 'disponibili'} ${round4(disponibile)} ${m.unitaMisura}, non se ne possono consegnare ${round4(richiesto)}.` +
          (Number(m.metriPressoTerzisti) > 0 ? ` (${round4(Number(m.metriPressoTerzisti))} ${m.unitaMisura} sono già presso un lavorante.)` : ''),
      )
    }
    await tx.material.update({
      where: { id: articoloId },
      data: {
        metriPressoTerzisti: { increment: D(richiesto) },
        ...(provenienza === 'scampoli' ? { metriScampoli: { decrement: D(richiesto) } } : {}),
      },
    })
    return
  }
  if (tipo === 'accessorio') {
    const a = await tx.accessory.findUnique({ where: { id: articoloId } })
    if (!a) throw notFound('Accessorio non trovato')
    const disponibile = provenienza === 'scampoli'
      ? Number(a.quantitaScampoli)
      : Number(a.quantitaAcquistata) - Number(a.quantitaUtilizzata) - Number(a.quantitaPressoTerzisti) - Number(a.quantitaScampoli)
    if (richiesto > disponibile + EPS) {
      throw badRequest(
        `"${a.nome}": ${provenienza === 'scampoli' ? 'recuperati disponibili' : 'disponibili'} ${round4(disponibile)} ${a.unitaMisura}, non se ne possono consegnare ${round4(richiesto)}.` +
          (Number(a.quantitaPressoTerzisti) > 0 ? ` (${round4(Number(a.quantitaPressoTerzisti))} sono già presso un lavorante.)` : ''),
      )
    }
    await tx.accessory.update({
      where: { id: articoloId },
      data: {
        quantitaPressoTerzisti: { increment: D(richiesto) },
        ...(provenienza === 'scampoli' ? { quantitaScampoli: { decrement: D(richiesto) } } : {}),
      },
    })
    return
  }

  const rec = await tx.inventoryRecord.findUnique({ where: { variantId: articoloId }, include: { variant: true } })
  if (!rec) throw notFound('Questa variante non ha un record di inventario: non se ne può consegnare.')
  const disponibile = provenienza === 'scampoli' ? rec.qtaScampoli : rec.qtaMagazzino
  if (richiesto > disponibile) {
    throw badRequest(`"${rec.variant.sku}": ${provenienza === 'scampoli' ? 'recuperati' : 'in magazzino'} ci sono ${disponibile} pezzi, non se ne possono consegnare ${richiesto}.`)
  }
  await applicaVariante(tx, articoloId, {
    magazzino: provenienza === 'magazzino' ? -richiesto : 0,
    scampoli: provenienza === 'scampoli' ? -richiesto : 0,
    pressoTerzisti: richiesto,
  })
}

/**
 * Sposta le quantità di una variante e tiene allineata la variante al suo record, come fa
 * il resto dell'inventario (FR-03/FR-INV-01). `qtaPressoTerzisti` non entra nel disponibile:
 * un capo che sta dal lavorante non si vende.
 */
async function applicaVariante(
  tx: Tx,
  variantId: string,
  delta: { magazzino?: number; pressoTerzisti?: number; scampoli?: number },
) {
  const rec = await tx.inventoryRecord.findUnique({ where: { variantId } })
  if (!rec) throw notFound('Record di inventario non trovato per questa variante')
  const qtaMagazzino = rec.qtaMagazzino + (delta.magazzino ?? 0)
  const qtaPressoTerzisti = rec.qtaPressoTerzisti + (delta.pressoTerzisti ?? 0)
  const qtaScampoli = rec.qtaScampoli + (delta.scampoli ?? 0)
  if (qtaMagazzino < 0 || qtaPressoTerzisti < 0 || qtaScampoli < 0) {
    throw badRequest('L\'operazione porterebbe una giacenza sotto zero.')
  }
  const calcolo = calcolaDisponibilita({ ...rec, qtaMagazzino })
  await tx.inventoryRecord.update({
    where: { variantId },
    data: { qtaMagazzino, qtaPressoTerzisti, qtaScampoli, stato: calcolo.stato, divergenzaShopify: calcolo.divergenzaShopify },
  })
  await tx.productVariant.update({
    where: { id: variantId },
    data: { stockDisponibile: calcolo.disponibileTotale, statoDisponibilita: calcolo.stato },
  })
}

// ---------------------------------------------------------------------------
// Rientro dal lavorante
// ---------------------------------------------------------------------------

export interface RientroRigaInput {
  rigaId: string
  utilizzata?: number
  restituita?: number
  scartoRecuperato?: number
  scartoPerso?: number
  note?: string
}

export interface RientroCapoInput {
  variantId: string
  quantita: number
  note?: string
}

export interface RientroInput {
  data: string
  numeroDocumentoLavorante?: string
  note?: string
  /** Facoltativo: un rientro può contenere solo capi finiti e nessun movimento di materiale. */
  righe?: RientroRigaInput[]
  capi?: RientroCapoInput[]
  allegato?: { nome: string; dataUrl: string }
}

/**
 * Registra un rientro. È l'operazione che decide il destino di ciò che era uscito:
 *
 *   restituito → torna disponibile in magazzino (esce da "presso terzisti", il patrimonio non cambia)
 *   utilizzato → finito dentro il capo: esce dal patrimonio, con causale "consumo"
 *   recuperato → torna nella riserva scampoli: resta patrimonio, ma non si confonde con
 *                materiale integro disponibile per un taglio completo
 *   perso      → esce dal patrimonio, con costo separato dal consumo utile
 *
 * I capi finiti ricevuti entrano nell'inventario prodotti finiti.
 *
 * Rientri parziali e multipli sono la norma: la bolla passa a `parzialmente_rientrata` e
 * ci resta finché qualcosa è ancora fuori. Il doppio rientro è impedito dal vincolo che la
 * somma dei rientri di una riga non superi mai quanto era stato consegnato.
 */
export async function registraRientro(bollaId: string, input: RientroInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const bolla = await tx.bollaLavorazione.findUnique({
      where: { id: bollaId },
      include: { righe: true, supplier: { select: { nome: true } } },
    })
    if (!bolla) throw notFound('Bolla non trovata')
    if (bolla.stato !== 'emessa' && bolla.stato !== 'parzialmente_rientrata') {
      throw conflict(
        bolla.stato === 'bozza'
          ? 'Questa bolla è ancora una bozza: emettila prima di registrare un rientro.'
          : `Questa bolla è ${bolla.stato}: non accetta altri rientri.`,
      )
    }

    const perId = new Map(bolla.righe.map((r) => [r.id, r]))
    const righeValide = (input.righe ?? []).filter(
      (r) =>
        (r.utilizzata ?? 0) > 0 || (r.restituita ?? 0) > 0 ||
        (r.scartoRecuperato ?? 0) > 0 || (r.scartoPerso ?? 0) > 0,
    )
    if (righeValide.length === 0 && (input.capi ?? []).length === 0) {
      throw badRequest('Il rientro è vuoto: indica almeno una quantità o un capo ricevuto.')
    }

    // Validazione completa PRIMA di scrivere qualsiasi cosa: un rientro sbagliato deve
    // essere respinto intero, non a metà.
    for (const r of righeValide) {
      const riga = perId.get(r.rigaId)
      if (!riga) throw badRequest('Una delle righe indicate non appartiene a questa bolla.')
      const u = r.utilizzata ?? 0
      const res = r.restituita ?? 0
      const rec = r.scartoRecuperato ?? 0
      const perso = r.scartoPerso ?? 0
      if (u < 0 || res < 0 || rec < 0 || perso < 0) throw badRequest('Le quantità di rientro non possono essere negative.')

      const giaRientrata =
        Number(riga.quantitaUtilizzata) + Number(riga.quantitaRestituita) +
        Number(riga.quantitaScartoRecuperato) + Number(riga.quantitaScartoPerso)
      const ancoraFuori = Number(riga.quantitaInviata) - giaRientrata
      const totale = u + res + rec + perso
      if (totale > ancoraFuori + EPS) {
        throw badRequest(
          `"${riga.descrizione}": presso il lavorante ci sono ancora ${round4(ancoraFuori)} ${riga.unitaMisura}, ` +
            `non se ne possono registrare ${round4(totale)}.`,
        )
      }
      if (riga.variantId && ![u, res, rec, perso].every(Number.isInteger)) {
        throw badRequest(`"${riga.descrizione}": i capi si contano a pezzi interi.`)
      }
    }

    for (const c of input.capi ?? []) {
      if (!Number.isInteger(c.quantita) || c.quantita <= 0) throw badRequest('La quantità dei capi rientrati deve essere un intero maggiore di zero.')
    }

    const rientro = await tx.bollaRientro.create({
      data: {
        bollaId,
        data: new Date(input.data),
        numeroDocumentoLavorante: input.numeroDocumentoLavorante ?? null,
        note: input.note ?? null,
        createdBy: userId,
      },
    })

    if (input.allegato) {
      await tx.bollaAllegato.create({
        data: { bollaId, rientroId: rientro.id, nome: input.allegato.nome, dataUrl: input.allegato.dataUrl, createdBy: userId },
      })
    }

    for (const r of righeValide) {
      const riga = perId.get(r.rigaId)!
      const u = r.utilizzata ?? 0
      const res = r.restituita ?? 0
      const rec = r.scartoRecuperato ?? 0
      const perso = r.scartoPerso ?? 0

      await tx.bollaRientroRiga.create({
        data: {
          rientroId: rientro.id, rigaId: riga.id,
          quantitaUtilizzata: D(u), quantitaRestituita: D(res),
          quantitaScartoRecuperato: D(rec), quantitaScartoPerso: D(perso),
          note: r.note ?? null,
        },
      })
      await tx.bollaRiga.update({
        where: { id: riga.id },
        data: {
          quantitaUtilizzata: { increment: D(u) },
          quantitaRestituita: { increment: D(res) },
          quantitaScartoRecuperato: { increment: D(rec) },
          quantitaScartoPerso: { increment: D(perso) },
        },
      })

      const art = articoloDellaRiga(riga)!
      if (res > 0) {
        await scaricaPressoTerzisti(tx, art, res, {
          destinazione: riga.provenienza === 'scampoli' ? 'scampoli' : 'magazzino',
        })
      }
      if (u > 0) await scaricaPressoTerzisti(tx, art, u, { destinazione: 'consumato' })
      if (rec > 0) await scaricaPressoTerzisti(tx, art, rec, { destinazione: 'scampoli' })
      if (perso > 0) await scaricaPressoTerzisti(tx, art, perso, { destinazione: 'scarto' })

      const comune = {
        bollaId, rigaId: riga.id, rientroId: rientro.id,
        materialId: riga.materialId, accessoryId: riga.accessoryId, variantId: riga.variantId,
        descrizione: riga.descrizione, unitaMisura: riga.unitaMisura,
        costoUnitario: Number(riga.costoUnitario), userId,
      }
      if (res > 0) {
        const tornaA = riga.provenienza === 'scampoli' ? 'scampoli' : 'magazzino'
        await registraMovimento(tx, {
          ...comune, tipo: 'rientro_inutilizzato', da: 'produzione_esterna', a: tornaA,
          quantita: res,
          motivo: tornaA === 'scampoli' ? 'Scampolo inutilizzato restituito' : 'Materiale inutilizzato restituito',
          note: r.note ?? undefined,
        })
      }
      if (u > 0) {
        await registraMovimento(tx, { ...comune, tipo: 'consumo', da: 'produzione_esterna', a: 'consumato', quantita: u, motivo: 'Consumato nella lavorazione', note: r.note ?? undefined })
      }
      if (rec > 0) {
        await registraMovimento(tx, { ...comune, tipo: 'scarto_recuperato', da: 'produzione_esterna', a: 'scampoli', quantita: rec, motivo: 'Scarto recuperabile rientrato come scampolo', note: r.note ?? undefined })
      }
      if (perso > 0) {
        await registraMovimento(tx, { ...comune, tipo: 'scarto', da: 'produzione_esterna', a: 'scarto', quantita: perso, motivo: 'Scarto perso in lavorazione', note: r.note ?? undefined })
      }
    }

    // Capi finiti ricevuti: entrano nell'inventario prodotti finiti, in magazzino.
    for (const c of input.capi ?? []) {
      const variante = await tx.productVariant.findUnique({ where: { id: c.variantId }, include: { product: { select: { nome: true } } } })
      if (!variante) throw notFound('Variante del capo rientrato non trovata')

      await tx.bollaRientroCapo.create({
        data: {
          rientroId: rientro.id, variantId: c.variantId, sku: variante.sku,
          taglia: variante.taglia, colore: variante.colore, quantita: c.quantita, note: c.note ?? null,
        },
      })
      await caricaCapoFinito(tx, c.variantId, c.quantita, userId)
      await registraMovimento(tx, {
        bollaId, rientroId: rientro.id, tipo: 'carico_finiti',
        da: 'produzione_esterna', a: 'magazzino', quantita: c.quantita,
        variantId: c.variantId,
        descrizione: `${variante.product?.nome ?? 'Capo'} · ${variante.taglia}/${variante.colore}`,
        unitaMisura: 'pz', motivo: `Capi finiti da ${bolla.supplier.nome}`, note: c.note ?? undefined, userId,
      })
    }

    // Stato: resta aperta finché qualcosa è ancora dal lavorante. Non si chiude da sola
    // nemmeno quando tutto torna — la chiusura è un atto di qualcuno, che si prende la
    // responsabilità di dire "questa lavorazione è finita".
    const righeDopo = await tx.bollaRiga.findMany({ where: { bollaId } })
    const ancoraFuori = righeDopo.reduce(
      (s, r) => s + (
        Number(r.quantitaInviata) - Number(r.quantitaUtilizzata) - Number(r.quantitaRestituita) -
        Number(r.quantitaScartoRecuperato) - Number(r.quantitaScartoPerso)
      ),
      0,
    )
    if (bolla.stato === 'emessa') {
      await tx.bollaLavorazione.update({ where: { id: bollaId }, data: { stato: 'parzialmente_rientrata' } })
    }

    await logActivity(tx, {
      userId, azione: 'registra_rientro_lavorazione', entita: 'bolla_lavorazione', entitaId: bollaId,
      valoreNuovo:
        `rientro del ${input.data}${input.numeroDocumentoLavorante ? ` (DDT ${input.numeroDocumentoLavorante})` : ''}: ` +
        `${righeValide.length} righe, ${(input.capi ?? []).reduce((s, c) => s + c.quantita, 0)} capi · ` +
        `ancora fuori ${round4(ancoraFuori)}`,
    })

    const finale = await tx.bollaLavorazione.findUniqueOrThrow({ where: { id: bollaId }, include: includeBolla })
    return decoraBolla(finale)
  })
}

/**
 * Toglie una quantità da "presso terzisti" e la porta alla destinazione reale. Magazzino
 * e scampoli restano patrimonio; consumo e scarto perso incrementano invece l'utilizzato.
 */
async function scaricaPressoTerzisti(
  tx: Tx,
  art: { tipo: TipoArticolo; id: string },
  quantita: number,
  opt: { destinazione: 'magazzino' | 'scampoli' | 'consumato' | 'scarto' },
) {
  const esceDalPatrimonio = opt.destinazione === 'consumato' || opt.destinazione === 'scarto'
  if (art.tipo === 'materiale') {
    const m = await tx.material.update({
      where: { id: art.id },
      data: {
        metriPressoTerzisti: { decrement: D(quantita) },
        ...(opt.destinazione === 'scampoli' ? { metriScampoli: { increment: D(quantita) } } : {}),
        ...(esceDalPatrimonio ? { metriUtilizzati: { increment: D(quantita) } } : {}),
      },
    })
    const residuo = Number(m.metriAcquistati) - Number(m.metriUtilizzati)
    await tx.material.update({ where: { id: art.id }, data: { stato: derivaStato(residuo, Number(m.sogliaMinima), m.stato) } })
    return
  }
  if (art.tipo === 'accessorio') {
    const a = await tx.accessory.update({
      where: { id: art.id },
      data: {
        quantitaPressoTerzisti: { decrement: D(quantita) },
        ...(opt.destinazione === 'scampoli' ? { quantitaScampoli: { increment: D(quantita) } } : {}),
        ...(esceDalPatrimonio ? { quantitaUtilizzata: { increment: D(quantita) } } : {}),
      },
    })
    const residuo = Number(a.quantitaAcquistata) - Number(a.quantitaUtilizzata)
    await tx.accessory.update({ where: { id: art.id }, data: { stato: derivaStato(residuo, Number(a.sogliaMinima), a.stato) } })
    return
  }
  // Per i semilavorati la riserva recuperi è separata come per tessuti e accessori.
  await applicaVariante(tx, art.id, {
    pressoTerzisti: -quantita,
    magazzino: opt.destinazione === 'magazzino' ? quantita : 0,
    scampoli: opt.destinazione === 'scampoli' ? quantita : 0,
  })
}

/**
 * Carica capi finiti in magazzino e ne lascia traccia anche in `inventory_movements`,
 * il registro che la scheda della variante già mostra: chi guarda lì deve vedere il carico
 * senza dover sapere che esiste una bolla.
 */
async function caricaCapoFinito(tx: Tx, variantId: string, quantita: number, userId: string) {
  const rec = await tx.inventoryRecord.findUnique({ where: { variantId } })
  if (!rec) throw notFound('Questa variante non ha un record di inventario: non ci si possono caricare capi.')

  const qtaMagazzino = rec.qtaMagazzino + quantita
  const calcolo = calcolaDisponibilita({ ...rec, qtaMagazzino })
  await tx.inventoryRecord.update({
    where: { variantId },
    data: {
      qtaMagazzino,
      stato: calcolo.stato,
      divergenzaShopify: calcolo.divergenzaShopify,
      // Se la variante è ancora in distribuzione iniziale, il totale dichiarato deve
      // crescere con i capi che arrivano: sono capi nuovi, mai contati prima.
      ...(rec.migrazioneCompletata || rec.totaleMigrazione === null
        ? {}
        : { totaleMigrazione: rec.totaleMigrazione + quantita }),
    },
  })
  await tx.productVariant.update({
    where: { id: variantId },
    data: { stockDisponibile: calcolo.disponibileTotale, statoDisponibilita: calcolo.stato },
  })

  const ext = await tx.inventoryLocation.upsert({
    where: { codice: 'EXT' },
    update: {},
    create: { codice: 'EXT', nome: 'Presso lavoranti', tipo: 'produzione_esterna' },
  })
  const mag = await tx.inventoryLocation.upsert({
    where: { codice: 'MAG' },
    update: {},
    create: { codice: 'MAG', nome: 'Magazzino', tipo: 'magazzino' },
  })
  await tx.inventoryMovement.create({
    data: {
      variantId, tipo: 'carico', quantita,
      locationFromId: ext.id, locationToId: mag.id,
      createdBy: userId, motivo: 'Capi finiti da lavorazione esterna',
    },
  })
}

// ---------------------------------------------------------------------------
// Chiusura e annullamento
// ---------------------------------------------------------------------------

/**
 * Chiude la lavorazione. Passa solo se tutto quadra — ogni riga a zero presso il lavorante.
 *
 * Quando non quadra, la chiusura resta possibile ma diventa un atto esplicito: serve il
 * ruolo giusto (admin o CEO) e una motivazione scritta, e la bolla resta marcata
 * `chiusaConDifferenza`. Il senso è che una differenza va decisa da qualcuno e deve
 * restare leggibile dopo, non sparire dentro una chiusura come tutte le altre.
 *
 * Nota: le quantità ancora fuori **non** vengono riportate in magazzino d'ufficio. Non
 * sono tornate: dichiararle rientrate sarebbe scrivere in inventario merce che non c'è.
 */
export async function chiudiBolla(
  id: string,
  input: { forzaDifferenza?: boolean; note?: string },
  utente: { id: string; role: string },
) {
  return prisma.$transaction(async (tx) => {
    const bolla = await tx.bollaLavorazione.findUnique({ where: { id }, include: { righe: true } })
    if (!bolla) throw notFound('Bolla non trovata')
    if (bolla.stato !== 'emessa' && bolla.stato !== 'parzialmente_rientrata') {
      throw conflict(`Questa bolla è ${bolla.stato}: non c'è niente da chiudere.`)
    }

    const fuori = bolla.righe
      .map((r) => ({
        descrizione: r.descrizione,
        unitaMisura: r.unitaMisura,
        residuo:
          Number(r.quantitaInviata) - Number(r.quantitaUtilizzata) - Number(r.quantitaRestituita) -
          Number(r.quantitaScartoRecuperato) - Number(r.quantitaScartoPerso),
      }))
      .filter((r) => Math.abs(r.residuo) > EPS)

    if (fuori.length > 0) {
      if (!input.forzaDifferenza) {
        throw badRequest(
          'La lavorazione non è riconciliata: ' +
            fuori.map((r) => `${r.descrizione} ${round4(r.residuo)} ${r.unitaMisura}`).join(', ') +
            '. Registra il rientro mancante, oppure chiudila dichiarando la differenza.',
        )
      }
      if (utente.role !== 'admin' && utente.role !== 'ceo') {
        throw forbidden('Chiudere una lavorazione con quantità ancora fuori è riservato ad Admin e CEO.')
      }
      if (!input.note?.trim()) {
        throw badRequest('Per chiudere con una differenza serve una motivazione scritta: resta nello storico.')
      }
    }

    const esito = await tx.bollaLavorazione.updateMany({
      where: { id, stato: { in: ['emessa', 'parzialmente_rientrata'] } },
      data: {
        stato: 'chiusa', chiusaDa: utente.id, chiusaIl: new Date(),
        chiusaConDifferenza: fuori.length > 0,
        differenzaNote: fuori.length > 0 ? input.note!.trim() : null,
      },
    })
    if (esito.count !== 1) throw conflict('La bolla è stata chiusa da un\'altra operazione un istante fa.')

    await logActivity(tx, {
      userId: utente.id, azione: 'chiudi_bolla_lavorazione', entita: 'bolla_lavorazione', entitaId: id,
      valorePrecedente: bolla.stato,
      valoreNuovo:
        fuori.length === 0
          ? 'chiusa, tutte le quantità riconciliate'
          : `chiusa con differenza (${fuori.map((r) => `${r.descrizione} ${round4(r.residuo)} ${r.unitaMisura}`).join(', ')}) — ${input.note!.trim()}`,
    })

    const finale = await tx.bollaLavorazione.findUniqueOrThrow({ where: { id }, include: includeBolla })
    return decoraBolla(finale)
  })
}

/**
 * Annulla la bolla e riporta indietro le quantità.
 *
 * L'annullamento è ammesso solo finché è ancora reversibile: da bozza (non ha mosso nulla)
 * o da emessa **senza alcun rientro registrato**. Con un rientro già registrato parte del
 * materiale è stato consumato o è già rientrato, e "ripristinare" significherebbe rimettere
 * in magazzino metri che non esistono più. In quel caso la strada è chiudere con differenza.
 *
 * Lo storno non cancella i movimenti di uscita: ne aggiunge di opposti. Il registro
 * racconta cosa è successo, compreso l'errore.
 */
export async function annullaBolla(id: string, motivo: string | undefined, userId: string) {
  return prisma.$transaction(async (tx) => {
    const bolla = await tx.bollaLavorazione.findUnique({
      where: { id },
      include: { righe: true, rientri: { select: { id: true } }, supplier: { select: { nome: true } } },
    })
    if (!bolla) throw notFound('Bolla non trovata')
    if (bolla.stato === 'annullata') throw conflict('Questa bolla è già annullata.')
    if (bolla.stato === 'chiusa') throw conflict('Una bolla chiusa non si annulla: la lavorazione è conclusa.')
    if (bolla.rientri.length > 0) {
      throw conflict(
        'Su questa bolla ci sono già dei rientri: annullarla rimetterebbe in magazzino materiale ' +
          'che è stato consumato o è già tornato. Chiudila dichiarando la differenza.',
      )
    }

    const esito = await tx.bollaLavorazione.updateMany({
      where: { id, stato: { in: ['bozza', 'emessa'] } },
      data: { stato: 'annullata', annullataIl: new Date() },
    })
    if (esito.count !== 1) throw conflict('La bolla è stata modificata da un\'altra operazione un istante fa.')

    // Solo una bolla emessa ha quantità da restituire: una bozza non ne aveva mosse.
    if (bolla.stato === 'emessa') {
      for (const r of bolla.righe) {
        const art = articoloDellaRiga(r)
        if (!art) continue
        const q = Number(r.quantitaInviata)
        if (q <= 0) continue
        const tornaA = r.provenienza === 'scampoli' ? 'scampoli' : 'magazzino'
        await scaricaPressoTerzisti(tx, art, q, { destinazione: tornaA })
        await registraMovimento(tx, {
          bollaId: id, rigaId: r.id, tipo: 'storno_uscita',
          da: 'produzione_esterna', a: tornaA, quantita: q,
          materialId: r.materialId, accessoryId: r.accessoryId, variantId: r.variantId,
          descrizione: r.descrizione, unitaMisura: r.unitaMisura, costoUnitario: Number(r.costoUnitario),
          motivo: 'Storno per annullamento della bolla', note: motivo, userId,
        })
      }
    }

    await logActivity(tx, {
      userId, azione: 'annulla_bolla_lavorazione', entita: 'bolla_lavorazione', entitaId: id,
      valorePrecedente: bolla.stato,
      valoreNuovo: `annullata${motivo ? `: ${motivo}` : ''}${bolla.stato === 'emessa' ? ' · quantità ristornate nella riserva originaria' : ''}`,
    })

    const finale = await tx.bollaLavorazione.findUniqueOrThrow({ where: { id }, include: includeBolla })
    return decoraBolla(finale)
  })
}

// ---------------------------------------------------------------------------
// Allegati
// ---------------------------------------------------------------------------

export async function aggiungiAllegato(
  bollaId: string,
  input: { nome: string; dataUrl: string; rientroId?: string },
  userId: string,
) {
  const bolla = await prisma.bollaLavorazione.findUnique({ where: { id: bollaId } })
  if (!bolla) throw notFound('Bolla non trovata')
  if (input.rientroId) {
    const r = await prisma.bollaRientro.findUnique({ where: { id: input.rientroId } })
    if (!r || r.bollaId !== bollaId) throw badRequest('Il rientro indicato non appartiene a questa bolla.')
  }
  return prisma.$transaction(async (tx) => {
    const creato = await tx.bollaAllegato.create({
      data: { bollaId, rientroId: input.rientroId ?? null, nome: input.nome, dataUrl: input.dataUrl, createdBy: userId },
      select: { id: true, nome: true, caricatoIl: true, rientroId: true },
    })
    await logActivity(tx, {
      userId, azione: 'allega_documento_bolla', entita: 'bolla_lavorazione', entitaId: bollaId,
      valoreNuovo: input.nome,
    })
    return creato
  })
}

export async function eliminaAllegato(id: string, userId: string) {
  const a = await prisma.bollaAllegato.findUnique({ where: { id } })
  if (!a) throw notFound('Allegato non trovato')
  return prisma.$transaction(async (tx) => {
    await tx.bollaAllegato.delete({ where: { id } })
    await logActivity(tx, { userId, azione: 'elimina_allegato_bolla', entita: 'bolla_lavorazione', entitaId: a.bollaId, valorePrecedente: a.nome })
    return { id, eliminato: true }
  })
}

// ---------------------------------------------------------------------------
// Vista di sintesi: cosa c'è in giro adesso
// ---------------------------------------------------------------------------

/**
 * Tutto il materiale attualmente presso lavoranti, raggruppato per articolo e con il
 * dettaglio di chi ce l'ha. Risponde alla domanda che prima non aveva risposta:
 * "quanto di questo tessuto è fuori, e da chi?".
 */
export async function riepilogoPressoLavoranti() {
  const righe = await prisma.bollaRiga.findMany({
    where: { bolla: { stato: { in: ['emessa', 'parzialmente_rientrata'] } } },
    include: { bolla: { select: { id: true, numero: true, data: true, supplier: { select: { id: true, nome: true } } } } },
  })

  const perArticolo = new Map<string, {
    chiave: string; descrizione: string; sku: string | null; unitaMisura: string; totale: number
    dettaglio: { bollaId: string; numero: string | null; lavorante: string; quantita: number; data: Date }[]
  }>()

  for (const r of righe) {
    const residuo =
      Number(r.quantitaInviata) - Number(r.quantitaUtilizzata) - Number(r.quantitaRestituita) -
      Number(r.quantitaScartoRecuperato) - Number(r.quantitaScartoPerso)
    if (residuo <= EPS) continue
    const chiave = r.materialId ?? r.accessoryId ?? r.variantId ?? r.id
    const voce = perArticolo.get(chiave) ?? {
      chiave, descrizione: r.descrizione, sku: r.sku, unitaMisura: r.unitaMisura, totale: 0, dettaglio: [],
    }
    voce.totale = round4(voce.totale + residuo)
    voce.dettaglio.push({
      bollaId: r.bolla.id, numero: r.bolla.numero, lavorante: r.bolla.supplier.nome,
      quantita: round4(residuo), data: r.bolla.data,
    })
    perArticolo.set(chiave, voce)
  }

  return [...perArticolo.values()].sort((a, b) => a.descrizione.localeCompare(b.descrizione, 'it'))
}
