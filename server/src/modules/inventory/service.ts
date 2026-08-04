// Inventario prodotti finiti. Porting di updateVariantQuantities dal MockStore: il record
// inventario e la variante restano allineati, stato e divergenza Shopify sono ricalcolati
// dal server (mai inviati dal client).
import type { InventoryStato } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'

/** Stessa soglia del prototipo (variantStato): 0 = esaurito, <= soglia = low_stock. */
export function stockStato(qta: number, sogliaMinima: number): InventoryStato {
  if (qta <= 0) return 'esaurito'
  if (qta <= sogliaMinima) return 'low_stock'
  return 'disponibile'
}

export function listInventory(filters: { stato?: string; divergenza?: boolean }) {
  return prisma.inventoryRecord.findMany({
    where: {
      stato: filters.stato ? (filters.stato as InventoryStato) : undefined,
      divergenzaShopify: filters.divergenza,
    },
    orderBy: { updatedAt: 'desc' },
    include: { variant: { include: { product: true } } },
  })
}

export interface InventoryPatch {
  qtaMagazzino?: number
  qtaLaboratorio?: number
  qtaRiservata?: number
  qtaVenduta?: number
  sogliaMinima?: number
}

export async function updateInventoryRecord(id: string, patch: InventoryPatch, userId: string) {
  const before = await prisma.inventoryRecord.findUnique({ where: { id } })
  if (!before) throw notFound('Record di inventario non trovato')

  const qtaMagazzino = patch.qtaMagazzino ?? before.qtaMagazzino
  const qtaRiservata = patch.qtaRiservata ?? before.qtaRiservata
  const sogliaMinima = patch.sogliaMinima ?? before.sogliaMinima
  const stato = stockStato(qtaMagazzino, sogliaMinima)
  // La divergenza è la differenza rispetto allo stock noto su Shopify (aggiornato dal sync).
  const divergenzaShopify = before.stockShopify !== qtaMagazzino

  return prisma.$transaction(async (tx) => {
    const updated = await tx.inventoryRecord.update({
      where: { id },
      data: {
        qtaMagazzino,
        qtaLaboratorio: patch.qtaLaboratorio ?? before.qtaLaboratorio,
        qtaRiservata,
        qtaVenduta: patch.qtaVenduta ?? before.qtaVenduta,
        sogliaMinima,
        stato,
        divergenzaShopify,
      },
    })
    // La variante segue il record: sono due facce dello stesso dato (FR-03/FR-INV-01).
    await tx.productVariant.update({
      where: { id: before.variantId },
      data: {
        stockDisponibile: qtaMagazzino,
        stockRiservato: qtaRiservata,
        statoDisponibilita: stato === 'low_stock' ? 'low_stock' : stato === 'esaurito' ? 'esaurito' : 'disponibile',
      },
    })
    await logActivity(tx, {
      userId, azione: 'update', entita: 'inventory_record', entitaId: id,
      valorePrecedente: `magazzino ${before.qtaMagazzino}`, valoreNuovo: `magazzino ${qtaMagazzino}`,
    })
    return updated
  })
}
