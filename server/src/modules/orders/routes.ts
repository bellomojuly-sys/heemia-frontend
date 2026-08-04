// FR-26/27 — ordini. Modulo RBAC "ordini" (tutti gli interni, scrittura admin/ceo/team).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { createOrder, listOrders, updateOrder } from './service.js'

const statoEnum = z.enum(['in_lavorazione', 'spedito', 'consegnato', 'annullato'])
const canaleEnum = z.enum(['shopify', 'fisico'])
const prioritaEnum = z.enum(['normale', 'alta'])

const itemSchema = z.object({
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  quantita: z.number().int().positive().optional(),
  prezzoUnitario: z.number().nonnegative().optional(),
  suMisura: z.boolean().optional(),
  materialeSceltoId: z.string().uuid().optional(),
  tagliaScelta: z.string().optional(),
  misure: z.record(z.string(), z.string()).optional(),
  noteSuMisura: z.string().optional(),
})

const createSchema = z.object({
  numero: z.string().min(1),
  customerId: z.string().uuid().optional(),
  canale: canaleEnum,
  stato: statoEnum.optional(),
  priorita: prioritaEnum.optional(),
  data: z.string().date(),
  totale: z.number().nonnegative(),
  items: z.array(itemSchema).optional(),
})

const updateSchema = z.object({ stato: statoEnum.optional(), priorita: prioritaEnum.optional() })
const listQuerySchema = z.object({ stato: statoEnum.optional(), canale: canaleEnum.optional() })

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function orderRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('ordini')] }
  const write = { preHandler: [authenticate, requireModule('ordini'), requireEdit] }

  app.get('/orders', read, async (req) => listOrders(parse(listQuerySchema, req.query)))

  app.post('/orders', write, async (req, reply) => {
    const created = await createOrder(parse(createSchema, req.body), req.user!.id)
    reply.code(201)
    return created
  })

  app.patch('/orders/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    return updateOrder(id, parse(updateSchema, req.body), req.user!.id)
  })
}
