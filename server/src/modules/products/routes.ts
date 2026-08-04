import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import {
  createProduct, createVariant, getProduct, listProducts, updateProduct, updateVariantQuantities,
} from './service.js'
import {
  addCostSnapshot, addPhoto, createTechnicalSheet, getTechnicalSheet, listTechnicalSheets,
  removePhoto, updateTechnicalSheet,
} from './technicalSheets.js'

const createSchema = z.object({
  nome: z.string().min(1),
  codiceProdotto: z.string().min(1),
  linea: z.enum(['tessile', 'maglieria']),
  categoria: z.string().optional(),
  collezione: z.string().optional(),
  stagione: z.string().optional(),
  prezzoVendita: z.number().nonnegative().optional(),
  prezzoNettoIva: z.number().nonnegative().optional(),
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
  visibileShowroom: z.boolean().optional(),
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
  fornitoreLaboratorioId: z.string().uuid().optional(),
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

// Nell'update le collezioni sono opzionali: se presenti sostituiscono il set completo.
const technicalSheetUpdateSchema = technicalSheetCreateSchema.partial().extend({
  righeMateriali: z.array(rigaMaterialeSchema).optional(),
  righeCosti: z.array(rigaCostoSchema).optional(),
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

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

// I campi monetari/quantitativi sono Decimal a schema e le date sono Date: convertiti qui.
function toSheetData(d: Omit<z.infer<typeof technicalSheetUpdateSchema>, 'righeMateriali' | 'righeCosti'>) {
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
    const { righeMateriali, righeCosti, ...campi } = d
    return updateTechnicalSheet(id, toSheetData(campi), { righeMateriali, righeCosti }, req.user!.id)
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
}
