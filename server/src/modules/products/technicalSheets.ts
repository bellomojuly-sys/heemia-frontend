// FR-07/FR-14 — schede tecniche complete, salvate nel database (estensione 2026-07-30).
//
// Prima dell'estensione i campi strutturati (righe materiali, voci di costo, foto, storico)
// vivevano solo nel browser: non erano condivisi tra utenti né inclusi nei backup.
// Ora ogni scheda è una riga in `technical_sheets` con quattro collezioni figlie.
//
// Le collezioni si salvano con la strategia "sostituisci il set": il client manda l'elenco
// completo delle righe e il server riscrive quelle di quella scheda in un'unica transazione.
// È il comportamento che l'interfaccia si aspetta (il form modifica l'intera scheda) ed evita
// stati intermedi incoerenti.
import { Prisma } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { conflict, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'

// Tutte le letture includono le collezioni figlie: la scheda ha senso solo completa.
const INCLUDE_COMPLETO = {
  righeMateriali: { orderBy: { ordine: 'asc' } },
  righeCosti: { orderBy: { ordine: 'asc' } },
  foto: { orderBy: { caricataIl: 'asc' } },
  storicoCosti: { orderBy: { registratoIl: 'asc' } },
  misure: { orderBy: { ordine: 'asc' } },
} satisfies Prisma.TechnicalSheetInclude

export function listTechnicalSheets(productId: string) {
  return prisma.technicalSheet.findMany({
    where: { productId },
    orderBy: { createdAt: 'asc' },
    include: INCLUDE_COMPLETO,
  })
}

export async function getTechnicalSheet(id: string) {
  const sheet = await prisma.technicalSheet.findUnique({ where: { id }, include: INCLUDE_COMPLETO })
  if (!sheet) throw notFound('Scheda tecnica non trovata')
  return sheet
}

export interface RigaMaterialeInput {
  materialId?: string
  accessoryId?: string
  descrizione: string
  unitaMisura: string
  quantitaSuggerita?: number
  quantitaConfermata?: number
  percentualeScarto?: number
  supplierId?: string
  fattureCollegateIds?: string[]
  costoUnitario?: number
  fonteCosto?: Prisma.SheetMaterialUsageCreateManyInput['fonteCosto']
  fatturaCostoId?: string
}

export interface RigaCostoInput {
  voce: Prisma.SheetCostLineCreateManyInput['voce']
  label: string
  importo?: number
  kind?: Prisma.SheetCostLineCreateManyInput['kind']
  fonte?: Prisma.SheetCostLineCreateManyInput['fonte']
  fatturaId?: string
  ammortizzabile?: boolean
  quantitaPrevista?: number
}

export interface FotoInput {
  nome: string
  dataUrl: string
}

export interface MisuraInput {
  nome: string
  valore?: number
  unita?: string
  tagliaRiferimento?: string
  tolleranza?: string
  nota?: string
  fonte?: Prisma.SheetMeasurementCreateManyInput['fonte']
}

/** Campi semplici della scheda, senza le collezioni figlie. */
export type CampiScheda = Omit<Prisma.TechnicalSheetUncheckedUpdateInput, 'id' | 'productId'>

const dec = (v: number | undefined, fallback?: number) =>
  v === undefined ? (fallback === undefined ? undefined : new Prisma.Decimal(fallback)) : new Prisma.Decimal(v)

export async function createTechnicalSheet(
  productId: string,
  versione: Prisma.TechnicalSheetCreateInput['versione'],
  campi: CampiScheda,
  userId: string,
) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw notFound('Prodotto non trovato')
  const dup = await prisma.technicalSheet.findFirst({ where: { productId, versione } })
  if (dup) throw conflict(`Esiste già una scheda tecnica "${versione}" per questo prodotto`)

  return prisma.$transaction(async (tx) => {
    const created = await tx.technicalSheet.create({
      data: {
        ...(campi as Prisma.TechnicalSheetUncheckedCreateInput),
        productId,
        versione,
        // Anagrafica precompilata dal prodotto, poi editabile per versione.
        nomeProdotto: (campi.nomeProdotto as string | undefined) ?? product.nome,
        codiceProdotto: (campi.codiceProdotto as string | undefined) ?? product.codiceProdotto,
        collezione: (campi.collezione as string | undefined) ?? product.collezione,
        categoria: (campi.categoria as string | undefined) ?? product.categoria,
      },
      include: INCLUDE_COMPLETO,
    })
    await logActivity(tx, {
      userId, azione: 'create', entita: 'technical_sheet', entitaId: created.id,
      valoreNuovo: `${product.nome} — versione ${created.versione}`,
    })
    return created
  })
}

/**
 * Aggiorna la scheda. Le collezioni passate vengono **sostituite per intero**; quelle
 * omesse restano come sono. Lo storico costi non si tocca mai da qui: si aggiunge solo
 * con `addCostSnapshot` (spec §6: il passato non si riscrive).
 */
