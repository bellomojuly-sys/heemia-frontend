// FR-18: ogni azione rilevante finisce in activity_logs. Scritto dai service dentro la
// stessa transazione dell'operazione, quando serve atomicità (System_Architecture §3).
import type { Prisma, PrismaClient } from '@prisma/client'

type Client = PrismaClient | Prisma.TransactionClient

export async function logActivity(
  db: Client,
  params: {
    userId?: string | null
    azione: string
    entita: string
    entitaId?: string
    valorePrecedente?: string
    valoreNuovo?: string
  },
) {
  await db.activityLog.create({
    data: {
      userId: params.userId ?? null,
      azione: params.azione,
      entita: params.entita,
      entitaId: params.entitaId,
      valorePrecedente: params.valorePrecedente,
      valoreNuovo: params.valoreNuovo,
    },
  })
}
