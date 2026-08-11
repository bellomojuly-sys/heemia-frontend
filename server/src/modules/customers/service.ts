// Clienti (FR-24). Porting di addCustomer/customers dal DataStore: la dedup per email
// è server-side (API_Mapping §Clienti) — oggi era nel form showroom.
import { Prisma } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { logActivity } from '../../core/activityLog.js'

export function listCustomers(filters: { tipologia?: string; q?: string }) {
  const where: Prisma.CustomerWhereInput = {}
  if (filters.tipologia) where.tipologia = filters.tipologia as Prisma.CustomerWhereInput['tipologia']
  if (filters.q) where.nome = { contains: filters.q, mode: 'insensitive' }
  return prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' } })
}

// Ritrova un cliente per email (case-insensitive) o ne crea uno nuovo. Usato sia dal CRUD
// interno sia dalla registrazione showroom, così un'email esistente non genera doppioni.
export async function findOrCreateCustomer(
  input: Prisma.CustomerCreateInput,
  userId: string | null,
) {
  if (input.email) {
    const existing = await prisma.customer.findFirst({
      where: { email: { equals: input.email, mode: 'insensitive' } },
    })
    if (existing) return existing
  }
  return prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({ data: input })
    await logActivity(tx, { userId, azione: 'create', entita: 'customer', entitaId: created.id, valoreNuovo: created.nome })
    return created
  })
}
