// Documenti ricevuti dalle modelliste (backlog "Note" §4): cartamodelli, piazzamenti,
// schede misure, revisioni.
//
// Due scelte da tenere presenti:
//  - i documenti stanno sul PRODOTTO, non sulla singola scheda tecnica: uno stesso
//    piazzamento può valere per più versioni;
//  - la versione è testo libero e non è unica, quindi caricare una V2 non sovrascrive
//    mai la V1. Le versioni precedenti restano tutte consultabili.
import type { Prisma } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'

const INCLUDE_NOTE = {
  note: {
    orderBy: { createdAt: 'asc' },
    include: { autore: { select: { nome: true, email: true } } },
  },
  caricatoDa: { select: { nome: true, email: true } },
} satisfies Prisma.PatternDocumentInclude

export function listPatternDocuments(productId: string) {
  return prisma.patternDocument.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    include: INCLUDE_NOTE,
  })
}

export interface PatternDocumentInput {
  fileName: string
  dataUrl: string
  tipologia: Prisma.PatternDocumentUncheckedCreateInput['tipologia']
  versione?: string
  autore?: string
}

export async function createPatternDocument(productId: string, input: PatternDocumentInput, userId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw notFound('Prodotto non trovato')

  return prisma.$transaction(async (tx) => {
    const created = await tx.patternDocument.create({
      data: { ...input, productId, createdBy: userId },
      include: INCLUDE_NOTE,
    })
    await logActivity(tx, {
      userId, azione: 'create', entita: 'pattern_document', entitaId: created.id,
      valoreNuovo: `${product.nome} — ${created.tipologia} ${created.versione}`,
    })
    return created
  })
}

export async function updatePatternDocumentStato(
  id: string,
  stato: Prisma.PatternDocumentUncheckedUpdateInput['statoApprovazione'],
  userId: string,
) {
  const before = await prisma.patternDocument.findUnique({ where: { id } })
  if (!before) throw notFound('Documento non trovato')

  return prisma.$transaction(async (tx) => {
    const updated = await tx.patternDocument.update({
      where: { id },
      data: { statoApprovazione: stato },
      include: INCLUDE_NOTE,
    })
    await logActivity(tx, {
      userId, azione: 'update', entita: 'pattern_document', entitaId: id,
      valorePrecedente: before.statoApprovazione, valoreNuovo: String(stato),
    })
    return updated
  })
}

export async function deletePatternDocument(id: string, userId: string) {
  const before = await prisma.patternDocument.findUnique({ where: { id } })
  if (!before) throw notFound('Documento non trovato')

  return prisma.$transaction(async (tx) => {
    await tx.patternDocument.delete({ where: { id } })
    await logActivity(tx, {
      userId, azione: 'delete', entita: 'pattern_document', entitaId: id,
      valorePrecedente: `${before.tipologia} ${before.versione} — ${before.fileName}`,
    })
    return { id }
  })
}

export async function addPatternDocumentNote(
  documentId: string,
  input: { testo: string; tipo?: Prisma.PatternDocumentNoteUncheckedCreateInput['tipo'] },
  userId: string,
) {
  const doc = await prisma.patternDocument.findUnique({ where: { id: documentId } })
  if (!doc) throw notFound('Documento non trovato')

  return prisma.$transaction(async (tx) => {
    await tx.patternDocumentNote.create({
      data: { documentId, testo: input.testo, tipo: input.tipo, createdBy: userId },
    })
    await logActivity(tx, {
      userId, azione: 'create', entita: 'pattern_document_note', entitaId: documentId,
      valoreNuovo: input.testo.slice(0, 120),
    })
    return tx.patternDocument.findUnique({ where: { id: documentId }, include: INCLUDE_NOTE })
  })
}
