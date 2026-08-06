// Lato gestionale delle richieste arrivate dalla vista cliente (spec 2026-08-06 §7, DEC-044).
// La sub-app cliente crea la richiesta (modules/showroom); qui l'atelier la lavora: contatto,
// appuntamento, misure, preventivo, conferma. Alla conferma nasce l'ordine SM-*, che è il
// punto in cui la richiesta diventa un impegno commerciale.
import { Prisma, type StatoRichiestaShowroom } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { badRequest, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'

const DETTAGLIO = {
  customer: { select: { id: true, nome: true, cognome: true, email: true, consensoMarketing: true } },
  product: { select: { id: true, nome: true, codiceProdotto: true, categoria: true, prezzoShowroom: true } },
  order: { select: { id: true, numero: true, stato: true } },
  immagini: { select: { id: true, nome: true, dataUrl: true, caricataIl: true } },
} as const

export interface ListRequestsQuery {
  stato?: StatoRichiestaShowroom
  tipo?: 'personalizzazione' | 'informazioni'
}

export function listShowroomRequests(query: ListRequestsQuery = {}) {
  return prisma.showroomRequest.findMany({
    where: {
      ...(query.stato ? { stato: query.stato } : {}),
      ...(query.tipo ? { tipo: query.tipo } : {}),
    },
    include: DETTAGLIO,
    orderBy: { createdAt: 'desc' },
  })
}

export async function getShowroomRequest(id: string) {
  const richiesta = await prisma.showroomRequest.findUnique({ where: { id }, include: DETTAGLIO })
  if (!richiesta) throw notFound('Richiesta non trovata')
  return richiesta
}

export interface UpdateRequestInput {
  stato?: StatoRichiestaShowroom
  noteInterne?: string
  preventivoImporto?: number
  preventivoInviatoIl?: string
  appuntamentoIl?: string
  // L'atelier completa i dati raccolti alla prova (stato "Misure raccolte").
  tagliaBase?: string
  coloreDesiderato?: string
  lunghezza?: string
  modifiche?: string
  misure?: Record<string, string>
}

/** Numero ordine showroom: prefisso SM-* come nel prototipo — gli alert FR-29 lo riconoscono. */
async function nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const numero = `SM-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`
    const exists = await tx.order.findUnique({ where: { numero } })
    if (!exists) return numero
  }
  throw badRequest('Impossibile generare il numero ordine, riprova')
}

/**
 * Aggiorna la richiesta. Effetto collaterale voluto: portandola a `confermato` si crea
 * l'ordine SM-* collegato (una volta sola — se `orderId` c'è già, non se ne crea un secondo).
 * Il prezzo dell'ordine è il preventivo se c'è, altrimenti il prezzo showroom del capo.
 */
export async function updateShowroomRequest(id: string, input: UpdateRequestInput, userId: string) {
  const precedente = await prisma.showroomRequest.findUnique({ where: { id }, include: { product: true } })
  if (!precedente) throw notFound('Richiesta non trovata')

  if (input.stato === 'confermato' && precedente.tipo === 'informazioni') {
    throw badRequest('Una richiesta di informazioni non genera un ordine: convertila prima in personalizzazione')
  }

  return prisma.$transaction(async (tx) => {
    const dati: Prisma.ShowroomRequestUpdateInput = {
      ...(input.stato ? { stato: input.stato } : {}),
      ...(input.noteInterne !== undefined ? { noteInterne: input.noteInterne || null } : {}),
      ...(input.preventivoImporto !== undefined ? { preventivoImporto: new Prisma.Decimal(input.preventivoImporto) } : {}),
      ...(input.preventivoInviatoIl !== undefined ? { preventivoInviatoIl: new Date(input.preventivoInviatoIl) } : {}),
      ...(input.appuntamentoIl !== undefined ? { appuntamentoIl: new Date(input.appuntamentoIl) } : {}),
      ...(input.tagliaBase !== undefined ? { tagliaBase: input.tagliaBase || null } : {}),
      ...(input.coloreDesiderato !== undefined ? { coloreDesiderato: input.coloreDesiderato || null } : {}),
      ...(input.lunghezza !== undefined ? { lunghezza: input.lunghezza || null } : {}),
      ...(input.modifiche !== undefined ? { modifiche: input.modifiche || null } : {}),
      ...(input.misure !== undefined ? { misure: input.misure as Prisma.InputJsonValue } : {}),
    }

    // Conferma → ordine SM-*: il capo serve (senza prodotto non c'è nulla da ordinare).
    if (input.stato === 'confermato' && !precedente.orderId) {
      if (!precedente.productId || !precedente.product) {
        throw badRequest('La richiesta non è collegata a un capo: impossibile creare l’ordine')
      }
      const importo = input.preventivoImporto !== undefined
        ? new Prisma.Decimal(input.preventivoImporto)
        : (precedente.preventivoImporto ?? precedente.product.prezzoShowroom)
      const numero = await nextOrderNumber(tx)
      const ordine = await tx.order.create({
        data: {
          numero,
          customerId: precedente.customerId,
          canale: 'fisico',
          stato: 'in_lavorazione',
          data: new Date(),
          totale: importo,
          items: {
            create: [{
              productId: precedente.productId,
              quantita: 1,
              prezzoUnitario: importo,
              suMisura: true,
              tagliaScelta: precedente.tagliaBase,
              misure: (input.misure ?? precedente.misure ?? undefined) as Prisma.InputJsonValue | undefined,
              noteSuMisura: [precedente.modifiche, precedente.note].filter(Boolean).join(' · ') || undefined,
            }],
          },
        },
      })
      await tx.customer.update({
        where: { id: precedente.customerId },
        data: { numeroOrdini: { increment: 1 }, valoreTotaleAcquistato: { increment: importo } },
      })
      dati.order = { connect: { id: ordine.id } }
      await logActivity(tx, {
        userId,
        azione: 'Ordine su misura da richiesta showroom',
        entita: 'order',
        entitaId: ordine.id,
        valoreNuovo: `${ordine.numero} · ${precedente.product.nome} · richiesta ${precedente.numero}`,
      })
    }

    const aggiornata = await tx.showroomRequest.update({ where: { id }, data: dati, include: DETTAGLIO })
    if (input.stato && input.stato !== precedente.stato) {
      await logActivity(tx, {
        userId,
        azione: 'update',
        entita: 'showroom_request',
        entitaId: id,
        valorePrecedente: precedente.stato,
        valoreNuovo: input.stato,
      })
    }
    return aggiornata
  })
}
