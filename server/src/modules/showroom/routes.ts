// Sub-app showroom, prefisso /api/showroom (fuori da /api/v1): scope separato come da
// System_Architecture A5. Nessuna sessione interna richiesta — è l'app rivolta al cliente
// in showroom — quindi la difesa è: whitelist dei campi nei service + rate limit stretto qui.
// L'id di visita restituito dall'accesso è la chiave delle scritture successive: senza
// accesso (e senza consenso) il cliente non scrive nulla.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { badRequest } from '../../core/errors.js'
import {
  addFavorite, createShowroomRequest, getShowroomCatalog, getShowroomMaterials,
  removeFavorite, startShowroomVisit, trackProductView,
} from './service.js'

const visitSchema = z.object({
  nome: z.string().min(1).max(80),
  cognome: z.string().min(1).max(80),
  email: z.string().email(),
  // Il consenso al trattamento è il presupposto dell'accesso: qui è un letterale `true`,
  // così un client che non lo invia riceve 400 e non entra.
  consensoPrivacy: z.literal(true),
  consensoMarketing: z.boolean().default(false),
})

const productRefSchema = z.object({ productId: z.string().uuid() })

// Limite per immagine allineato alle foto scheda tecnica (3 MB in base64), max 5 allegati.
const immagineSchema = z.object({
  nome: z.string().min(1).max(200),
  dataUrl: z.string().startsWith('data:image/').max(3 * 1024 * 1024),
})

const requestSchema = z.object({
  visitId: z.string().uuid(),
  tipo: z.enum(['personalizzazione', 'informazioni']).default('personalizzazione'),
  productId: z.string().uuid(),
  tagliaBase: z.string().max(20).optional(),
  coloreDesiderato: z.string().max(80).optional(),
  lunghezza: z.string().max(80).optional(),
  modifiche: z.string().max(2000).optional(),
  note: z.string().max(2000).optional(),
  misure: z.record(z.string(), z.string()).optional(),
  dataDesiderata: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  immagini: z.array(immagineSchema).max(5).optional(),
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
  // Le viste sono un evento di navigazione: il cliente ne genera molte più di 20 al minuto
  // sfogliando il catalogo, quindi hanno un limite proprio più largo.
  const trackLimit = {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }

  app.get('/catalog', async () => getShowroomCatalog())

  app.get('/materials', async () => getShowroomMaterials())

  // Accesso alla vista cliente (spec §4): nome, cognome, email + consensi.
  app.post('/visits', writeLimit, async (req, reply) => {
    const created = await startShowroomVisit(parse(visitSchema, req.body))
    reply.code(201)
    return created
  })

  app.post('/visits/:visitId/views', trackLimit, async (req) => {
    const { visitId } = req.params as { visitId: string }
    return trackProductView(visitId, parse(productRefSchema, req.body).productId)
  })

  app.post('/visits/:visitId/favorites', trackLimit, async (req) => {
    const { visitId } = req.params as { visitId: string }
    return addFavorite(visitId, parse(productRefSchema, req.body).productId)
  })

  app.delete('/visits/:visitId/favorites/:productId', trackLimit, async (req) => {
    const { visitId, productId } = req.params as { visitId: string; productId: string }
    return removeFavorite(visitId, productId)
  })

  // Richiesta di personalizzazione o di informazioni (spec §7): crea la scheda nel gestionale.
  app.post('/requests', writeLimit, async (req, reply) => {
    const created = await createShowroomRequest(parse(requestSchema, req.body))
    reply.code(201)
    return created
  })
}