export async function updateTechnicalSheet(
  id: string,
  campi: CampiScheda,
  collezioni: { righeMateriali?: RigaMaterialeInput[]; righeCosti?: RigaCostoInput[]; misure?: MisuraInput[] },
  userId: string,
) {
  const before = await prisma.technicalSheet.findUnique({ where: { id } })
  if (!before) throw notFound('Scheda tecnica non trovata')

  return prisma.$transaction(async (tx) => {
    await tx.technicalSheet.update({ where: { id }, data: campi })

    if (collezioni.righeMateriali) {
      await tx.sheetMaterialUsage.deleteMany({ where: { technicalSheetId: id } })
      if (collezioni.righeMateriali.length) {
        await tx.sheetMaterialUsage.createMany({
          data: collezioni.righeMateriali.map((r, i) => ({
            technicalSheetId: id,
            materialId: r.materialId,
            accessoryId: r.accessoryId,
            descrizione: r.descrizione,
            unitaMisura: r.unitaMisura,
            quantitaSuggerita: dec(r.quantitaSuggerita, 0)!,
            quantitaConfermata: dec(r.quantitaConfermata),
            percentualeScarto: dec(r.percentualeScarto, 0)!,
            supplierId: r.supplierId,
            fattureCollegateIds: r.fattureCollegateIds ?? [],
            costoUnitario: dec(r.costoUnitario, 0)!,
            fonteCosto: r.fonteCosto,
            fatturaCostoId: r.fatturaCostoId,
            ordine: i,
          })),
        })
      }
    }

    if (collezioni.righeCosti) {
      await tx.sheetCostLine.deleteMany({ where: { technicalSheetId: id } })
      if (collezioni.righeCosti.length) {
        await tx.sheetCostLine.createMany({
          data: collezioni.righeCosti.map((c, i) => ({
            technicalSheetId: id,
            voce: c.voce,
            label: c.label,
            importo: dec(c.importo, 0)!,
            kind: c.kind,
            fonte: c.fonte,
            fatturaId: c.fatturaId,
            ammortizzabile: c.ammortizzabile ?? false,
            quantitaPrevista: c.quantitaPrevista,
            ordine: i,
          })),
        })
      }
    }

    if (collezioni.misure) {
      await tx.sheetMeasurement.deleteMany({ where: { technicalSheetId: id } })
      if (collezioni.misure.length) {
        await tx.sheetMeasurement.createMany({
          data: collezioni.misure.map((m, i) => ({
            technicalSheetId: id,
            nome: m.nome,
            valore: dec(m.valore),
            unita: m.unita ?? 'cm',
            tagliaRiferimento: m.tagliaRiferimento,
            tolleranza: m.tolleranza,
            nota: m.nota,
            fonte: m.fonte,
            ordine: i,
          })),
        })
      }
    }

    await logActivity(tx, {
      userId, azione: 'update', entita: 'technical_sheet', entitaId: id,
      valoreNuovo: `versione ${before.versione}`,
    })
    return tx.technicalSheet.findUnique({ where: { id }, include: INCLUDE_COMPLETO })
  })
}

// --- Foto (spec §1) ---

export async function addPhoto(sheetId: string, foto: FotoInput, userId: string) {
  const sheet = await prisma.technicalSheet.findUnique({ where: { id: sheetId } })
  if (!sheet) throw notFound('Scheda tecnica non trovata')
  return prisma.$transaction(async (tx) => {
    const created = await tx.technicalSheetPhoto.create({
      data: { technicalSheetId: sheetId, nome: foto.nome, dataUrl: foto.dataUrl },
    })
    await logActivity(tx, { userId, azione: 'create', entita: 'technical_sheet_photo', entitaId: created.id, valoreNuovo: foto.nome })
    return created
  })
}

export async function removePhoto(sheetId: string, photoId: string, userId: string) {
  const foto = await prisma.technicalSheetPhoto.findUnique({ where: { id: photoId } })
  if (!foto || foto.technicalSheetId !== sheetId) throw notFound('Foto non trovata')
  return prisma.$transaction(async (tx) => {
    await tx.technicalSheetPhoto.delete({ where: { id: photoId } })
    await logActivity(tx, { userId, azione: 'delete', entita: 'technical_sheet_photo', entitaId: photoId, valorePrecedente: foto.nome })
    return { deleted: true }
  })
}

// --- Storico costi (spec §6): si aggiunge in coda, mai sovrascritto ---

export async function addCostSnapshot(
  sheetId: string,
  snap: { motivo: string; costoMaterialiUnitario: number; costoTotaleUnitario: number; prezzoBreakEven: number },
  userId: string,
) {
  const sheet = await prisma.technicalSheet.findUnique({ where: { id: sheetId } })
  if (!sheet) throw notFound('Scheda tecnica non trovata')
  return prisma.$transaction(async (tx) => {
    const created = await tx.sheetCostSnapshot.create({
      data: {
        technicalSheetId: sheetId,
        motivo: snap.motivo,
        costoMaterialiUnitario: new Prisma.Decimal(snap.costoMaterialiUnitario),
        costoTotaleUnitario: new Prisma.Decimal(snap.costoTotaleUnitario),
        prezzoBreakEven: new Prisma.Decimal(snap.prezzoBreakEven),
      },
    })
    await logActivity(tx, {
      userId, azione: 'create', entita: 'sheet_cost_snapshot', entitaId: created.id, valoreNuovo: snap.motivo,
    })
    return created
  })
}
