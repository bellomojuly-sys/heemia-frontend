import type { Role } from '@prisma/client'

export interface SessionUser {
  id: string
  nome: string
  email: string
  role: Role
  scope: string
  sessionId: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser
  }
}
