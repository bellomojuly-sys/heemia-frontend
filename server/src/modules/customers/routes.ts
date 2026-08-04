// FR-24 — clienti. Modulo RBAC "clienti" (Admin/CEO). La registrazione showroom passa
// invece da /api/showroom/customers (scope separato) ma riusa findOrCreateCustomer.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { findOrCreateCustomer, listCustomers } from './service.js'

const tipologiaEnum = z.enum(['ecommerce', 'showroom', 'b2b', 'retailer', 'showroom_partner'])

const createSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email().optional(),
  paese: z.string().optional(),
  tipologia: tipologiaEnum.optional(),
  sconto: z.number().min(0).max(100).optional(),
  note: z.string().optional(),
})

const listQuerySchema = z.object({ tipologia: tipologiaEnum.optional(), q: z.string().optional() })

export async function customerRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('clienti')] }
  const write = { preHandler: [authenticate, requireModule('clienti'), requireEdit] }

  app.get('/customers', read, async (req) => {
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    return listCustomers(parsed.data)
  })

  app.post('/customers', write, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => i.message).join('; '))
    const { sconto, ...rest } = parsed.data
    const created = await findOrCreateCustomer(
      { ...rest, sconto: sconto !== undefined ? new Prisma.Decimal(sconto) : undefined },
      req.user!.id,
    )
    reply.code(201)
    return created
  })
}
