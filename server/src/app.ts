import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { config } from './core/config.js'
import { AppError } from './core/errors.js'
import { prisma } from './core/prisma.js'
import './core/types.js'
import { authRoutes } from './modules/auth/routes.js'
import { productRoutes } from './modules/products/routes.js'
import { marginsRoutes } from './modules/margins/routes.js'

export async function buildApp() {
  const app = Fastify({ logger: { level: config.isProd ? 'info' : 'debug' } })

  await app.register(cookie, { secret: config.sessionSecret })
  await app.register(cors, { origin: config.corsOrigin, credentials: true })
  // Difesa base: rate limit globale; il login ha un limite più stretto (System_Architecture §4).
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.status).send({ error: err.message, code: err.code })
    }
    if ((err as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send({ error: 'Troppe richieste, riprova tra poco', code: 'RATE_LIMIT' })
    }
    req.log.error(err)
    return reply.code(500).send({ error: 'Errore interno del server', code: 'INTERNAL' })
  })

  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'ok', env: config.env, time: new Date().toISOString() }
  })

  await app.register(authRoutes, { prefix: '/api' })
  await app.register(productRoutes, { prefix: '/api' })
  await app.register(marginsRoutes, { prefix: '/api' })

  return app
}
