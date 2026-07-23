import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../core/prisma.js'
import { badRequest, unauthorized } from '../../core/errors.js'
import { verifyPassword } from './password.js'
import { SESSION_COOKIE, createSession, revokeSession } from './session.js'
import { logActivity } from '../../core/activityLog.js'
import { authenticate } from '../../core/guards.js'
import { config } from '../../core/config.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest('Email o password non validi')
    const { email, password } = parsed.data

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    // Messaggio identico per utente inesistente o password errata (no user enumeration).
    if (!user || !user.attivo || !user.passwordHash) throw unauthorized('Credenziali non valide')
    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) throw unauthorized('Credenziali non valide')

    const session = await createSession(user.id, user.role)
    await logActivity(prisma, { userId: user.id, azione: 'login', entita: 'user', entitaId: user.id })

    reply.setCookie(SESSION_COOKIE, session.id, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      signed: true,
      path: '/',
      maxAge: config.sessionTtlHours * 3600,
    })
    return { id: user.id, nome: user.nome, email: user.email, role: user.role }
  })

  app.post('/auth/logout', { preHandler: authenticate }, async (req, reply) => {
    if (req.user) {
      await revokeSession(req.user.sessionId)
      await logActivity(prisma, { userId: req.user.id, azione: 'logout', entita: 'user', entitaId: req.user.id })
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/auth/me', { preHandler: authenticate }, async (req) => {
    return req.user
  })
}
