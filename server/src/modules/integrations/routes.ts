// Integrazioni esterne: Shopify (FR-17, DEC-009) e OpenAI (FR-12/13/28, DEC-050).
//
// ⚠️ Stato reale: NON ancora implementate. Richiedono credenziali che non sono state
// ancora create (custom app Shopify, OPENAI_API_KEY) — vedi API_Mapping §B1/§B4 e
// Integrazioni_Setup.md. Gli endpoint esistono per non lasciare buchi nel contratto API
// e rispondono 409 CONFLICT con una ragione leggibile: meglio un errore esplicito che un
// endpoint che finge di funzionare. Le due ragioni sono distinte apposta — «manca la
// credenziale» e «la credenziale c'è ma il codice non è ancora scritto» — perché in
// Fase 15.1 la seconda diventerà l'unica che resta.
//
// Quando si costruirà il client Shopify vanno previsti retry/backoff, timeout,
// idempotenza delle scritture e verifica HMAC dei webhook (API_Mapping §B1, nota).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { prisma } from '../../core/prisma.js'
import {
  configurata,
  daImplementare,
  messaggioNonConfigurata,
  richiediConfigurata,
  statoIntegrazioni,
} from '../../core/integrations.js'

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function integrationRoutes(app: FastifyInstance) {
  const shopifyRead = { preHandler: [authenticate, requireModule('shopify')] }
  const shopifyWrite = { preHandler: [authenticate, requireModule('shopify'), requireEdit] }
  const aiWrite = { preHandler: [authenticate, requireModule('ai-assistant')] }

  // Quadro delle integrazioni per la diagnosi (Fase 15.1): quali credenziali risultano
  // presenti sul server che sta girando davvero. Restituisce solo presenza/assenza e i
  // nomi delle variabili mancanti — mai un valore di credenziale. Gating "impostazioni"
  // (aperto a tutti i ruoli interni): è la stessa informazione che l'app già dà a chi
  // preme un pulsante disattivato, qui raccolta in un punto solo.
  app.get('/integrations/status', { preHandler: [authenticate, requireModule('impostazioni')] }, async () => ({
    integrazioni: statoIntegrazioni(),
  }))

  // Stato pubblicazione/divergenze: la parte calcolabile dai dati locali funziona già;
  // "ultima riconciliazione" resta null finché il sync non esiste.
  app.get('/shopify/status', shopifyRead, async () => {
    const [pubblicati, nonPubblicati, divergenze] = await Promise.all([
      prisma.product.count({ where: { statoPubblicazioneShopify: 'pubblicato' } }),
      prisma.product.count({ where: { statoPubblicazioneShopify: { not: 'pubblicato' } } }),
      prisma.inventoryRecord.count({ where: { divergenzaShopify: true } }),
    ])
    return {
      configurato: configurata('shopify'),
      pubblicati,
      nonPubblicati,
      divergenzeStock: divergenze,
      ultimaRiconciliazione: null,
      nota: configurata('shopify') ? undefined : messaggioNonConfigurata('shopify'),
    }
  })

  app.post('/shopify/sync', shopifyWrite, async () => {
    richiediConfigurata('shopify')
    daImplementare('Sincronizzazione Shopify', 'Fase 15.1 punto 3, API_Mapping §B1')
  })

  // --- AI (FR-12/13/28) ---
  const assistantSchema = z.object({ domanda: z.string().min(1).max(2000), sessionId: z.string().uuid().optional() })
  const descriptionSchema = z.object({ productId: z.string().uuid() })
  const cashClosureSchema = z.object({ mese: z.string().regex(/^\d{4}-\d{2}$/) })

  app.post('/ai/assistant', aiWrite, async (req) => {
    parse(assistantSchema, req.body)
    richiediConfigurata('openai')
    daImplementare('Assistente AI', 'Fase 15.1 punto 1b, API_Mapping §B4')
  })

  app.post('/ai/product-description', { preHandler: [authenticate, requireModule('prodotti'), requireEdit] }, async (req) => {
    parse(descriptionSchema, req.body)
    richiediConfigurata('openai')
    daImplementare('Generazione delle descrizioni prodotto', 'Fase 15.1 punto 1b, API_Mapping §B4')
  })

  app.post('/ai/cash-closure', { preHandler: [authenticate, requireModule('fatture'), requireEdit] }, async (req) => {
    parse(cashClosureSchema, req.body)
    richiediConfigurata('openai')
    daImplementare(
      'Riepilogo AI della chiusura di cassa (la chiusura salva già un riepilogo derivato dai dati, DEC-031)',
      'Fase 15.1 punto 1b, API_Mapping §B4',
    )
  })
}
