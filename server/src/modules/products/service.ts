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
    // FR-07: ogni prodotto entra subito in pipeline dalla sua fase iniziale. Senza questo
    // step il capo non comparirebbe nel kanban Produzione (comportamento del prototipo).
    await tx.productionStep.create({
      data: {
        productId: created.id,
        fase: created.stato,
        responsabile: 'Da assegnare',
        dataInizio: new Date(),
        bloccata: false,
      },
    })
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

// --- Varianti (FR-03) ---
// Porting di addVariant: variante e record inventario nascono insieme e restano collegati.

export async function createVariant(
  productId: string,
  input: { sku: string; taglia: string; colore: string; stockIniziale: number; sogliaMinima: number; immagineUrl?: string },
  userId: string,
) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw notFound('Prodotto non trovato')
  const dup = await prisma.productVariant.findUnique({ where: { sku: input.sku } })
  if (dup) throw conflict(`SKU "${input.sku}" già esistente`)

  const stato = stockStato(input.stockIniziale, input.sogliaMinima)
  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.create({
      data: {
        productId,
        sku: input.sku,
        taglia: input.taglia,
        colore: input.colore,
        stockDisponibile: input.stockIniziale,
        immagineUrl: input.immagineUrl,
        statoDisponibilita: stato,
      },
    })
    await tx.inventoryRecord.create({
      data: {
        variantId: variant.id,
        qtaMagazzino: input.stockIniziale,
        sogliaMinima: input.sogliaMinima,
        stato,
        stockShopify: input.stockIniziale,
        divergenzaShopify: false,
      },
    })
    await logActivity(tx, { userId, azione: 'create', entita: 'product_variant', entitaId: variant.id, valoreNuovo: variant.sku })
    return variant
  })
}

/** Stessa soglia del prototipo (variantStato): 0 = esaurito, <= soglia = low_stock. */
function stockStato(qta: number, sogliaMinima: number): 'disponibile' | 'esaurito' | 'low_stock' {
  if (qta <= 0) return 'esaurito'
  if (qta <= sogliaMinima) return 'low_stock'
  return 'disponibile'
}

// Aggiorna le quantità di una variante passando dal record inventario, così i due
// restano allineati (stessa logica di updateVariantQuantities nel MockStore).
export async function updateVariantQuantities(
  variantId: string,
  patch: { qtaMagazzino?: number; qtaLaboratorio?: number; qtaRiservata?: number; sogliaMinima?: number },
  userId: string,
) {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { inventory: true } })
  if (!variant) throw notFound('Variante non trovata')

  const rec = variant.inventory
  const qtaMagazzino = patch.qtaMagazzino ?? rec?.qtaMagazzino ?? 0
  const qtaRiservata = patch.qtaRiservata ?? rec?.qtaRiservata ?? 0
  const sogliaMinima = patch.sogliaMinima ?? rec?.sogliaMinima ?? 0
  const stato = stockStato(qtaMagazzino, sogliaMinima)

  return prisma.$transaction(async (tx) => {
    const inventory = await tx.inventoryRecord.upsert({
      where: { variantId },
      update: {
        qtaMagazzino,
        qtaLaboratorio: patch.qtaLaboratorio ?? rec?.qtaLaboratorio ?? 0,
        qtaRiservata,
        sogliaMinima,
        stato,
        divergenzaShopify: (rec?.stockShopify ?? qtaMagazzino) !== qtaMagazzino,
      },
      create: {
        variantId,
        qtaMagazzino,
        qtaLaboratorio: patch.qtaLaboratorio ?? 0,
        qtaRiservata,
        sogliaMinima,
        stato,
        stockShopify: qtaMagazzino,
        divergenzaShopify: false,
      },
    })
    const updated = await tx.productVariant.update({
      where: { id: variantId },
      data: { stockDisponibile: qtaMagazzino, stockRiservato: qtaRiservata, statoDisponibilita: stato },
    })
    await logActivity(tx, {
      userId, azione: 'update', entita: 'product_variant', entitaId: variantId,
      valorePrecedente: `magazzino ${rec?.qtaMagazzino ?? 0}`, valoreNuovo: `magazzino ${qtaMagazzino}`,
    })
    return { variant: updated, inventory }
  })
}

// Le schede tecniche complete vivono in ./technicalSheets.ts (estensione 2026-07-30).
