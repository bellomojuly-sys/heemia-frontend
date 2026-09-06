// Shopify — FR-17. Modulo RBAC "shopify" (Admin/CEO), tranne i webhook, che sono pubblici
// per forza: li chiama Shopify, che non ha una sessione. Lì l'autenticazione è la firma HMAC.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import {
  allineaVarianteAShopify, importaOrdini, listaDivergenze, pubblicaGiacenze, riconcilia, statoShopify,
} from './service.js'
import { TOPIC_GESTITI, elaboraInBackground, firmaValida, segretoWebhook } from './webhooks.js'

const importSchema = z.object({
  /** Da quale giorno rileggere gli ordini. Assente = ultimi 90 giorni. */
  dal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato atteso AAAA-MM-GG').optional(),
})

export async function shopifyRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('shopify')] }
  const write = { preHandler: [authenticate, requireModule('shopify'), requireEdit] }

  app.get('/shopify/status', read, async () => statoShopify())

  app.get('/shopify/divergenze', read, async () => listaDivergenze())

  // Riconciliazione: legge Shopify, registra quantità pubblicate e stato, segnala le
  // divergenze. Non tocca le giacenze interne (DEC-027: mai risolte in silenzio).
  app.post('/shopify/sync', write, async (req) => riconcilia(req.user!.id))

  // Scrittura verso Shopify: pubblica le giacenze di magazzino.
  app.post('/shopify/pubblica-giacenze', write, async (req) => pubblicaGiacenze(req.user!.id))

  app.post('/shopify/ordini/import', write, async (req) => {
    const parsed = importSchema.safeParse(req.body ?? {})
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => i.message).join('; '))
    return importaOrdini(req.user!.id, parsed.data.dal)
  })

  // Risoluzione esplicita di una divergenza: il magazzino prende il numero di Shopify.
  app.post('/shopify/divergenze/:variantId/allinea', write, async (req) => {
    const { variantId } = req.params as { variantId: string }
    return allineaVarianteAShopify(variantId, req.user!.id)
  })
}

/**
 * Webhook, registrati in uno **scope separato** con un parser del corpo dedicato.
 *
 * Il motivo del parser: la firma HMAC si calcola sui byte esatti che Shopify ha spedito.
 * Il parser JSON normale di Fastify restituisce l'oggetto già interpretato, e riserializzarlo
 * produce byte diversi (spazi, ordine delle chiavi, numeri) — la firma non tornerebbe mai.
 * Qui il corpo grezzo si conserva e si interpreta dopo, a firma verificata.
 *
 * Lo scope è separato perché quel parser **non deve** valere per il resto dell'API: la nota
 * CSRF in app.ts spiega che la difesa dell'API sta proprio in come i corpi vengono accettati.
 */
export async function shopifyWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, corpo, done) => {
    done(null, corpo)
  })

  app.post('/shopify/webhooks/:topic', async (req, reply) => {
    const segreto = segretoWebhook()
    const corpo = req.body as Buffer
    const firma = req.headers['x-shopify-hmac-sha256'] as string | undefined

    // Senza segreto configurato non si può distinguere una consegna vera da una finta:
    // si rifiuta, invece di accettare qualunque cosa arrivi.
    if (!segreto) {
      return reply.code(503).send({
        error: { code: 'SHOPIFY_WEBHOOK_NOT_CONFIGURED', message: 'SHOPIFY_WEBHOOK_SECRET non impostato: consegna rifiutata.' },
      })
    }
    if (!Buffer.isBuffer(corpo) || !firmaValida(corpo, firma, segreto)) {
      return reply.code(401).send({ error: { code: 'SHOPIFY_BAD_SIGNATURE', message: 'Firma non valida.' } })
    }

    // Il topic autorevole è quello dell'intestazione: il percorso serve solo a rendere
    // leggibili i log e la configurazione lato Shopify.
    const topic = String(req.headers['x-shopify-topic'] ?? (req.params as { topic: string }).topic).replace(/^:/, '')

    let payload: unknown
    try {
      payload = JSON.parse(corpo.toString('utf8'))
    } catch {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Corpo non JSON.' } })
    }

    if ((TOPIC_GESTITI as readonly string[]).includes(topic)) {
      // Si risponde 200 **prima** di elaborare: Shopify riprova se aspetta troppo, e un
      // ordine consegnato due volte è peggio di un'elaborazione un secondo più tardi.
      elaboraInBackground(topic, payload)
    }
    return reply.code(200).send({ ok: true })
  })
}
