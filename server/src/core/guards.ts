import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Role } from '@prisma/client'
import { SESSION_COOKIE, findValidSession } from '../modules/auth/session.js'
import { canAccessModule, canEdit, type ModuleKey } from './permissions.js'
import { forbidden, unauthorized } from './errors.js'

// Popola request.user dalla sessione cookie. Da usare come preHandler sugli endpoint protetti.
export async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
  const sid = req.cookies?.[SESSION_COOKIE]
  if (!sid) throw unauthorized()
  const unsigned = req.unsignCookie(sid)
  if (!unsigned.valid || !unsigned.value) throw unauthorized()
  const session = await findValidSession(unsigned.value)
  if (!session || !session.user) throw unauthorized('Sessione scaduta o non valida')
  req.user = {
    id: session.user.id,
    nome: session.user.nome,
    email: session.user.email,
    role: session.user.role,
    scope: session.scope,
    sessionId: session.id,
  }
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest) => {
    if (!req.user) throw unauthorized()
    if (!roles.includes(req.user.role)) throw forbidden()
  }
}

export function requireModule(moduleKey: ModuleKey) {
  return async (req: FastifyRequest) => {
    if (!req.user) throw unauthorized()
    if (!canAccessModule(req.user.role, moduleKey)) throw forbidden()
  }
}

export function requireEdit(req: FastifyRequest) {
  if (!req.user) throw unauthorized()
  if (!canEdit(req.user.role)) throw forbidden('Il tuo ruolo è in sola lettura')
}
