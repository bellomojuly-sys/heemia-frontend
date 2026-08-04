// Ordini (FR-26/27). Porting di addOrder dal MockStore: alla creazione aggiorna il contatore
// e il valore acquistato del cliente. Include gli ordini SM-* generati dallo showroom (FR-29).
import { Prisma, type OrderStato } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'

export function listOrders(filters: { stato?: string; canale?: string }) {
  const where: Prisma.OrderWhereInput = {}
  if (filters.stato) where.stato = filters.stato as OrderStato
  if (filters.canale) where.canale = filters.canale as Prisma.OrderWhereInput['canale']
  return prisma.order.findMany({ where, orderBy: { data: 'desc' }, include: { items: true, customer: true } })
}

export interface CreateOrderInput {
  numero: string
  customerId?: string
  canale: 'shopify' | 'fisico'
  stato?: OrderStato
  priorita?: 'normale' | 'alta'
  data: string
  totale: number
  items?: {
    productId?: string
    variantId?: string
    quantita?: number
    prezzoUnitario?: number
    suMisura?: boolean
    materialeSceltoId?: string
    tagliaScelta?: string
    misure?: unknown
    noteSuMisura?: string
  }[]
}

export async function createOrder(input: CreateOrderInput, userId: string | null) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        numero: input.numero,
        customer: input.customerId ? { connect: { id: input.customerId } } : undefined,
        canale: input.canale,
        stato: input.stato ?? 'in_lavorazione',
        priorita: input.priorita ?? 'normale',
        data: new Date(input.data),
        totale: new Prisma.Decimal(input.totale),
        items: input.items?.length
          ? {
              create: input.items.map((it) => ({
                productId: it.productId,
                variantId: it.variantId,
                quantita: it.quantita ?? 1,
                prezzoUnitario: new Prisma.Decimal(it.prezzoUnitario ?? 0),
                suMisura: it.suMisura ?? false,
                materialeSceltoId: it.materialeSceltoId,
                tagliaScelta: it.tagliaScelta,
                misure: it.misure === undefined ? undefined : (it.misure as Prisma.InputJsonValue),
                noteSuMisura: it.noteSuMisura,
              })),
            }
          : undefined,
      },
      include: { items: true },
    })

    if (input.customerId) {
      await tx.customer.update({
        where: { id: input.customerId },
        data: {
          numeroOrdini: { increment: 1 },
          valoreTotaleAcquistato: { increment: new Prisma.Decimal(input.totale) },
        },
      })
    }

    await logActivity(tx, { userId, azione: 'create', entita: 'order', entitaId: order.id, valoreNuovo: order.numero })
    return order
  })
}

// Avanzamento stato ordine. La presa in carico di un SM-* (in_lavorazione → altro) spegne
// automaticamente l'alert "ordine su misura" (l'alert è derivato: cambia da sé, vedi alerts).
export async function updateOrder(
  id: string,
  patch: { stato?: OrderStato; priorita?: 'normale' | 'alta' },
  userId: string,
) {
  const before = await prisma.order.findUnique({ where: { id } })
  if (!before) throw notFound('Ordine non trovato')
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({ where: { id }, data: patch })
    await logActivity(tx, {
      userId, azione: 'update', entita: 'order', entitaId: id,
      valorePrecedente: before.stato, valoreNuovo: updated.stato,
    })
    return updated
  })
}
