// FR-29 — sub-app showroom, vista cliente. Scope separato (System_Architecture A5): questi
// endpoint espongono SOLO campi pubblici del catalogo e non danno accesso a nulla del gestionale.
//
// Il catalogo è la stessa tabella `products` del gestionale, filtrata dai due attributi
// commerciali (spec 2026-08-06, DEC-044): `visibileShowroom` (capo appeso allo stand) e
// `personalizzabileSuMisura` (realizzabile su misura anche se non è appeso). Nessuna
// duplicazione dei dati: cambiare un flag in anagrafica cambia il catalogo cliente subito.
import { Prisma } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { badRequest, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import { findOrCreateCustomer } from '../customers/service.js'

/** Versione dell'informativa privacy accettata all'accesso: si registra sulla visita, così
 *  un domani si sa quale testo il cliente ha letto. Va alzata quando il testo cambia.
 *  v2: informativa completa (finalità e basi giuridiche distinte, conservazione, destinatari,
 *  diritti e reclamo al Garante). Restano da compilare i dati del titolare — OQ-25. */
export const INFORMATIVA_VERSIONE = 'v2-2026-08'

// Whitelist esplicita dei campi visibili al cliente (spec §6): nome, immagini, descrizione,
// categoria/collezione, colori, taglie, prezzo showroom, i due flag e i tempi di realizzazione.
// Mai costi, margini, fornitori, note interne, scorte.
const CATALOG_FIELDS = {
  id: true,
  nome: true,
  categoria: true,
  collezione: true,
  descrizioneBreve: true,
  descrizioneEcommerce: true,
  immaginiUrl: true,
  prezzoShowroom: true,
  taglieDisponibili: true,
  coloriDisponibili: true,
  visibileShowroom: true,
  personalizzabileSuMisura: true,
  tempiRealizzazione: true,
  // Varianti come sole combinazioni taglia/colore: nessuna quantità, che è un dato interno.
  variants: { select: { taglia: true, colore: true } },
} as const

/**
 * Catalogo cliente: unione dei capi in showroom e di quelli su misura (spec §5, sezione
 * "Tutti i modelli disponibili"). Le sezioni "Presenti in showroom" e "Personalizzabili su
 * misura" sono due filtri sugli stessi record, fatti dal client sui due flag: una sola
 * chiamata, nessun capo duplicato.
 */
export function getShowroomCatalog() {
  return prisma.product.findMany({
    where: { OR: [{ visibileShowroom: true }, { personalizzabileSuMisura: true }] },
    select: CATALOG_FIELDS,
    orderBy: { nome: 'asc' },
  })
}

// Materiali proposti al cliente per il su misura: solo nome e composizione dei disponibili.
// Nessun costo, nessuna scorta.
export function getShowroomMaterials() {
  return prisma.material.findMany({
    where: { stato: 'disponibile' },
    select: { id: true, nome: true, composizione: true, colore: true },
    orderBy: { nome: 'asc' },
  })
}

// ---------------------------------------------------------------------------
// Accesso del cliente (spec §4)
// ---------------------------------------------------------------------------

export interface VisitInput {
  nome: string
  cognome: string
  email: string
  consensoPrivacy: boolean
  /** Facoltativo e separato dal consenso al trattamento (spec §4): assente = non dato. */
  consensoMarketing?: boolean
}

/**
 * Registra l'accesso alla vista cliente. Il contatto confluisce in `customers` con
 * tipologia `showroom` e dedup per email (DEC-023/026); la visita tiene data/ora e i
 * consensi, che in `customers` andrebbero persi a ogni nuovo accesso.
 * Restituisce l'id della visita — è la chiave con cui il client registra viste, preferiti
 * e richieste — e i preferiti già salvati dal contatto, così tornano anche in una visita nuova.
 */
export async function startShowroomVisit(input: VisitInput) {
  if (!input.consensoPrivacy) throw badRequest('Serve il consenso al trattamento dei dati per accedere')

  const nomeCompleto = `${input.nome.trim()} ${input.cognome.trim()}`.trim()
  const email = input.email.trim().toLowerCase()
  const customer = await findOrCreateCustomer(
    { nome: nomeCompleto, cognome: input.cognome.trim(), email, paese: 'IT', tipologia: 'showroom' },
    null,
  )

  const visit = await prisma.$transaction(async (tx) => {
    // Il consenso marketing è revocabile: l'ultimo accesso è quello che vale. Il cognome si
    // completa se il contatto esisteva già da un altro canale senza averlo.
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        consensoPrivacyIl: new Date(),
        consensoMarketing: input.consensoMarketing ?? false,
        cognome: customer.cognome ?? input.cognome.trim(),
      },
    })
    return tx.showroomVisit.create({
      data: {
        customerId: customer.id,
        nome: input.nome.trim(),
        cognome: input.cognome.trim(),
        email,
        consensoPrivacy: true,
        consensoMarketing: input.consensoMarketing ?? false,
        informativaVersione: INFORMATIVA_VERSIONE,
      },
    })
  })

  const favorites = await prisma.showroomFavorite.findMany({
    where: { customerId: customer.id },
    select: { productId: true },
  })

  // Al cliente non serve (e non deve tornare) lo storico acquisti: solo l'identificativo.
  return {
    visitId: visit.id,
    nome: visit.nome,
    cognome: visit.cognome,
    email: visit.email,
    preferiti: favorites.map((f) => f.productId),
  }
}

