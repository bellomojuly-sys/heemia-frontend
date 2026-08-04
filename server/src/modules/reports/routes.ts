// FR-31 report (modulo RBAC "report", Admin/CEO) e FR-18 activity log (modulo "activity-log").
// L'activity log è di sola lettura: la scrittura passa dai service via logActivity().
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { generateReport, listReports } from './service.js'
import { prisma } from '../../core/prisma.js'

const generateSchema = z.object({ mese: z.string().regex(/^\d{4}-\d{2}$/, 'formato atteso YYYY-MM') })
const listQuerySchema = z.object({ limit: z.coerce.number().int().positive().max(60).optional() })
const logQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
  entita: z.string().optional(),
})

const parse = <T>(schema: z.ZodType<T>, data: unknown): T => {
  const r = schema.safeParse(data)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function reportRoutes(app: FastifyInstance) {
  const reportGuard = { preHandler: [authenticate, requireModule('report')] }

  app.get('/reports', reportGuard, async (req) => {
    const { limit } = parse(listQuerySchema, req.query)
    return listReports(limit ?? 12)
  })

  app.post('/reports/generate', reportGuard, async (req) => {
    const { mese } = parse(generateSchema, req.body)
    return generateReport(mese)
  })

  app.get('/activity-log', { preHandler: [authenticate, requireModule('activity-log')] }, async (req) => {
    const { limit, entita } = parse(logQuerySchema, req.query)
    return prisma.activityLog.findMany({
      where: entita ? { entita } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit ?? 100,
      include: { user: { select: { nome: true, email: true, role: true } } },
    })
  })
}
