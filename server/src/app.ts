import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config } from './core/config.js'
import { AppError } from './core/errors.js'
import { reportError } from './core/reportError.js'
import { prisma } from './core/prisma.js'
import './core/types.js'
import { authRoutes } from './modules/auth/routes.js'
import { productRoutes } from './modules/products/routes.js'
import { marginsRoutes } from './modules/margins/routes.js'
import { materialRoutes } from './modules/materials/routes.js'
import { productionRoutes } from './modules/production/routes.js'
import { customerRoutes } from './modules/customers/routes.js'
import { supplierRoutes } from './modules/suppliers/routes.js'
import { orderRoutes } from './modules/orders/routes.js'
import { invoiceRoutes } from './modules/invoices/routes.js'
import { inventoryRoutes } from './modules/inventory/routes.js'
import { lavorazioniRoutes } from './modules/lavorazioni/routes.js'
import { alertRoutes } from './modules/alerts/routes.js'
import { dashboardRoutes } from './modules/dashboard/routes.js'
import { reportRoutes } from './modules/reports/routes.js'
import { integrationRoutes } from './modules/integrations/routes.js'
import { showroomRoutes } from './modules/showroom/routes.js'
import { showroomRequestRoutes } from './modules/showroomRequests/routes.js'
import { aiRoutes } from './modules/ai/routes.js'
import { analyticsRoutes } from './modules/analytics/routes.js'
import { driveRoutes } from './modules/drive/routes.js'

// Prefisso versionato deciso in DEC-036 (allineamento codice <-> API_Mapping).
// La sub-app showroom usa /api/showroom, fuori dal versionamento interno.
export const API_PREFIX = '/api/v1'
export const SHOWROOM_PREFIX = '/api/showroom'

export async function buildApp() {
  // bodyLimit alzato a 30 MB: le letture AI ricevono PDF o immagini codificati in base64
  // (che pesano ~1/3 in più del file originale).
  const app = Fastify({
    logger: { level: config.isProd ? 'info' : 'debug' },
    bodyLimit: 30 * 1024 * 1024,
  })

  // Intestazioni di sicurezza (Fase 15). Vanno registrate per prime, così valgono anche
  // per le risposte d'errore. Il backend serve solo JSON: non ha pagine da mostrare, quindi
  // la Content-Security-Policy è la più restrittiva possibile (nessuna origine consentita)
  // e `frameguard` impedisce che le risposte finiscano dentro un iframe altrui.
  // HSTS solo in produzione: in locale il server è in HTTP e forzare HTTPS lo renderebbe
  // irraggiungibile dal browser dopo la prima visita.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // il frontend sta su un altro dominio
    hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
  })

  await app.register(cookie, { secret: config.sessionSecret })
  // I metodi vanno dichiarati esplicitamente: il default di @fastify/cors è GET,HEAD,POST,
  // quindi senza questa riga il browser blocca in preflight OGNI modifica (PATCH/PUT/DELETE)
  // e i salvataggi falliscono silenziosamente con "Failed to fetch". Da curl invece passano,
  // perché il preflight CORS lo fa solo il browser.
  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'],
  })
  // Difesa base: rate limit globale; il login ha un limite più stretto (System_Architecture §4).
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

  // ⚠️ Nota CSRF, da leggere prima di toccare i parser del corpo.
  // In produzione il cookie di sessione è `SameSite=None` (frontend e backend stanno su
  // domini diversi su Render), quindi il browser lo invia ANCHE sulle richieste partite da
  // un altro sito: la difesa nativa non c'è. Quello che oggi ci protegge è che questa API
  // accetta solo `application/json`, e un corpo JSON obbliga il browser a fare il preflight,
  // che il CORS blocca. Registrare un parser per `application/x-www-form-urlencoded` o
  // `multipart/form-data` (es. @fastify/formbody, @fastify/multipart) toglie quel preflight
  // e apre il CSRF su tutte le scritture. Se un giorno serve, va aggiunto insieme a un
  // token anti-CSRF, non da solo.

  // Tutti gli identificativi che compaiono nei percorsi sono UUID di database: le rotte li
  // leggono con un cast (`req.params as { id: string }`), che è una promessa fatta al
  // compilatore e non un controllo. Un valore diverso arrivava fino a Prisma e tornava
  // indietro come 500 «Errore interno del server», con lo stack nei log, dove la risposta
  // onesta è 400. Qui il controllo si fa una volta per tutte, e vale anche per le rotte
  // che verranno scritte domani — compresi i quattro endpoint pubblici dello showroom,
  // che sono raggiungibili senza sessione.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  app.addHook('onRequest', async (req) => {
    const params = req.params as Record<string, unknown> | undefined
    if (!params) return
    for (const [nome, valore] of Object.entries(params)) {
      // Convenzione dei percorsi: `id` o `qualcosaId` è sempre un identificativo di database.
      if (nome !== 'id' && !nome.endsWith('Id')) continue
      if (typeof valore === 'string' && UUID.test(valore)) continue
      throw new AppError(400, `Identificativo non valido nel percorso: ${nome}`, 'BAD_REQUEST')
    }
  })

  // Formato errore da API_Mapping §Convenzioni: { error: { code, message } }.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.status).send({ error: { code: err.code ?? 'ERROR', message: err.message } })
    }
    if ((err as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send({ error: { code: 'RATE_LIMIT', message: 'Troppe richieste, riprova tra poco' } })
    }
    // Seam unico di cattura: log strutturato ora, monitoring esterno agganciabile lì (reportError.ts).
    reportError(err, req)
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Errore interno del server' } })
  })

  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`
    return {
      status: 'ok',
      env: config.env,
      time: new Date().toISOString(),
      // Commit che sta girando davvero. Render lo inietta da sé (RENDER_GIT_COMMIT), in
      // locale non c'è e resta null. Serve a rispondere dall'esterno alla domanda "il
      // deploy è andato?": senza, l'unico modo era aprire il pannello Render, e un
      // backend fermo alla versione precedente è indistinguibile da uno aggiornato.
      // Solo l'identificativo breve: dice quale versione, non cosa contiene.
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
    }
  })

  await app.register(authRoutes, { prefix: API_PREFIX })
  await app.register(productRoutes, { prefix: API_PREFIX })
  await app.register(marginsRoutes, { prefix: API_PREFIX })
  await app.register(materialRoutes, { prefix: API_PREFIX })
  await app.register(productionRoutes, { prefix: API_PREFIX })
  await app.register(customerRoutes, { prefix: API_PREFIX })
  await app.register(supplierRoutes, { prefix: API_PREFIX })
  await app.register(orderRoutes, { prefix: API_PREFIX })
  await app.register(invoiceRoutes, { prefix: API_PREFIX })
  await app.register(inventoryRoutes, { prefix: API_PREFIX })
  await app.register(lavorazioniRoutes, { prefix: API_PREFIX })
  await app.register(alertRoutes, { prefix: API_PREFIX })
  await app.register(dashboardRoutes, { prefix: API_PREFIX })
  await app.register(reportRoutes, { prefix: API_PREFIX })
  await app.register(integrationRoutes, { prefix: API_PREFIX })
  await app.register(aiRoutes, { prefix: API_PREFIX })
  await app.register(analyticsRoutes, { prefix: API_PREFIX })
  await app.register(driveRoutes, { prefix: API_PREFIX })
  await app.register(showroomRequestRoutes, { prefix: API_PREFIX })

  // Sub-app cliente: scope separato, non eredita nulla dell'API interna (A5).
  await app.register(showroomRoutes, { prefix: SHOWROOM_PREFIX })

  return app
}
