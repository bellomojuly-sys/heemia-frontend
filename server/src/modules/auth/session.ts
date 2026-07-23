// Sessioni server-side revocabili (System_Architecture §4, decisione A2: no JWT stateless).
import { prisma } from '../../core/prisma.js'
import { config } from '../../core/config.js'
import type { Role } from '@prisma/client'

export const SESSION_COOKIE = 'heemia_sid'

export async function createSession(userId: string, role: Role, scope = 'interno') {
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000)
  const session = await prisma.session.create({
    data: { userId, role, scope, expiresAt },
  })
  return session
}

export async function findValidSession(sessionId: string) {
  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  })
  if (!s) return null
  if (s.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: s.id } }).catch(() => {})
    return null
  }
  if (!s.user || !s.user.attivo) return null
  return s
}

export async function revokeSession(sessionId: string) {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {})
}
