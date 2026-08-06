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
import { alertRoutes } from './modules/alerts/routes.js'
import { dashboardRoutes } from './modules/dashboard/routes.js'
import { reportRoutes } from './modules/reports/routes.js'
import { integrationRoutes } from './modules/integrations/routes.js'
import { showroomRoutes } from './modules/showroom/routes.js'
import { showroomRequestRoutes } from './modules/showroomRequests/routes.js'
import { aiRoutes } from './modules/ai/routes.js'
import { analyticsRoutes } from './modules/analytics/routes.js'

// Prefisso versionato deciso in DEC-036 (allineamento codice <-> API_Mapping).
// La sub-app showroom usa /api/showroom, fuori dal versionamento interno.
export const API_PREFIX = '/api/v1'
export const SHOWROOM_PREFIX = '/api/showroom'

export async function buildApp() {
  // bodyLimit alzato a 30 MB: la scansione AI riceve il PDF della scheda tecnica
  // codificato in base64 (che pesa ~1/3 in più del file originale).
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
    return { status: 'ok', env: config.env, time: new Date().toISOString() }
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
  await app.register(alertRoutes, { prefix: API_PREFIX })
  await app.register(dashboardRoutes, { prefix: API_PREFIX })
  await app.register(reportRoutes, { prefix: API_PREFIX })
  await app.register(integrationRoutes, { prefix: API_PREFIX })
  await app.register(aiRoutes, { prefix: API_PREFIX })
  await app.register(analyticsRoutes, { prefix: API_PREFIX })
  await app.register(showroomRequestRoutes, { prefix: API_PREFIX })

  // Sub-app cliente: scope separato, non eredita nulla dell'API interna (A5).
  await app.register(showroomRoutes, { prefix: SHOWROOM_PREFIX })

  return app
}
