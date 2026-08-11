import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { authenticate, requireModule, requireEdit, requireRole } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import {
  checkProductDeletion, createProduct, createVariant, deleteProduct, getProduct, listProducts,
  updateProduct, updateVariantQuantities,
} from './service.js'
import {
  addCostSnapshot, addPhoto, createTechnicalSheet, getTechnicalSheet, listAllTechnicalSheets,
  listTechnicalSheets, removePhoto, updateTechnicalSheet,
} from './technicalSheets.js'
import {
  addPatternDocumentNote, createPatternDocument, deletePatternDocument,
  listPatternDocuments, updatePatternDocumentStato,
} from './patternDocuments.js'

const createSchema = z.object({
  nome: z.string().min(1),
  codiceProdotto: z.string().min(1),
  linea: z.enum(['tessile', 'maglieria']),
  categoria: z.string().optional(),
  collezione: z.string().optional(),
  stagione: z.string().optional(),
  prezzoVendita: z.number().nonnegative().optional(),
  prezzoNettoIva: z.number().nonnegative().optional(),
  // Attributi commerciali che decidono la vista cliente (spec 2026-08-06, DEC-044):
  // si impostano già alla creazione, non solo in modifica.
  visibileShowroom: z.boolean().optional(),
  personalizzabileSuMisura: z.boolean().optional(),
})

// Query param delle liste validati come il body: valori fuori enum -> 400 (non 500 da Prisma).
const PRODUCT_STAGES = [
  'idea', 'concept', 'sviluppo_modello', 'scelta_tessuto', 'scelta_accessori', 'prototipo',
  'campionario', 'produzione', 'foto_contenuti', 'scheda_ecommerce', 'pubblicato_shopify',
  'in_vendita', 'archivio',
] as const

// Campi modificabili dal dettaglio prodotto (EditProductForm nel prototipo). Più ampi di
// quelli di creazione: qui si impostano prezzi, taglie/colori, testi e flag di visibilità.
const updateSchema = createSchema.partial().omit({ codiceProdotto: true }).extend({
  stato: z.enum(PRODUCT_STAGES).optional(),
  vestibilita: z.string().optional(),
  taglieDisponibili: z.array(z.string()).optional(),
  coloriDisponibili: z.array(z.string()).optional(),
  immaginiUrl: z.array(z.string().url()).optional(),
  prezzoShowroom: z.number().nonnegative().optional(),
  prezzoConsigliato: z.number().nonnegative().optional(),
  descrizioneBreve: z.string().optional(),
  descrizioneEcommerce: z.string().optional(),
  descrizioneTecnica: z.string().optional(),
  consigliCura: z.string().optional(),
  disponibilitaOnline: z.boolean().optional(),
  disponibilitaShowroom: z.boolean().optional(),
  tempiRealizzazione: z.string().max(120).optional(),
  statoPubblicazioneShopify: z.enum(['non_pubblicato', 'bozza', 'pubblicato']).optional(),
})
const listQuerySchema = z.object({
  stato: z.enum(PRODUCT_STAGES).optional(),
  linea: z.enum(['tessile', 'maglieria']).optional(),
  q: z.string().optional(),
})

const variantCreateSchema = z.object({
  sku: z.string().min(1),
  taglia: z.string().min(1),
  colore: z.string().min(1),
  stockIniziale: z.number().int().nonnegative(),
  sogliaMinima: z.number().int().nonnegative(),
  immagineUrl: z.string().url().optional(),
})

const variantQuantitiesSchema = z.object({
  qtaMagazzino: z.number().int().nonnegative().optional(),
  qtaLaboratorio: z.number().int().nonnegative().optional(),
  qtaRiservata: z.number().int().nonnegative().optional(),
  sogliaMinima: z.number().int().nonnegative().optional(),
  sogliaMinimaLaboratorio: z.number().int().nonnegative().optional(),
})

