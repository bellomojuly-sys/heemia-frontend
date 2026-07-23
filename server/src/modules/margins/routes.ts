import type { FastifyInstance } from 'fastify'
import { authenticate, requireModule } from '../../core/guards.js'
import { notFound } from '../../core/errors.js'
import { computeProductMargin, computeQuotaPerCapo } from './service.js'

export async function marginsRoutes(app: FastifyInstance) {
  const guard = { preHandler: [authenticate, requireModule('costi-margini')] }

  app.get('/margins/quota', guard, async () => {
    return computeQuotaPerCapo()
  })

  app.get('/margins/products/:id', guard, async (req) => {
    const { id } = req.params as { id: string }
    const margin = await computeProductMargin(id)
    if (!margin) throw notFound('Prodotto non trovato')
    return margin
  })
}
