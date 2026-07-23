import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { createProduct, getProduct, listProducts, updateProduct } from './service.js'

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

const updateSchema = createSchema.partial().omit({ codiceProdotto: true })

export async function productRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('prodotti')] }
  const write = { preHandler: [authenticate, requireModule('prodotti'), requireEdit] }

  app.get('/products', read, async (req) => {
    const { stato, linea, q } = req.query as Record<string, string | undefined>
    return listProducts({ stato, linea, q })
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
    const data: Prisma.ProductUpdateInput = {
      ...d,
      prezzoVendita: d.prezzoVendita !== undefined ? new Prisma.Decimal(d.prezzoVendita) : undefined,
      prezzoNettoIva: d.prezzoNettoIva !== undefined ? new Prisma.Decimal(d.prezzoNettoIva) : undefined,
    }
    return updateProduct(id, data, req.user!.id)
  })
}
