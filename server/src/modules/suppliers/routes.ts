// FR-25 fornitori + FR-06 richieste/bozze email. Modulo RBAC "fornitori" (tutti gli interni,
// scrittura admin/ceo/team). Invio email: gated su credenziali Google (P2).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { SupplierCategoria } from '@prisma/client'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import {
  createSupplier, createSupplierRequest, listSupplierRequests, listSuppliers,
  sendSupplierRequest, setSupplierRequestStatus, updateSupplierRequestDraft,
} from './service.js'

// Enum derivato da Prisma: l'API accetta i nomi del client (es. "Asole_Bottoni"),
// che Prisma mappa da sé sui valori reali in tabella ("Asole/Bottoni").
const CATEGORIE = Object.values(SupplierCategoria) as [SupplierCategoria, ...SupplierCategoria[]]

const supplierCreate = z.object({
  nome: z.string().min(1),
  categoria: z.enum(CATEGORIE),
  citta: z.string().optional(),
  paese: z.string().optional(),
  email: z.string().email().optional(),
  referente: z.string().optional(),
  telefono: z.string().optional(),
  tempiMediConsegnaGg: z.number().int().nonnegative().optional(),
  condizioniPagamento: z.string().optional(),
  note: z.string().optional(),
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

  app.get('/suppliers', read, async (req) => listSuppliers(parse(listSuppliersQuery, req.query)))

  app.post('/suppliers', write, async (req, reply) => {
    const created = await createSupplier(parse(supplierCreate, req.body), req.user!.id)
    reply.code(201)
    return created
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
