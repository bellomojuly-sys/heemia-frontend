import { Prisma } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { conflict, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'

export function listProducts(filters: { stato?: string; linea?: string; q?: string }) {
  const where: Prisma.ProductWhereInput = {}
  if (filters.stato) where.stato = filters.stato as Prisma.ProductWhereInput['stato']
  if (filters.linea) where.linea = filters.linea as Prisma.ProductWhereInput['linea']
  if (filters.q) where.nome = { contains: filters.q, mode: 'insensitive' }
  return prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, include: { variants: true } })
}

export async function getProduct(id: string) {
  const p = await prisma.product.findUnique({
    where: { id },
    include: { variants: true, technicalSheets: true, productionSteps: true },
  })
  if (!p) throw notFound('Prodotto non trovato')
  return p
}

export async function createProduct(input: Prisma.ProductCreateInput, userId: string) {
  const exists = await prisma.product.findUnique({ where: { codiceProdotto: input.codiceProdotto } })
  if (exists) throw conflict(`Codice prodotto "${input.codiceProdotto}" già esistente`)
  return prisma.$transaction(async (tx) => {
    const created = await tx.product.create({ data: input })
    await logActivity(tx, { userId, azione: 'create', entita: 'product', entitaId: created.id, valoreNuovo: created.nome })
    return created
  })
}

export async function updateProduct(id: string, input: Prisma.ProductUpdateInput, userId: string) {
  const before = await prisma.product.findUnique({ where: { id } })
  if (!before) throw notFound('Prodotto non trovato')
  return prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({ where: { id }, data: input })
    await logActivity(tx, {
      userId, azione: 'update', entita: 'product', entitaId: id,
      valorePrecedente: before.nome, valoreNuovo: updated.nome,
    })
    return updated
  })
}
