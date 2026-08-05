// Backlog "Note" §10-11 — endpoint Analytics (GA4).
// Modulo di permessi dedicato `analytics`: sono dati commerciali, quindi segue lo stesso
// gating di Shopify/Report (Admin e CEO).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { analyticsConfigured, getAnalyticsSummary, getAnalyticsWidget, type RangeId } from './service.js'

const querySchema = z.object({
  range: z.enum(['today', '7d', '30d', 'month', 'custom']).default('7d'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data atteso AAAA-MM-GG').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data atteso AAAA-MM-GG').optional(),
})

export async function analyticsRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('analytics')] }

  // Stato della configurazione: serve al frontend per decidere se mostrare i dati o la
  // spiegazione di cosa manca, senza dover provocare un errore.
  app.get('/analytics/status', read, async () => ({ configurato: analyticsConfigured() }))

  app.get('/analytics/summary', read, async (req) => {
    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    }
    const { range, from, to } = parsed.data
    return getAnalyticsSummary(range as RangeId, from, to)
  })

  // Imbuto degli ultimi 7 giorni per il riquadro in dashboard.
  app.get('/analytics/widget', read, async () => getAnalyticsWidget())
}
