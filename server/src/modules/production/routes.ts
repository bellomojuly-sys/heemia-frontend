// FR-05 / FR-07 — endpoint pipeline produzione. Modulo RBAC: "produzione".
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import {
  advanceProduction, approveSample, checkAdvance, checkRequisitiCampione,
  getProductionDetail, listProduction, setStepBlock,
} from './service.js'

const advanceSchema = z.object({
  responsabile: z.string().optional(),
  note: z.string().optional(),
})

const approveSampleSchema = z.object({
  note: z.string().max(1000).optional(),
})

const blockSchema = z.object({
  bloccata: z.boolean(),
  motivo: z.string().optional(),
})

export async function productionRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('produzione')] }
  const write = { preHandler: [authenticate, requireModule('produzione'), requireEdit] }

  app.get('/production', read, async () => listProduction())

  app.get('/production/:productId', read, async (req) => {
    const { productId } = req.params as { productId: string }
    return getProductionDetail(productId)
  })

  // Stato del gate senza effetti collaterali: il client lo usa per disabilitare il pulsante.
  app.get('/production/:productId/check', read, async (req) => {
    const { productId } = req.params as { productId: string }
    return checkAdvance(productId)
  })

  app.post('/production/:productId/advance', write, async (req) => {
    const { productId } = req.params as { productId: string }
    const parsed = advanceSchema.safeParse(req.body ?? {})
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => i.message).join('; '))
    return advanceProduction(productId, req.user!.id, parsed.data)
  })

  // Checklist dei documenti richiesti prima dell'approvazione del campione.
  app.get('/production/:productId/sample-check', read, async (req) => {
    const { productId } = req.params as { productId: string }
    return checkRequisitiCampione(productId)
  })

  app.post('/production/:productId/approve-sample', write, async (req) => {
    const { productId } = req.params as { productId: string }
    const parsed = approveSampleSchema.safeParse(req.body ?? {})
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => i.message).join('; '))
    return approveSample(productId, req.user!.id, parsed.data.note)
  })

  app.patch('/production/steps/:stepId/block', write, async (req) => {
    const { stepId } = req.params as { stepId: string }
    const parsed = blockSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => i.message).join('; '))
    return setStepBlock(stepId, parsed.data.bloccata, parsed.data.motivo, req.user!.id)
  })
}
