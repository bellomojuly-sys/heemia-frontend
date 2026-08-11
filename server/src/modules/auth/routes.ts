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

// In produzione frontend e backend stanno su domini diversi (heemia-app / heemia-api su
// Render): un cookie SameSite=Lax NON verrebbe inviato con le richieste dell'app e il
// login fallirebbe. Serve SameSite=None, che i browser accettano solo insieme a Secure.
// In sviluppo (http://localhost) resta Lax, perché None+Secure non funziona su http.
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: (config.isProd ? 'none' : 'lax') as 'none' | 'lax',
  signed: true,
  path: '/',
  maxAge: config.sessionTtlHours * 3600,
}

export async function authRoutes(app: FastifyInstance) {
  // Limite stretto e dedicato sul login (System_Architecture §4): difesa brute-force sulle
  // credenziali, indipendente dal limite globale (300/min) di app.ts. Conteggio per IP.
  const loginRateLimit = {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }

  app.post('/auth/login', loginRateLimit, async (req, reply) => {
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

    reply.setCookie(SESSION_COOKIE, session.id, SESSION_COOKIE_OPTIONS)
    return { id: user.id, nome: user.nome, email: user.email, role: user.role }
  })

  app.post('/auth/logout', { preHandler: authenticate }, async (req, reply) => {
    if (req.user) {
      await revokeSession(req.user.sessionId)
      await logActivity(prisma, { userId: req.user.id, azione: 'logout', entita: 'user', entitaId: req.user.id })
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/', secure: SESSION_COOKIE_OPTIONS.secure, sameSite: SESSION_COOKIE_OPTIONS.sameSite })
    return { ok: true }
  })

  // `req.user` contiene anche l'id di sessione, che qui NON esce: il cookie è httpOnly
  // proprio perché JavaScript non debba poterlo leggere, e restituirlo nel corpo della
  // risposta annullerebbe metà di quella protezione. Al client servono identità e ruolo.
  app.get('/auth/me', { preHandler: authenticate }, async (req) => {
    const { sessionId: _sessionId, ...utente } = req.user!
    return utente
  })
}