const technicalSheetCreateSchema = z.object({
  versione: z.enum(['preliminare', 'piazzamento', 'finale']),
  composizioneCompleta: z.string().optional(),
  pesoCapoGrammi: z.number().nonnegative().optional(),
  lavorazione: z.string().optional(),
  trattamenti: z.string().optional(),
  lavaggioConsigliato: z.string().optional(),
  noteProduzione: z.string().optional(),
  difficoltaProduttiva: z.enum(['bassa', 'media', 'alta']).optional(),
  tempiStimatiOre: z.number().nonnegative().optional(),
  costoManodopera: z.number().nonnegative().optional(),
  costoTessuto: z.number().nonnegative().optional(),
  costoAccessori: z.number().nonnegative().optional(),
  costoPackaging: z.number().nonnegative().optional(),
  altriCostiDiretti: z.number().nonnegative().optional(),
  altriCostiIndiretti: z.number().nonnegative().optional(),
  archiviata: z.boolean().optional(),
  pdfUrl: z.string().url().optional(),
  // --- Scheda strutturata (estensione 2026-07-30) ---
  statoScheda: z.enum(['bozza', 'in_revisione', 'approvata', 'archiviata']).optional(),
  nomeProdotto: z.string().optional(),
  codiceProdotto: z.string().optional(),
  collezione: z.string().optional(),
  categoria: z.string().optional(),
  descrizioneTecnica: z.string().optional(),
  taglieDisponibili: z.array(z.string()).optional(),
  misureVestibilita: z.string().optional(),
  istruzioniConfezione: z.string().optional(),
  noteTecniche: z.string().optional(),
  // `null` permette di correggere una scelta precedente tornando a "Nessuno".
  fornitoreLaboratorioId: z.string().uuid().nullable().optional(),
  quantitaPrevistaProduzione: z.number().int().positive().optional(),
  noteVersione: z.string().optional(),
  pdfFileNome: z.string().optional(),
  pdfFileDataUrl: z.string().optional(),
  pdfFileCaricatoIl: z.string().optional(),
  scanAiAnalizzatoIl: z.string().optional(),
  scanAiNomeFile: z.string().optional(),
  scanAiNote: z.string().optional(),
  scanAiAffidabilita: z.enum(['alta', 'media', 'bassa']).optional(),
  scanAiVociEstratte: z.number().int().nonnegative().optional(),
})

const fonteCostoEnum = z.enum(['fattura', 'materiale', 'fornitore', 'manuale', 'stimato', 'ai'])

const rigaMaterialeSchema = z.object({
  materialId: z.string().uuid().optional(),
  accessoryId: z.string().uuid().optional(),
  descrizione: z.string(),
  unitaMisura: z.string(),
  quantitaSuggerita: z.number().nonnegative().optional(),
  quantitaConfermata: z.number().nonnegative().optional(),
  percentualeScarto: z.number().min(0).max(100).optional(),
  supplierId: z.string().uuid().optional(),
  fattureCollegateIds: z.array(z.string().uuid()).optional(),
  costoUnitario: z.number().nonnegative().optional(),
  fonteCosto: fonteCostoEnum.optional(),
  fatturaCostoId: z.string().uuid().optional(),
})

const rigaCostoSchema = z.object({
  voce: z.enum([
    'accessori', 'lavorazioni', 'taglio', 'confezione', 'ricamo_stampa', 'sviluppo_modello',
    'disegno', 'scheda_tecnica', 'prototipazione', 'logistica', 'altro',
  ]),
  label: z.string(),
  importo: z.number().optional(),
  kind: z.enum(['diretto', 'sviluppo_ammortizzato']).optional(),
  fonte: fonteCostoEnum.optional(),
  fatturaId: z.string().uuid().optional(),
  ammortizzabile: z.boolean().optional(),
  quantitaPrevista: z.number().int().positive().optional(),
})

const misuraSchema = z.object({
  nome: z.string().min(1),
  valore: z.number().nonnegative().optional(),
  unita: z.enum(['cm', 'mm', 'in']).optional(),
  tagliaRiferimento: z.string().max(30).optional(),
  tolleranza: z.string().max(60).optional(),
  nota: z.string().max(500).optional(),
  fonte: fonteCostoEnum.optional(),
})

// Le foto sono data URL base64: un limite di dimensione evita di gonfiare database e backup.
const MAX_FOTO_BYTES = 3 * 1024 * 1024
const photoSchema = z.object({
  nome: z.string().min(1),
  dataUrl: z.string().min(1).refine((v) => v.length <= MAX_FOTO_BYTES, {
    message: 'Immagine troppo grande (massimo ~3 MB): comprimila prima di caricarla',
  }),
})

const costSnapshotSchema = z.object({
  motivo: z.string().min(1),
  costoMaterialiUnitario: z.number().nonnegative(),
  costoTotaleUnitario: z.number().nonnegative(),
  prezzoBreakEven: z.number().nonnegative(),
})

// Il form salva una correzione completa in una sola transazione: campi, collezioni,
// differenza delle foto e fotografia dei costi devono riuscire o fallire insieme.
const technicalSheetUpdateSchema = technicalSheetCreateSchema.partial().extend({
  righeMateriali: z.array(rigaMaterialeSchema).optional(),
  righeCosti: z.array(rigaCostoSchema).optional(),
  misure: z.array(misuraSchema).optional(),
  fotoDaAggiungere: z.array(photoSchema).optional(),
  fotoDaRimuovereIds: z.array(z.string().uuid()).optional(),
  snapshotCosto: costSnapshotSchema.optional(),
})

