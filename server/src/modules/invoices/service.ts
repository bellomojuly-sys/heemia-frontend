// Fatture (FR-19/22/23), scadenze (FR-21) e chiusura di cassa (FR-41, DEC-031).
// Porting di addInvoice / updateInvoiceAssociations / addCashClosure dal MockStore.
import { Prisma, type InvoicePagamento } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import { daysFromToday, formatEuro, meseLabel } from '../../core/dates.js'

const r2 = (n: number) => Math.round(n * 100) / 100

// "scaduta" è derivata dalla data reale (API_Mapping): una fattura da pagare con scadenza
// passata risulta scaduta senza che nessuno debba aggiornarla a mano.
function withDerivedStatus<T extends { statoPagamento: InvoicePagamento; dataScadenza: Date | null }>(inv: T) {
  const scaduta =
    inv.statoPagamento === 'da_pagare' && inv.dataScadenza !== null && daysFromToday(inv.dataScadenza) < 0
  return { ...inv, statoPagamento: scaduta ? ('scaduta' as InvoicePagamento) : inv.statoPagamento }
}

export async function listInvoices(filters: { statoPagamento?: string; associata?: boolean }) {
  const where: Prisma.InvoiceWhereInput = {}
  if (filters.statoPagamento) where.statoPagamento = filters.statoPagamento as InvoicePagamento
  if (filters.associata !== undefined) where.associata = filters.associata
  const rows = await prisma.invoice.findMany({
    where,
    orderBy: { data: 'desc' },
    include: { products: true, materialiLinks: true, fornitore: true, cliente: true },
  })
  return rows.map(withDerivedStatus)
}

export async function getInvoice(id: string) {
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { products: true, materialiLinks: true, costAllocations: true, deadlines: true },
  })
  if (!inv) throw notFound('Fattura non trovata')
  return withDerivedStatus(inv)
}

export interface CreateInvoiceInput {
  numero: string
  data: string
  fornitoreId?: string
  clienteId?: string
  paese?: Prisma.InvoiceCreateInput['paese']
  valuta?: string
  tassoCambio?: number
  imponibile: number
  iva: number
  categoriaCosto?: Prisma.InvoiceCreateInput['categoriaCosto']
  metodoPagamento?: string
  statoPagamento?: InvoicePagamento
  dataScadenza?: string
  documentoUrl?: string
  noteAmministrative?: string
  reverseCharge?: boolean
  prodottiIds?: string[]
  materialiIds?: string[]
}

export async function createInvoice(input: CreateInvoiceInput, userId: string) {
  const prodottiIds = input.prodottiIds ?? []
  const materialiIds = input.materialiIds ?? []
  // totale = imponibile + iva, come nel prototipo (addInvoice).
  const totale = r2(input.imponibile + input.iva)

  return prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        numero: input.numero,
        data: new Date(input.data),
        fornitore: input.fornitoreId ? { connect: { id: input.fornitoreId } } : undefined,
        cliente: input.clienteId ? { connect: { id: input.clienteId } } : undefined,
        paese: input.paese,
        valuta: input.valuta,
        tassoCambio: input.tassoCambio !== undefined ? new Prisma.Decimal(input.tassoCambio) : undefined,
        imponibile: new Prisma.Decimal(input.imponibile),
        iva: new Prisma.Decimal(input.iva),
        totale: new Prisma.Decimal(totale),
        categoriaCosto: input.categoriaCosto,
        metodoPagamento: input.metodoPagamento,
        statoPagamento: input.statoPagamento,
        dataScadenza: input.dataScadenza ? new Date(input.dataScadenza) : undefined,
        documentoUrl: input.documentoUrl,
        noteAmministrative: input.noteAmministrative,
        reverseCharge: input.reverseCharge,
        associata: prodottiIds.length > 0 || materialiIds.length > 0,
        products: prodottiIds.length ? { create: prodottiIds.map((productId) => ({ productId })) } : undefined,
        materialiLinks: materialiIds.length ? { create: materialiIds.map((materialId) => ({ materialId })) } : undefined,
      },
      include: { products: true, materialiLinks: true },
    })
    await logActivity(tx, {
      userId, azione: 'create', entita: 'invoice', entitaId: created.id,
      valoreNuovo: `${created.numero} (${created.statoPagamento})`,
    })
    return created
  })
}

export async function updateInvoice(
  id: string,
  patch: { statoPagamento?: InvoicePagamento; dataScadenza?: string; noteAmministrative?: string },
  userId: string,
) {
  const before = await prisma.invoice.findUnique({ where: { id } })
  if (!before) throw notFound('Fattura non trovata')
  return prisma.$transaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id },
      data: {
        statoPagamento: patch.statoPagamento,
        dataScadenza: patch.dataScadenza ? new Date(patch.dataScadenza) : undefined,
        noteAmministrative: patch.noteAmministrative,
      },
    })
    await logActivity(tx, {
      userId, azione: 'update', entita: 'invoice', entitaId: id,
      valorePrecedente: before.statoPagamento, valoreNuovo: updated.statoPagamento,
    })
    return withDerivedStatus(updated)
  })
}

