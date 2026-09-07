// FR-25 fornitori + FR-06 richieste/bozze email. Modulo RBAC "fornitori" (tutti gli interni,
// scrittura admin/ceo/team). Invio email: gated su credenziali Google (P2).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { SupplierCategoria } from '@prisma/client'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest, notFound } from '../../core/errors.js'
import {
  campiMancanti, createSupplier, createSupplierRequest, getSupplier, listSupplierRequests,
  listSuppliersConCompletezza, sendSupplierRequest, setSupplierRequestStatus,
  updateSupplier, updateSupplierRequestDraft,
} from './service.js'

// Enum derivato da Prisma: l'API accetta i nomi del client (es. "Asole_Bottoni"),
// che Prisma mappa da sé sui valori reali in tabella ("Asole/Bottoni").
const CATEGORIE = Object.values(SupplierCategoria) as [SupplierCategoria, ...SupplierCategoria[]]

// Un fornitore si salva anche incompleto: nome e categoria bastano, il resto si aggiunge
// quando arriva (DEC-061 «i fornitori senza partita IVA entrano lo stesso»). L'email è
// facoltativa ma, se scritta, deve essere un indirizzo valido — accettarne uno storto
// significherebbe scoprirlo il giorno in cui una richiesta di riordino non parte.
// `.or(z.literal(''))` è quello che permette di **svuotare** un campo dal form: senza,
// una stringa vuota verrebbe rifiutata come email non valida.
const testoFacoltativo = z.string().max(300).optional()
const emailFacoltativa = z.string().email('Indirizzo email non valido').or(z.literal('')).optional()

const supplierCreate = z.object({
  nome: z.string().min(1, 'Il nome del fornitore è obbligatorio'),
  categoria: z.enum(CATEGORIE),
  partitaIva: testoFacoltativo,
  citta: testoFacoltativo,
  paese: testoFacoltativo,
  email: emailFacoltativa,
  referente: testoFacoltativo,
  telefono: testoFacoltativo,
  tempiMediConsegnaGg: z.number().int().nonnegative().nullable().optional(),
  condizioniPagamento: testoFacoltativo,
  note: z.string().max(2000).optional(),
})

// In modifica tutto è facoltativo: si completa un campo alla volta, quando il dato arriva.
const supplierUpdate = supplierCreate.partial().refine((d) => Object.keys(d).length > 0, {
  message: 'Nessuna modifica indicata',
})

const reqStato = z.enum([
  'bozza_generata', 'in_attesa_approvazione', 'modificata', 'approvata',
  'inviata', 'risposta_ricevuta', 'chiusa', 'annullata',
])

const createReqSchema = z.object({
  materialId: z.string().uuid().optional(),
  accessoryId: z.string().uuid().optional(),
}).refine((d) => d.materialId || d.accessoryId, { message: 'Specificare materialId o accessoryId' })

const statusSchema = z.object({ stato: reqStato, rispostaFornitore: z.string().optional() })
const draftSchema = z.object({
  testo: z.string().optional(),
  quantitaRichiesta: z.number().nonnegative().optional(),
  deadlineIdeale: z.string().date().optional(),
})

const listSuppliersQuery = z.object({ categoria: z.enum(CATEGORIE).optional(), q: z.string().optional() })
const listReqQuery = z.object({ stato: reqStato.optional(), supplierId: z.string().uuid().optional() })

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function supplierRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('fornitori')] }
  const write = { preHandler: [authenticate, requireModule('fornitori'), requireEdit] }

  // La lista porta con sé quali campi mancano a ciascuna scheda: la pagina Fornitori lo
  // mostra e l'AI Assistant risponde con questo, non con un elenco scritto a mano.
  app.get('/suppliers', read, async (req) => listSuppliersConCompletezza(parse(listSuppliersQuery, req.query)))

  app.get('/suppliers/:id', read, async (req) => {
    const { id } = req.params as { id: string }
    const supplier = await getSupplier(id)
    if (!supplier) throw notFound('Fornitore non trovato')
    return { ...supplier, campiMancanti: campiMancanti(supplier as unknown as Record<string, unknown>) }
  })

  app.post('/suppliers', write, async (req, reply) => {
    const d = parse(supplierCreate, req.body)
    // Le stringhe vuote del form non devono diventare campi valorizzati con "" in tabella:
    // un campo vuoto è null, ed è così che «manca» si distingue da «è stato scritto vuoto».
    const pulito = Object.fromEntries(
      Object.entries(d).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? undefined : v]),
    ) as typeof d
    const created = await createSupplier(pulito, req.user!.id)
    reply.code(201)
    return created
  })

  app.patch('/suppliers/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    return updateSupplier(id, parse(supplierUpdate, req.body), req.user!.id)
  })

  app.get('/supplier-requests', read, async (req) => listSupplierRequests(parse(listReqQuery, req.query)))

  app.post('/supplier-requests', write, async (req, reply) => {
    const created = await createSupplierRequest(parse(createReqSchema, req.body), req.user!.id)
    reply.code(201)
    return created
  })

  app.patch('/supplier-requests/:id/status', write, async (req) => {
    const { id } = req.params as { id: string }
    const d = parse(statusSchema, req.body)
    return setSupplierRequestStatus(id, d.stato, req.user!.id, { rispostaFornitore: d.rispostaFornitore })
  })

  app.patch('/supplier-requests/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    return updateSupplierRequestDraft(id, parse(draftSchema, req.body), req.user!.id)
  })

  app.post('/supplier-requests/:id/send', write, async (req) => {
    const { id } = req.params as { id: string }
    return sendSupplierRequest(id, req.user!.id)
  })
}