// I documenti delle modelliste sono PDF in data URL base64: stesso limite delle foto,
// alzato a 10 MB perché un cartamodello o un piazzamento pesa più di una fotografia.
const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024
const patternDocumentSchema = z.object({
  fileName: z.string().min(1),
  dataUrl: z.string().min(1).refine((v) => v.length <= MAX_DOCUMENTO_BYTES, {
    message: 'Documento troppo grande (massimo ~10 MB)',
  }),
  tipologia: z.enum([
    'cartamodello', 'scheda_misure', 'revisione_modellista', 'piazzamento', 'documento_taglio', 'altro',
  ]),
  versione: z.string().max(20).optional(),
  autore: z.string().max(120).optional(),
})

const patternStatoSchema = z.object({
  statoApprovazione: z.enum(['in_attesa', 'approvato', 'rifiutato', 'richiede_revisione']),
})

const patternNotaSchema = z.object({
  testo: z.string().min(1).max(2000),
  tipo: z.enum([
    'commento', 'correzione', 'problema', 'modifica_misure',
    'indicazione_taglio', 'approvazione', 'richiesta_nuova_versione',
  ]).optional(),
})

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

// I campi monetari/quantitativi sono Decimal a schema e le date sono Date: convertiti qui.
function toSheetData(d: Omit<z.infer<typeof technicalSheetUpdateSchema>, 'righeMateriali' | 'righeCosti' | 'misure'>) {
  const dec = (v?: number) => (v === undefined ? undefined : new Prisma.Decimal(v))
  const data = (v?: string) => (v === undefined ? undefined : new Date(v))
  return {
    ...d,
    pesoCapoGrammi: dec(d.pesoCapoGrammi),
    tempiStimatiOre: dec(d.tempiStimatiOre),
    costoManodopera: dec(d.costoManodopera),
    costoTessuto: dec(d.costoTessuto),
    costoAccessori: dec(d.costoAccessori),
    costoPackaging: dec(d.costoPackaging),
    altriCostiDiretti: dec(d.altriCostiDiretti),
    altriCostiIndiretti: dec(d.altriCostiIndiretti),
    pdfFileCaricatoIl: data(d.pdfFileCaricatoIl),
    scanAiAnalizzatoIl: data(d.scanAiAnalizzatoIl),
  }
}

