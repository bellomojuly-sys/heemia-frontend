// Integrazioni esterne: Shopify (FR-17, DEC-009), OpenAI (FR-12/13/28, DEC-050) e la
// prova d'invio Gmail (FR-06, DEC-028 — l'invio vero vive in suppliers/service.ts).
//
// ⚠️ Stato reale: Shopify e le tre funzioni AI qui sotto NON sono ancora implementate. Richiedono credenziali che non sono state
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
import { authenticate, requireModule, requireEdit, requireRole } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { prisma } from '../../core/prisma.js'
import { logActivity } from '../../core/activityLog.js'
import { config } from '../../core/config.js'
import { inviaEmail } from '../gmail/service.js'
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
  // Volutamente SENZA `requireEdit`: l'assistente risponde a domande e non modifica dati,
  // e la matrice dei permessi apre `ai-assistant` a tutti i ruoli interni, viewer compreso.
  // Si chiamava `aiWrite`, nome che prometteva un controllo di scrittura che non c'è mai
  // stato: se un giorno l'assistente scriverà qualcosa, qui va aggiunto `requireEdit`.
  const aiSolaLettura = { preHandler: [authenticate, requireModule('ai-assistant')] }

  // Quadro delle integrazioni per la diagnosi (Fase 15.1): quali credenziali risultano
  // presenti sul server che sta girando davvero. Restituisce solo presenza/assenza e i
  // nomi delle variabili mancanti — mai un valore di credenziale. Gating "impostazioni"
  // (aperto a tutti i ruoli interni): è la stessa informazione che l'app già dà a chi
  // preme un pulsante disattivato, qui raccolta in un punto solo.
  app.get('/integrations/status', { preHandler: [authenticate, requireModule('impostazioni')] }, async () => ({
    integrazioni: statoIntegrazioni(),
  }))

  // Prova d'invio (Fase 15.1 punto 2): manda un'email **all'indirizzo aziendale stesso**,
  // così si verifica la credenziale senza scrivere a un fornitore vero. È il modo per
  // sapere che l'integrazione funziona il giorno in cui le credenziali arrivano, e per
  // riconoscere subito il refresh token scaduto (Integrazioni_Setup §2) invece di
  // scoprirlo la prima volta che serve davvero. Riservata ad Admin/CEO: manda posta.
  app.post(
    '/integrations/gmail/test',
    { preHandler: [authenticate, requireModule('impostazioni'), requireEdit, requireRole('admin', 'ceo')] },
    async (req) => {
      richiediConfigurata('gmail')
      const quando = new Date().toLocaleString('it-IT')
      const esito = await inviaEmail({
        a: config.gmailMittente,
        oggetto: 'Heemia — prova di invio',
        testo:
          `Messaggio di prova inviato da Heemia il ${quando}.\n\n` +
          'Se lo stai leggendo, l\'invio delle richieste ai fornitori dall\'app funziona.\n' +
          'Nessun fornitore è stato contattato: questa email è partita verso l\'indirizzo aziendale stesso.',
      })
      await logActivity(prisma, {
        userId: req.user!.id, azione: 'prova_invio_gmail', entita: 'integrazione',
        valoreNuovo: `email di prova a ${config.gmailMittente} (messaggio Gmail ${esito.id})`,
      })
      return { inviata: true, destinatario: config.gmailMittente, messaggioId: esito.id }
    },
  )

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

  app.post('/ai/assistant', aiSolaLettura, async (req) => {
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
