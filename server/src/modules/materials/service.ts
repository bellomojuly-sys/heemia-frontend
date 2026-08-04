// FR-04 — Inventario tessuti e accessori.
// Regole da Functional_Requirements_Heemia_App.md §8-9 e Database_Schema (materials, accessories):
//   residuo = acquistati - utilizzati (campo calcolato, non persistito)
//   stato = esaurito se residuo <= 0 ; sotto_soglia se residuo <= soglia_minima ; altrimenti disponibile
//   "da_verificare" resta uno stato manuale: se impostato a mano non viene sovrascritto dal ricalcolo.
import { Prisma } from '@prisma/client'
import type { MaterialStato } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { conflict, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'

const r2 = (n: number) => Math.round(n * 100) / 100

export function derivaStato(residuo: number, sogliaMinima: number, statoCorrente?: MaterialStato): MaterialStato {
  if (statoCorrente === 'da_verificare') return 'da_verificare'
  if (residuo <= 0) return 'esaurito'
  if (residuo <= sogliaMinima) return 'sotto_soglia'
  return 'disponibile'
}

// ---------- Tessuti ----------

function decorateMaterial<T extends { metriAcquistati: Prisma.Decimal; metriUtilizzati: Prisma.Decimal; prezzoAlMetro: Prisma.Decimal }>(m: T) {
  return {
    ...m,
    metriResidui: r2(Number(m.metriAcquistati) - Number(m.metriUtilizzati)),
    costoAlMetro: Number(m.prezzoAlMetro),
  }
}

export async function listMaterials(filters: { stato?: string; supplierId?: string; q?: string }) {
  const where: Prisma.MaterialWhereInput = {}
  if (filters.stato) where.stato = filters.stato as MaterialStato
  if (filters.supplierId) where.supplierId = filters.supplierId
  if (filters.q) {
    where.OR = [
      { nome: { contains: filters.q, mode: 'insensitive' } },
      { codice: { contains: filters.q, mode: 'insensitive' } },
    ]
  }
  const rows = await prisma.material.findMany({
    where,
    orderBy: { nome: 'asc' },
    include: { supplier: { select: { id: true, nome: true } } },
  })
  return rows.map(decorateMaterial)
}

export async function getMaterial(id: string) {
  const m = await prisma.material.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, nome: true } },
      products: { include: { product: { select: { id: true, nome: true, codiceProdotto: true } } } },
    },
  })
  if (!m) throw notFound('Tessuto non trovato')
  return decorateMaterial(m)
}

export async function createMaterial(input: Prisma.MaterialCreateInput, userId: string) {
  const exists = await prisma.material.findUnique({ where: { codice: input.codice } })
  if (exists) throw conflict(`Codice tessuto "${input.codice}" gia esistente`)
  const residuo = Number(input.metriAcquistati ?? 0) - Number(input.metriUtilizzati ?? 0)
  const data: Prisma.MaterialCreateInput = {
    ...input,
    stato: input.stato ?? derivaStato(residuo, Number(input.sogliaMinima ?? 0)),
  }
  return prisma.$transaction(async (tx) => {
    const created = await tx.material.create({ data })
    await logActivity(tx, { userId, azione: 'create', entita: 'material', entitaId: created.id, valoreNuovo: created.nome })
    return decorateMaterial(created)
  })
}

export async function updateMaterial(id: string, input: Prisma.MaterialUpdateInput, userId: string) {
  const before = await prisma.material.findUnique({ where: { id } })
  if (!before) throw notFound('Tessuto non trovato')
  return prisma.$transaction(async (tx) => {
    const updated = await tx.material.update({ where: { id }, data: input })
    // Ricalcolo stato dopo la modifica, salvo stato imposto esplicitamente nella richiesta.
    const residuo = Number(updated.metriAcquistati) - Number(updated.metriUtilizzati)
    const statoDerivato = derivaStato(residuo, Number(updated.sogliaMinima), updated.stato)
    const finale =
      input.stato === undefined && statoDerivato !== updated.stato
        ? await tx.material.update({ where: { id }, data: { stato: statoDerivato } })
        : updated
    await logActivity(tx, {
      userId, azione: 'update', entita: 'material', entitaId: id,
      valorePrecedente: `${before.nome} - ${before.stato}`,
      valoreNuovo: `${finale.nome} - ${finale.stato}`,
    })
    return decorateMaterial(finale)
  })
}

// Consumo metri: aggiorna metri_utilizzati e ricalcola lo stato (FR-04, alert FR-05).
export async function consumeMaterial(id: string, metri: number, userId: string) {
  const m = await prisma.material.findUnique({ where: { id } })
  if (!m) throw notFound('Tessuto non trovato')
  const utilizzati = r2(Number(m.metriUtilizzati) + metri)
  const residuo = r2(Number(m.metriAcquistati) - utilizzati)
  return prisma.$transaction(async (tx) => {
    const updated = await tx.material.update({
      where: { id },
      data: { metriUtilizzati: new Prisma.Decimal(utilizzati), stato: derivaStato(residuo, Number(m.sogliaMinima), m.stato) },
    })
    await logActivity(tx, {
      userId, azione: 'consume', entita: 'material', entitaId: id,
      valorePrecedente: String(Number(m.metriUtilizzati)), valoreNuovo: String(utilizzati),
    })
    return decorateMaterial(updated)
  })
}