// FR-23: riscrive le associazioni prodotti/materiali e ricalcola il flag `associata`.
export async function updateInvoiceAssociations(
  id: string,
  prodottiIds: string[],
  materialiIds: string[],
  userId: string,
) {
  const exists = await prisma.invoice.findUnique({ where: { id } })
  if (!exists) throw notFound('Fattura non trovata')
  return prisma.$transaction(async (tx) => {
    await tx.invoiceProduct.deleteMany({ where: { invoiceId: id } })
    await tx.invoiceMaterial.deleteMany({ where: { invoiceId: id } })
    if (prodottiIds.length) {
      await tx.invoiceProduct.createMany({ data: prodottiIds.map((productId) => ({ invoiceId: id, productId })) })
    }
    if (materialiIds.length) {
      await tx.invoiceMaterial.createMany({ data: materialiIds.map((materialId) => ({ invoiceId: id, materialId })) })
    }
    const updated = await tx.invoice.update({
      where: { id },
      data: { associata: prodottiIds.length > 0 || materialiIds.length > 0 },
      include: { products: true, materialiLinks: true },
    })
    await logActivity(tx, {
      userId, azione: 'update', entita: 'invoice', entitaId: id,
      valoreNuovo: `${prodottiIds.length} prodotti, ${materialiIds.length} materiali`,
    })
    return updated
  })
}

// FR-23 — ripartizione dei costi indiretti registrata per fattura.
export function listCostAllocations() {
  return prisma.costAllocation.findMany({
    orderBy: { createdAt: 'desc' },
    include: { invoice: { select: { numero: true } } },
  })
}

// --- Scadenze (FR-21) ---
// Unione delle scadenze registrate in tabella e di quelle derivate dalle fatture da pagare,
// come da API_Mapping ("scadenze fatture + scadenze fiscali").
export async function listDeadlines() {
  const [registrate, fatture] = await Promise.all([
    prisma.deadline.findMany({ orderBy: { data: 'asc' } }),
    prisma.invoice.findMany({
      where: { dataScadenza: { not: null }, statoPagamento: { in: ['da_pagare', 'scaduta'] } },
      orderBy: { dataScadenza: 'asc' },
    }),
  ])

  const daFatture = fatture
    .filter((f) => !registrate.some((d) => d.invoiceId === f.id))
    .map((f) => {
      const giorni = daysFromToday(f.dataScadenza!)
      return {
        id: `deadline-invoice-${f.id}`,
        tipo: 'fattura_da_pagare' as const,
        descrizione: `Fattura ${f.numero}`,
        data: f.dataScadenza!,
        importo: f.totale,
        stato: giorni < 0 ? ('in_ritardo' as const) : ('in_arrivo' as const),
        invoiceId: f.id,
        derivata: true,
      }
    })

  return [...registrate.map((d) => ({ ...d, derivata: false })), ...daFatture].sort(
    (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
  )
}

// --- Chiusura di cassa (FR-41, DEC-031) ---
export function listCashClosures() {
  return prisma.cashClosure.findMany({ orderBy: { mese: 'desc' } })
}

/**
 * Parsing best-effort dell'export scontrini Billy. Porting di parseScontriniCsv dal
 * prototipo. ⚠️ Il formato reale di Billy Scontrino è DA VALIDARE con un export vero
 * (OQ-FR-01): cerca una colonna totale/importo/incasso, altrimenti usa l'ultima.
 */
export function parseScontriniCsv(text: string): { totale: number; numero: number } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return { totale: 0, numero: 0 }
  const delim = lines[0].includes(';') ? ';' : ','
  const header = lines[0].split(delim).map((h) => h.trim().toLowerCase())
  let col = header.findIndex((h) => /(totale|importo|incass|ammontare)/i.test(h))
  if (col < 0) col = header.length - 1
  let totale = 0
  let numero = 0
  for (const line of lines.slice(1)) {
    const cells = line.split(delim)
    const raw = (cells[col] ?? '').replace(/[€\s]/g, '')
    // gestisce sia "1.234,56" (it) sia "1234.56" (en)
    const norm = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
    const val = parseFloat(norm)
    if (Number.isFinite(val)) {
      totale += val
      numero += 1
    }
  }
  return { totale: r2(totale), numero }
}

export interface CashClosureInput {
  mese: string
  totaleIncassato: number
  numeroScontrini: number
  fileNome?: string
  note?: string
}

export async function upsertCashClosure(input: CashClosureInput, userId: string) {
  const media = input.numeroScontrini > 0 ? input.totaleIncassato / input.numeroScontrini : 0
  // Riepilogo derivato dai dati, come nel prototipo. La versione AI vera è
  // POST /api/v1/ai/cash-closure (gated su ANTHROPIC_API_KEY).
  const riepilogoAi = `A ${meseLabel(input.mese)} sono entrati ${formatEuro(r2(input.totaleIncassato))} con ${input.numeroScontrini} scontrini (media ${formatEuro(r2(media))} a scontrino). Dato da chiusura di cassa: è quanto effettivamente incassato dagli scontrini del mese.`

  return prisma.$transaction(async (tx) => {
    // Ricaricare l'export dello stesso mese sostituisce la chiusura precedente.
    const closure = await tx.cashClosure.upsert({
      where: { mese: input.mese },
      update: {
        totaleIncassato: new Prisma.Decimal(r2(input.totaleIncassato)),
        numeroScontrini: input.numeroScontrini,
        fileNome: input.fileNome,
        riepilogoAi,
        note: input.note,
      },
      create: {
        mese: input.mese,
        totaleIncassato: new Prisma.Decimal(r2(input.totaleIncassato)),
        numeroScontrini: input.numeroScontrini,
        fileNome: input.fileNome,
        riepilogoAi,
        note: input.note,
      },
    })
    await logActivity(tx, {
      userId, azione: 'create', entita: 'cash_closure', entitaId: input.mese,
      valoreNuovo: `${formatEuro(r2(input.totaleIncassato))} · ${input.numeroScontrini} scontrini`,
    })
    return closure
  })
}
