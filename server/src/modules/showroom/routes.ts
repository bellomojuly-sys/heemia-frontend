// Sub-app showroom, prefisso /api/showroom (fuori da /api/v1): scope separato come da
// System_Architecture A5. Nessuna sessione interna richiesta — è l'app rivolta al cliente
// in showroom — quindi la difesa è: whitelist dei campi nei service + rate limit stretto qui.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { badRequest } from '../../core/errors.js'
import {
  createShowroomOrder, getShowroomCatalog, getShowroomMaterials, registerShowroomCustomer,
} from './service.js'

const customerSchema = z.object({
  nome: z.string().min(1).max(120),
  email: z.string().email(),
})

const orderSchema = z.object({
  productId: z.string().uuid(),
  clienteNome: z.string().min(1).max(120),
  clienteEmail: z.string().email(),
  materialeId: z.string().uuid().optional(),
  taglia: z.string().min(1).max(20),
  misure: z.record(z.string(), z.string()).optional(),
  note: z.string().max(1000).optional(),
})

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function showroomRoutes(app: FastifyInstance) {
  // Limite più stretto del globale: endpoint scrivibili senza autenticazione.
  const writeLimit = {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }

  app.get('/catalog', async () => getShowroomCatalog())

  app.get('/materials', async () => getShowroomMaterials())

  app.post('/customers', writeLimit, async (req, reply) => {
    const created = await registerShowroomCustomer(parse(customerSchema, req.body))
    reply.code(201)
    return created
  })

  app.post('/orders', writeLimit, async (req, reply) => {
    const created = await createShowroomOrder(parse(orderSchema, req.body))
    reply.code(201)
    return created
  })
}