export async function productRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('prodotti')] }
  const write = { preHandler: [authenticate, requireModule('prodotti'), requireEdit] }

  app.get('/products', read, async (req) => {
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    return listProducts(parsed.data)
  })

  app.get('/products/:id', read, async (req) => {
    const { id } = req.params as { id: string }
    return getProduct(id)
  })

  // Cancellazione di un capo: riservata ad Admin e CEO, non a tutto ciò che può scrivere.
  // Le altre scritture si correggono, questa no — porta via varianti, schede e giacenze.
  const elimina = { preHandler: [authenticate, requireModule('prodotti'), requireRole('admin', 'ceo')] }

  // Cosa succederebbe eliminando: serve alla conferma a schermo, che deve dire in anticipo
  // che cosa sparisce e se la cancellazione è possibile — senza doverla provare.
  app.get('/products/:id/deletion-check', elimina, async (req) => {
    const { id } = req.params as { id: string }
    return checkProductDeletion(id)
  })

  app.delete('/products/:id', elimina, async (req) => {
    const { id } = req.params as { id: string }
    return deleteProduct(id, req.user!.id)
  })

  app.post('/products', write, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => i.message).join('; '))
    const d = parsed.data
    const data: Prisma.ProductCreateInput = {
      nome: d.nome,
      codiceProdotto: d.codiceProdotto,
      linea: d.linea,
      categoria: d.categoria,
      collezione: d.collezione,
      stagione: d.stagione,
      prezzoVendita: d.prezzoVendita ? new Prisma.Decimal(d.prezzoVendita) : undefined,
      prezzoNettoIva: d.prezzoNettoIva ? new Prisma.Decimal(d.prezzoNettoIva) : undefined,
      // I due attributi commerciali della vista cliente si impostano già alla creazione
      // (DEC-044): la rotta costruisce il record campo per campo, quindi vanno elencati qui
      // o verrebbero scartati in silenzio.
      visibileShowroom: d.visibileShowroom,
      personalizzabileSuMisura: d.personalizzabileSuMisura,
    }
    const created = await createProduct(data, req.user!.id)
    reply.code(201)
    return created
  })

  app.patch('/products/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => i.message).join('; '))
    const d = parsed.data
    // Se arriva il prezzo IVA inclusa senza il netto, lo deriva col 22% come fa il form
    // del prototipo: i margini si calcolano sul netto, non deve restare a zero.
    const prezzoNettoIva =
      d.prezzoNettoIva ??
      (d.prezzoVendita !== undefined && d.prezzoVendita > 0
        ? Math.round((d.prezzoVendita / 1.22) * 100) / 100
        : d.prezzoVendita === 0 ? 0 : undefined)
    const data: Prisma.ProductUpdateInput = {
      ...d,
      prezzoVendita: d.prezzoVendita !== undefined ? new Prisma.Decimal(d.prezzoVendita) : undefined,
      prezzoNettoIva: prezzoNettoIva !== undefined ? new Prisma.Decimal(prezzoNettoIva) : undefined,
      prezzoShowroom: d.prezzoShowroom !== undefined ? new Prisma.Decimal(d.prezzoShowroom) : undefined,
      prezzoConsigliato: d.prezzoConsigliato !== undefined ? new Prisma.Decimal(d.prezzoConsigliato) : undefined,
    }
    return updateProduct(id, data, req.user!.id)
  })

  // --- Varianti (FR-03) ---
  app.post('/products/:id/variants', write, async (req, reply) => {
    const { id } = req.params as { id: string }
    const d = parse(variantCreateSchema, req.body)
    const created = await createVariant(id, d, req.user!.id)
    reply.code(201)
    return created
  })

  app.patch('/variants/:id/quantities', write, async (req) => {
    const { id } = req.params as { id: string }
    return updateVariantQuantities(id, parse(variantQuantitiesSchema, req.body), req.user!.id)
  })

  // --- Schede tecniche (FR-07/FR-14) ---
  // Dal 2026-07-30 la scheda è salvata per intero nel database, collezioni comprese.
  app.get('/products/:id/technical-sheets', read, async (req) => {
    const { id } = req.params as { id: string }
    return listTechnicalSheets(id)
  })

  // Tutte le schede in una richiesta sola: serve al caricamento iniziale dell'app, che
  // altrimenti ne fa una per prodotto. Stessi dati della rotta qui sopra, stesso gating.
  app.get('/technical-sheets', read, async () => listAllTechnicalSheets())

  app.get('/technical-sheets/:id', read, async (req) => {
    const { id } = req.params as { id: string }
    return getTechnicalSheet(id)
  })

  app.post('/products/:id/technical-sheets', write, async (req, reply) => {
    const { id } = req.params as { id: string }
    const d = parse(technicalSheetCreateSchema, req.body)
    const { versione, ...resto } = d
    const created = await createTechnicalSheet(id, versione, toSheetData(resto), req.user!.id)
    reply.code(201)
    return created
  })

  app.patch('/technical-sheets/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    const d = parse(technicalSheetUpdateSchema, req.body)
    const {
      righeMateriali, righeCosti, misure,
      fotoDaAggiungere, fotoDaRimuovereIds, snapshotCosto,
      ...campi
    } = d
    return updateTechnicalSheet(
      id,
      toSheetData(campi),
      { righeMateriali, righeCosti, misure, fotoDaAggiungere, fotoDaRimuovereIds, snapshotCosto },
      req.user!.id,
    )
  })

  // Foto del prototipo: salvate nel database (finiscono nei backup).
  app.post('/technical-sheets/:id/photos', write, async (req, reply) => {
    const { id } = req.params as { id: string }
    const d = parse(photoSchema, req.body)
    const created = await addPhoto(id, d, req.user!.id)
    reply.code(201)
    return created
  })

  app.delete('/technical-sheets/:id/photos/:photoId', write, async (req) => {
    const { id, photoId } = req.params as { id: string; photoId: string }
    return removePhoto(id, photoId, req.user!.id)
  })

  // Storico costi: si aggiunge in coda, non si riscrive mai (spec §6).
  app.post('/technical-sheets/:id/cost-snapshots', write, async (req, reply) => {
    const { id } = req.params as { id: string }
    const d = parse(costSnapshotSchema, req.body)
    const created = await addCostSnapshot(id, d, req.user!.id)
    reply.code(201)
    return created
  })

  // --- Documenti delle modelliste (backlog "Note" §4) ---
  // Ogni caricamento è una versione a sé: nulla viene sovrascritto.
  app.get('/products/:id/pattern-documents', read, async (req) => {
    const { id } = req.params as { id: string }
    return listPatternDocuments(id)
  })

  app.post('/products/:id/pattern-documents', write, async (req, reply) => {
    const { id } = req.params as { id: string }
    const created = await createPatternDocument(id, parse(patternDocumentSchema, req.body), req.user!.id)
    reply.code(201)
    return created
  })

  app.patch('/pattern-documents/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    const d = parse(patternStatoSchema, req.body)
    return updatePatternDocumentStato(id, d.statoApprovazione, req.user!.id)
  })

  app.delete('/pattern-documents/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    return deletePatternDocument(id, req.user!.id)
  })

  app.post('/pattern-documents/:id/notes', write, async (req, reply) => {
    const { id } = req.params as { id: string }
    const created = await addPatternDocumentNote(id, parse(patternNotaSchema, req.body), req.user!.id)
    reply.code(201)
    return created
  })
}
