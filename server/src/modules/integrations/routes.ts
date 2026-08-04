// Integrazioni esterne: Shopify (FR-17, DEC-009) e Claude API (FR-12/13/28).
//
// ⚠️ Stato reale: NON ancora implementate. Richiedono credenziali che non sono state
// ancora create (custom app Shopify, ANTHROPIC_API_KEY) — vedi API_Mapping §B1/§B4.
// Gli endpoint esistono per non lasciare buchi nel contratto API e rispondono
// 409 CONFLICT con una ragione leggibile finché le chiavi non sono configurate:
// meglio un errore esplicito che un endpoint che finge di funzionare.
//
// Quando si costruirà il client Shopify vanno previsti retry/backoff, timeout,
// idempotenza delle scritture e verifica HMAC dei webhook (API_Mapping §B1, nota).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest, conflict } from '../../core/errors.js'
import { prisma } from '../../core/prisma.js'

const shopifyConfigured = () =>
  Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_API_TOKEN)
const anthropicConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY)

const NOT_CONFIGURED_SHOPIFY =
  'Integrazione Shopify non ancora attiva: mancano SHOPIFY_STORE_DOMAIN e SHOPIFY_ADMIN_API_TOKEN (custom app da creare nell\'admin del negozio, API_Mapping §B1).'
const NOT_CONFIGURED_AI =
  'Funzioni AI non ancora attive: manca ANTHROPIC_API_KEY (API_Mapping §B4).'

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function integrationRoutes(app: FastifyInstance) {
  const shopifyRead = { preHandler: [authenticate, requireModule('shopify')] }
  const shopifyWrite = { preHandler: [authenticate, requireModule('shopify'), requireEdit] }
  const aiWrite = { preHandler: [authenticate, requireModule('ai-assistant')] }

  // Stato pubblicazione/divergenze: la parte calcolabile dai dati locali funziona già;
  // "ultima riconciliazione" resta null finché il sync non esiste.
  app.get('/shopify/status', shopifyRead, async () => {
    const [pubblicati, nonPubblicati, divergenze] = await Promise.all([
      prisma.product.count({ where: { statoPubblicazioneShopify: 'pubblicato' } }),
      prisma.product.count({ where: { statoPubblicazioneShopify: { not: 'pubblicato' } } }),
      prisma.inventoryRecord.count({ where: { divergenzaShopify: true } }),
    ])
    return {
      configurato: shopifyConfigured(),
      pubblicati,
      nonPubblicati,
      divergenzeStock: divergenze,
      ultimaRiconciliazione: null,
      nota: shopifyConfigured() ? undefined : NOT_CONFIGURED_SHOPIFY,
    }
  })

  app.post('/shopify/sync', shopifyWrite, async () => {
    if (!shopifyConfigured()) throw conflict(NOT_CONFIGURED_SHOPIFY)
    throw conflict('Sync Shopify non ancora implementato (pianificato come P2, API_Mapping §B1).')
  })

  // --- AI (FR-12/13/28) ---
  const assistantSchema = z.object({ domanda: z.string().min(1).max(2000), sessionId: z.string().uuid().optional() })
  const descriptionSchema = z.object({ productId: z.string().uuid() })
  const cashClosureSchema = z.object({ mese: z.string().regex(/^\d{4}-\d{2}$/) })

  app.post('/ai/assistant', aiWrite, async (req) => {
    parse(assistantSchema, req.body)
    if (!anthropicConfigured()) throw conflict(NOT_CONFIGURED_AI)
    throw conflict('Assistente AI non ancora implementato (API_Mapping §B4).')
  })

  app.post('/ai/product-description', { preHandler: [authenticate, requireModule('prodotti'), requireEdit] }, async (req) => {
    parse(descriptionSchema, req.body)
    if (!anthropicConfigured()) throw conflict(NOT_CONFIGURED_AI)
    throw conflict('Generazione descrizioni non ancora implementata (API_Mapping §B4).')
  })

  app.post('/ai/cash-closure', { preHandler: [authenticate, requireModule('fatture'), requireEdit] }, async (req) => {
    parse(cashClosureSchema, req.body)
    if (!anthropicConfigured()) throw conflict(NOT_CONFIGURED_AI)
    throw conflict('Riepilogo AI non ancora implementato: la chiusura di cassa salva già un riepilogo derivato dai dati (DEC-031).')
  })
}
