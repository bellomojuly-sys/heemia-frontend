// Richieste showroom lato gestionale (spec 2026-08-06 §7). Modulo RBAC "richieste-showroom":
// stessa apertura di "ordini" (tutti gli interni in lettura, scrittura admin/ceo/team), perché
// è il lavoro operativo di chi segue il cliente in showroom.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { getShowroomRequest, listShowroomRequests, updateShowroomRequest } from './service.js'

const statoEnum = z.enum([
  'nuova_richiesta', 'da_contattare', 'appuntamento_fissato', 'misure_raccolte',
  'preventivo_inviato', 'confermato', 'in_produzione', 'pronto', 'consegnato', 'annullato',
])
const tipoEnum = z.enum(['personalizzazione', 'informazioni'])

const listQuerySchema = z.object({ stato: statoEnum.optional(), tipo: tipoEnum.optional() })

const updateSchema = z.object({
  stato: statoEnum.optional(),
  noteInterne: z.string().max(4000).optional(),
  preventivoImporto: z.number().nonnegative().optional(),
  preventivoInviatoIl: z.string().datetime().optional(),
  appuntamentoIl: z.string().datetime().optional(),
  tagliaBase: z.string().max(20).optional(),
  coloreDesiderato: z.string().max(80).optional(),
  lunghezza: z.string().max(80).optional(),
  modifiche: z.string().max(2000).optional(),
  misure: z.record(z.string(), z.string()).optional(),
})

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function showroomRequestRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('richieste-showroom')] }
  const write = { preHandler: [authenticate, requireModule('richieste-showroom'), requireEdit] }

  app.get('/showroom-requests', read, async (req) => listShowroomRequests(parse(listQuerySchema, req.query)))

  app.get('/showroom-requests/:id', read, async (req) => {
    const { id } = req.params as { id: string }
    return getShowroomRequest(id)
  })

  // Portare lo stato a "confermato" crea l'ordine SM-* collegato (DEC-044).
  app.patch('/showroom-requests/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    return updateShowroomRequest(id, parse(updateSchema, req.body), req.user!.id)
  })
}