/** La visita esiste? Tutte le scritture del cliente passano di qui: senza accesso non si scrive. */
async function getVisit(visitId: string) {
  const visit = await prisma.showroomVisit.findUnique({ where: { id: visitId } })
  if (!visit) throw notFound('Sessione showroom non valida: rifai l’accesso')
  return visit
}

/** Il capo dev'essere in catalogo cliente: fuori da lì non esiste, per il cliente. */
async function getCatalogProduct(productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, OR: [{ visibileShowroom: true }, { personalizzabileSuMisura: true }] },
  })
  if (!product) throw notFound('Capo non disponibile nel catalogo showroom')
  return product
}

/** Prodotto aperto dal cliente (spec §4, "eventuali prodotti visualizzati"): una riga per
 *  capo con contatore, non una riga per click. */
export async function trackProductView(visitId: string, productId: string) {
  await getVisit(visitId)
  await getCatalogProduct(productId)
  await prisma.showroomProductView.upsert({
    where: { visitId_productId: { visitId, productId } },
    create: { visitId, productId },
    update: { visualizzazioni: { increment: 1 }, ultimaVistaIl: new Date() },
  })
  await prisma.showroomVisit.update({ where: { id: visitId }, data: { ultimaAttivitaIl: new Date() } })
  return { ok: true }
}

/** Preferito: legato al contatto, così resta anche alla visita successiva. */
export async function addFavorite(visitId: string, productId: string) {
  const visit = await getVisit(visitId)
  await getCatalogProduct(productId)
  await prisma.showroomFavorite.upsert({
    where: { customerId_productId: { customerId: visit.customerId, productId } },
    create: { customerId: visit.customerId, productId, visitId },
    update: { visitId },
  })
  return { ok: true }
}

export async function removeFavorite(visitId: string, productId: string) {
  const visit = await getVisit(visitId)
  await prisma.showroomFavorite.deleteMany({ where: { customerId: visit.customerId, productId } })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Richieste dal cliente (spec §7)
// ---------------------------------------------------------------------------

/** Numero richiesta: prefisso RQ-* (gli ordini restano SM-*, generati alla conferma). */
async function nextRequestNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const numero = `RQ-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`
    const exists = await prisma.showroomRequest.findUnique({ where: { numero } })
    if (!exists) return numero
  }
  throw badRequest('Impossibile generare il numero richiesta, riprova')
}

export interface ShowroomRequestInput {
  visitId: string
  tipo?: 'personalizzazione' | 'informazioni'
  productId: string
  tagliaBase?: string
  coloreDesiderato?: string
  lunghezza?: string
  modifiche?: string
  note?: string
  misure?: Record<string, string>
  dataDesiderata?: string
  immagini?: { nome: string; dataUrl: string }[]
}

/**
 * Crea la "scheda" nel gestionale (spec §7). Non crea un ordine: l'ordine SM-* nasce quando
 * l'atelier porta la richiesta a "Confermato" (DEC-044) — prima di allora prezzo e fattibilità
 * non sono stabiliti. La richiesta compare in "Richieste showroom" e genera l'alert FR-29.
 */
export async function createShowroomRequest(input: ShowroomRequestInput) {
  const visit = await getVisit(input.visitId)
  const product = await getCatalogProduct(input.productId)
  // Il default vive qui e non solo nello schema Zod: così vale anche per chiamate interne.
  const tipo = input.tipo ?? 'personalizzazione'
  if (tipo === 'personalizzazione' && !product.personalizzabileSuMisura) {
    throw badRequest('Questo capo non è personalizzabile su misura')
  }

  const numero = await nextRequestNumber()
  const misure = input.misure && Object.keys(input.misure).length > 0 ? input.misure : undefined

  const created = await prisma.$transaction(async (tx) => {
    const richiesta = await tx.showroomRequest.create({
      data: {
        numero,
        tipo,
        customerId: visit.customerId,
        productId: product.id,
        visitId: visit.id,
        tagliaBase: input.tagliaBase,
        coloreDesiderato: input.coloreDesiderato,
        lunghezza: input.lunghezza,
        modifiche: input.modifiche,
        note: input.note,
        misure: misure ? (misure as Prisma.InputJsonValue) : undefined,
        dataDesiderata: input.dataDesiderata ? new Date(input.dataDesiderata) : undefined,
        immagini: input.immagini?.length
          ? { create: input.immagini.map((i) => ({ nome: i.nome, dataUrl: i.dataUrl })) }
          : undefined,
      },
    })
    // L'azione non ha un utente interno: resta a userId null, con il dettaglio nel log (FR-18).
    const misurePrese = misure
      ? Object.entries(misure).filter(([, v]) => v?.trim()).map(([k, v]) => `${k} ${v} cm`).join(', ')
      : ''
    await logActivity(tx, {
      userId: null,
      azione: tipo === 'personalizzazione' ? 'Richiesta personalizzazione showroom' : 'Richiesta informazioni showroom',
      entita: 'showroom_request',
      entitaId: richiesta.id,
      valoreNuovo: `${product.nome}${input.tagliaBase ? ` · taglia ${input.tagliaBase}` : ''}${misurePrese ? ` · misure: ${misurePrese}` : ''}${input.note ? ` · note: ${input.note}` : ''}`,
    })
    await tx.showroomVisit.update({ where: { id: visit.id }, data: { ultimaAttivitaIl: new Date() } })
    return richiesta
  })

  // Al cliente torna solo la conferma, non l'oggetto interno.
  return { numero: created.numero, stato: created.stato, prodotto: product.nome }
}