// ---------- Accessori ----------

function decorateAccessory<T extends { quantitaAcquistata: Prisma.Decimal; quantitaUtilizzata: Prisma.Decimal }>(a: T) {
  return { ...a, quantitaResidua: r2(Number(a.quantitaAcquistata) - Number(a.quantitaUtilizzata)) }
}

export async function listAccessories(filters: { stato?: string; supplierId?: string; q?: string }) {
  const where: Prisma.AccessoryWhereInput = {}
  if (filters.stato) where.stato = filters.stato as MaterialStato
  if (filters.supplierId) where.supplierId = filters.supplierId
  if (filters.q) {
    where.OR = [
      { nome: { contains: filters.q, mode: 'insensitive' } },
      { codice: { contains: filters.q, mode: 'insensitive' } },
    ]
  }
  const rows = await prisma.accessory.findMany({
    where,
    orderBy: { nome: 'asc' },
    include: { supplier: { select: { id: true, nome: true } } },
  })
  return rows.map(decorateAccessory)
}

export async function getAccessory(id: string) {
  const a = await prisma.accessory.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, nome: true } },
      products: { include: { product: { select: { id: true, nome: true, codiceProdotto: true } } } },
    },
  })
  if (!a) throw notFound('Accessorio non trovato')
  return decorateAccessory(a)
}

export async function createAccessory(input: Prisma.AccessoryCreateInput, userId: string) {
  const exists = await prisma.accessory.findUnique({ where: { codice: input.codice } })
  if (exists) throw conflict(`Codice accessorio "${input.codice}" gia esistente`)
  const residuo = Number(input.quantitaAcquistata ?? 0) - Number(input.quantitaUtilizzata ?? 0)
  const data: Prisma.AccessoryCreateInput = {
    ...input,
    stato: input.stato ?? derivaStato(residuo, Number(input.sogliaMinima ?? 0)),
  }
  return prisma.$transaction(async (tx) => {
    const created = await tx.accessory.create({ data })
    await logActivity(tx, { userId, azione: 'create', entita: 'accessory', entitaId: created.id, valoreNuovo: created.nome })
    return decorateAccessory(created)
  })
}

export async function updateAccessory(id: string, input: Prisma.AccessoryUpdateInput, userId: string) {
  const before = await prisma.accessory.findUnique({ where: { id } })
  if (!before) throw notFound('Accessorio non trovato')
  return prisma.$transaction(async (tx) => {
    const updated = await tx.accessory.update({ where: { id }, data: input })
    const residuo = Number(updated.quantitaAcquistata) - Number(updated.quantitaUtilizzata)
    const statoDerivato = derivaStato(residuo, Number(updated.sogliaMinima), updated.stato)
    const finale =
      input.stato === undefined && statoDerivato !== updated.stato
        ? await tx.accessory.update({ where: { id }, data: { stato: statoDerivato } })
        : updated
    await logActivity(tx, {
      userId, azione: 'update', entita: 'accessory', entitaId: id,
      valorePrecedente: `${before.nome} - ${before.stato}`,
      valoreNuovo: `${finale.nome} - ${finale.stato}`,
    })
    return decorateAccessory(finale)
  })
}

export async function consumeAccessory(id: string, quantita: number, userId: string) {
  const a = await prisma.accessory.findUnique({ where: { id } })
  if (!a) throw notFound('Accessorio non trovato')
  const utilizzata = r2(Number(a.quantitaUtilizzata) + quantita)
  const residuo = r2(Number(a.quantitaAcquistata) - utilizzata)
  return prisma.$transaction(async (tx) => {
    const updated = await tx.accessory.update({
      where: { id },
      data: { quantitaUtilizzata: new Prisma.Decimal(utilizzata), stato: derivaStato(residuo, Number(a.sogliaMinima), a.stato) },
    })
    await logActivity(tx, {
      userId, azione: 'consume', entita: 'accessory', entitaId: id,
      valorePrecedente: String(Number(a.quantitaUtilizzata)), valoreNuovo: String(utilizzata),
    })
    return decorateAccessory(updated)
  })
}

// ---------- Alert scorte (FR-05) ----------

export async function listStockAlerts() {
  const [materials, accessories] = await Promise.all([
    prisma.material.findMany({ where: { stato: { in: ['sotto_soglia', 'esaurito'] } }, orderBy: { stato: 'asc' } }),
    prisma.accessory.findMany({ where: { stato: { in: ['sotto_soglia', 'esaurito'] } }, orderBy: { stato: 'asc' } }),
  ])
  return {
    materials: materials.map((m) => ({
      id: m.id, nome: m.nome, codice: m.codice, stato: m.stato, unitaMisura: m.unitaMisura,
      residuo: r2(Number(m.metriAcquistati) - Number(m.metriUtilizzati)), sogliaMinima: Number(m.sogliaMinima),
    })),
    accessories: accessories.map((a) => ({
      id: a.id, nome: a.nome, codice: a.codice, stato: a.stato, unitaMisura: a.unitaMisura,
      residuo: r2(Number(a.quantitaAcquistata) - Number(a.quantitaUtilizzata)), sogliaMinima: Number(a.sogliaMinima),
    })),
  }
}
