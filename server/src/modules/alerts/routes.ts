// FR-27 — pagina Alert e riquadro alert in dashboard. Il filtro per ruolo è dentro
// computeAlerts (canSeeAlertModulo), non delegato al client.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { computeAlerts } from './service.js'

const querySchema = z.object({ limit: z.coerce.number().int().positive().max(200).optional() })

export async function alertRoutes(app: FastifyInstance) {
  app.get('/alerts', { preHandler: [authenticate, requireModule('alert')] }, async (req) => {
    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    const alerts = await computeAlerts(req.user!.role)
    return parsed.data.limit ? alerts.slice(0, parsed.data.limit) : alerts
  })
}
