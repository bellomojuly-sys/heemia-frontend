// FR-24 — clienti. Modulo RBAC "clienti" (Admin/CEO). La registrazione showroom passa
// invece da /api/showroom/customers (scope separato) ma riusa findOrCreateCustomer.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { authenticate, requireModule, requireEdit, requirePermesso } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import {
  checkCustomerDeletion, deleteCustomer, findOrCreateCustomer, listCustomers, updateCustomer,
} from './service.js'

const tipologiaEnum = z.enum(['ecommerce', 'showroom', 'b2b', 'retailer', 'showroom_partner'])

const createSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email().optional(),
  paese: z.string().optional(),
  tipologia: tipologiaEnum.optional(),
  sconto: z.number().min(0).max(100).optional(),
  note: z.string().optional(),
})

// In modifica tutto è facoltativo: si completa una scheda cliente un campo alla volta.
const updateSchema = createSchema.partial().refine((d) => Object.keys(d).length > 0, {
  message: 'Nessuna modifica indicata',
})

const listQuerySchema = z.object({ tipologia: tipologiaEnum.optional(), q: z.string().optional() })

export async function customerRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('clienti')] }
  const write = { preHandler: [authenticate, requireModule('clienti'), requireEdit] }
  // Eliminare un cliente è un permesso a sé: chi corregge un'anagrafica non per questo
  // deve poterla cancellare. Il valore predefinito lo dà core/permissions.ts, la matrice
  // in Impostazioni lo può cambiare.
  const elimina = { preHandler: [authenticate, requireModule('clienti'), requirePermesso('eliminare')] }

  app.get('/customers', read, async (req) => {
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    return listCustomers(parsed.data)
  })

  app.patch('/customers/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    const { sconto, ...rest } = parsed.data
    return updateCustomer(
      id,
      { ...rest, sconto: sconto !== undefined ? new Prisma.Decimal(sconto) : undefined },
      req.user!.id,
    )
  })

  // Cosa sparisce e cosa resta orfano: la conferma a schermo deve poterlo dire prima,
  // non dopo. Stesso schema del `deletion-check` dei prodotti.
  app.get('/customers/:id/deletion-check', elimina, async (req) => {
    const { id } = req.params as { id: string }
    return checkCustomerDeletion(id)
  })

  // `?conferma=storico` è l'assenso esplicito quando il cliente ha ordini o fatture: senza,
  // il server risponde 409 e spiega cosa perderebbe l'intestatario.
  app.delete('/customers/:id', elimina, async (req) => {
    const { id } = req.params as { id: string }
    const { conferma } = req.query as { conferma?: string }
    return deleteCustomer(id, req.user!.id, { confermaStorico: conferma === 'storico' })
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
