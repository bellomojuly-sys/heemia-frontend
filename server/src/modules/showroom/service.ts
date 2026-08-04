// FR-29 — sub-app showroom. Scope separato (System_Architecture A5): questi endpoint
// espongono SOLO campi pubblici del catalogo e non danno accesso a nulla del gestionale.
// Porting del flusso di ShowroomApp.tsx (cliente riusato per email, ordine SM-*, log).
import { Prisma } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { badRequest, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import { findOrCreateCustomer } from '../customers/service.js'

// Whitelist esplicita: nome, foto, prezzo showroom, taglie, flag su misura.
// Mai costi, margini, scorte, fornitori (FR-29).
const CATALOG_FIELDS = {
  id: true,
  nome: true,
  categoria: true,
  descrizioneBreve: true,
  immaginiUrl: true,
  prezzoShowroom: true,
  taglieDisponibili: true,
  coloriDisponibili: true,
  personalizzabileSuMisura: true,
} as const

export function getShowroomCatalog() {
  return prisma.product.findMany({
    where: { visibileShowroom: true },
    select: CATALOG_FIELDS,
    orderBy: { nome: 'asc' },
  })
}

// Materiali proposti al cliente per il su misura: solo nome e composizione dei disponibili
// (nel prototipo: materials.filter(stato === 'disponibile')). Nessun costo, nessuna scorta.
export function getShowroomMaterials() {
  return prisma.material.findMany({
    where: { stato: 'disponibile' },
    select: { id: true, nome: true, composizione: true, colore: true },
    orderBy: { nome: 'asc' },
  })
}

export async function registerShowroomCustomer(input: { nome: string; email: string }) {
  const customer = await findOrCreateCustomer(
    { nome: input.nome, email: input.email, paese: 'IT', tipologia: 'showroom' },
    null,
  )
  // Al cliente non serve (e non deve tornare) lo storico acquisti: solo l'identificativo.
  return { id: customer.id, nome: customer.nome, email: customer.email }
}

/** Numero ordine showroom: prefisso SM-* come nel prototipo — gli alert FR-29 lo riconoscono. */
async function nextOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const numero = `SM-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`
    const exists = await prisma.order.findUnique({ where: { numero } })
    if (!exists) return numero
  }
  throw badRequest('Impossibile generare il numero ordine, riprova')
}

export interface ShowroomOrderInput {
  productId: string
  clienteNome: string
  clienteEmail: string
  materialeId?: string
  taglia: string
  misure?: Record<string, string>
  note?: string
}

export async function createShowroomOrder(input: ShowroomOrderInput) {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, visibileShowroom: true },
  })
  if (!product) throw notFound('Capo non disponibile in showroom')
  if (!product.personalizzabileSuMisura) throw badRequest('Questo capo non è personalizzabile su misura')

  const customer = await findOrCreateCustomer(
    { nome: input.clienteNome, email: input.clienteEmail, paese: 'IT', tipologia: 'showroom' },
    null,
  )
  const numero = await nextOrderNumber()

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        numero,
        customer: { connect: { id: customer.id } },
        canale: 'fisico',
        stato: 'in_lavorazione',
        data: new Date(),
        totale: product.prezzoShowroom,
        items: {
          create: [{
            productId: product.id,
            quantita: 1,
            prezzoUnitario: product.prezzoShowroom,
            suMisura: true,
            materialeSceltoId: input.materialeId,
            tagliaScelta: input.taglia,
            misure: input.misure ? (input.misure as Prisma.InputJsonValue) : undefined,
            noteSuMisura: input.note,
          }],
        },
      },
      include: { items: true },
    })
    await tx.customer.update({
      where: { id: customer.id },
      data: { numeroOrdini: { increment: 1 }, valoreTotaleAcquistato: { increment: product.prezzoShowroom } },
    })
    // L'azione non ha un utente interno: resta a userId null, con il dettaglio nel log.
    const misurePrese = input.misure
      ? Object.entries(input.misure).filter(([, v]) => v?.trim()).map(([k, v]) => `${k} ${v} cm`).join(', ')
      : ''
    await logActivity(tx, {
      userId: null,
      azione: 'Ordine su misura showroom',
      entita: 'order',
      entitaId: created.id,
      valoreNuovo: `${product.nome} · taglia ${input.taglia}${misurePrese ? ` · misure: ${misurePrese}` : ''}${input.note ? ` · note: ${input.note}` : ''}`,
    })
    return created
  })

  // Al cliente torna solo la conferma, non l'oggetto ordine interno.
  return { numero: order.numero, stato: order.stato, prodotto: product.nome }
}
