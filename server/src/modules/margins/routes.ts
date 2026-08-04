// FR-08/09/40 — margini, costi fissi, quota per capo. Tutto sotto il modulo RBAC
// "costi-margini" (solo Admin/CEO): è la sezione economica dell'app.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest, notFound } from '../../core/errors.js'
import {
  computeAllMargins, computeProductMargin, computeQuotaPerCapo, createFixedCost, deleteFixedCost,
  listFixedCosts, listQuotaHistory, saveQuotaSnapshot, setSetting, updateFixedCost,
} from './service.js'

const fixedCostCreate = z.object({ nome: z.string().min(1), importoAnnuo: z.number().nonnegative() })
const fixedCostUpdate = z.object({ importoAnnuo: z.number().nonnegative() })
const capiAnnuiSchema = z.object({ capiProdottiAnnui: z.number().int().positive() })
const sogliaSchema = z.object({ sogliaMarginePercent: z.number().min(0).max(100) })
const quotaSnapshotSchema = z.object({
  periodo: z.string().regex(/^\d{4}(-\d{2})?$/, 'formato atteso YYYY o YYYY-MM'),
  nota: z.string().optional(),
})

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function marginsRoutes(app: FastifyInstance) {
  const guard = { preHandler: [authenticate, requireModule('costi-margini')] }
  const write = { preHandler: [authenticate, requireModule('costi-margini'), requireEdit] }

  // Aggregato di tutti i prodotti (equivalente di useLiveMargins lato client).
  app.get('/margins', guard, async () => computeAllMargins())

  app.get('/margins/quota', guard, async () => computeQuotaPerCapo())

  app.get('/margins/products/:id', guard, async (req) => {
    const { id } = req.params as { id: string }
    const margin = await computeProductMargin(id)
    if (!margin) throw notFound('Prodotto non trovato')
    return margin
  })

  // --- Voci di costo fisso (DEC-022) ---
  app.get('/fixed-costs', guard, async () => listFixedCosts())

  app.post('/fixed-costs', write, async (req, reply) => {
    const d = parse(fixedCostCreate, req.body)
    const created = await createFixedCost(d.nome, d.importoAnnuo, req.user!.id)
    reply.code(201)
    return created
  })

  app.patch('/fixed-costs/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    const d = parse(fixedCostUpdate, req.body)
    return updateFixedCost(id, d.importoAnnuo, req.user!.id)
  })

  app.delete('/fixed-costs/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    return deleteFixedCost(id, req.user!.id)
  })

  // --- Parametri di calcolo ---
  app.put('/settings/capi-annui', write, async (req) => {
    const d = parse(capiAnnuiSchema, req.body)
    return setSetting('capi_prodotti_annui', String(d.capiProdottiAnnui), req.user!.id)
  })

  app.put('/settings/soglia-margine', write, async (req) => {
    const d = parse(sogliaSchema, req.body)
    return setSetting('soglia_margine_percent', String(d.sogliaMarginePercent), req.user!.id)
  })

  // --- Storico quota (FR-40) ---
  app.get('/quota-history', guard, async () => listQuotaHistory())

  app.post('/quota-history', write, async (req, reply) => {
    const d = parse(quotaSnapshotSchema, req.body)
    const created = await saveQuotaSnapshot(d.periodo, d.nota, req.user!.id)
    reply.code(201)
    return created
  })
}
