// FR-14/FR-28 — scansione AI del PDF della scheda tecnica.
// Gating: modulo "prodotti" + permesso di modifica, perché il risultato scrive i costi
// del capo. Il PDF viaggia in JSON base64 (nessun multipart: il backend non lo monta).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { scanTechnicalSheetPdf } from './service.js'

const scanSchema = z.object({
  /** Contenuto del PDF in base64 (con o senza prefisso data URL). */
  pdfBase64: z.string().min(1, 'PDF mancante'),
  nomeFile: z.string().optional(),
})

export async function aiRoutes(app: FastifyInstance) {
  const write = { preHandler: [authenticate, requireModule('prodotti'), requireEdit] }

  app.post('/ai/scan-technical-sheet', write, async (req) => {
    const parsed = scanSchema.safeParse(req.body)
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    }
    const { pdfBase64, nomeFile } = parsed.data
    const estrazione = await scanTechnicalSheetPdf(pdfBase64, nomeFile)
    return { estrazione, analizzatoIl: new Date().toISOString() }
  })
}
