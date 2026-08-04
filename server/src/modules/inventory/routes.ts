// Inventario prodotti finiti (/inventario/prodotti-finiti). Modulo RBAC "inventario".
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { listInventory, updateInventoryRecord } from './service.js'

const listQuerySchema = z.object({
  stato: z.enum(['disponibile', 'esaurito', 'low_stock']).optional(),
  divergenza: z.enum(['true', 'false']).optional(),
})

const patchSchema = z.object({
  qtaMagazzino: z.number().int().nonnegative().optional(),
  qtaLaboratorio: z.number().int().nonnegative().optional(),
  qtaRiservata: z.number().int().nonnegative().optional(),
  qtaVenduta: z.number().int().nonnegative().optional(),
  sogliaMinima: z.number().int().nonnegative().optional(),
})

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function inventoryRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('inventario')] }
  const write = { preHandler: [authenticate, requireModule('inventario'), requireEdit] }

  app.get('/inventory', read, async (req) => {
    const q = parse(listQuerySchema, req.query)
    return listInventory({
      stato: q.stato,
      divergenza: q.divergenza === undefined ? undefined : q.divergenza === 'true',
    })
  })

  app.patch('/inventory/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    return updateInventoryRecord(id, parse(patchSchema, req.body), req.user!.id)
  })
}
