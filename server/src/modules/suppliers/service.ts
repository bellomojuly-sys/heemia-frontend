// Fornitori (FR-25) e richieste fornitore / bozze email (FR-06). Porting fedele di
// addSupplier, addSupplierRequest, setSupplierRequestStatus, updateSupplierRequestDraft dal DataStore.
import { Prisma, type SupplierReqStato } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import { richiediConfigurata } from '../../core/integrations.js'
import { indirizzoValido, inviaEmail } from '../gmail/service.js'

export function listSuppliers(filters: { categoria?: string; q?: string }) {
  const where: Prisma.SupplierWhereInput = {}
  if (filters.categoria) where.categoria = filters.categoria as Prisma.SupplierWhereInput['categoria']
  if (filters.q) where.nome = { contains: filters.q, mode: 'insensitive' }
  return prisma.supplier.findMany({ where, orderBy: { nome: 'asc' } })
}

export async function createSupplier(input: Prisma.SupplierCreateInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.supplier.create({ data: input })
    await logActivity(tx, { userId, azione: 'create', entita: 'supplier', entitaId: created.id, valoreNuovo: created.nome })
    return created
  })
}

export function listSupplierRequests(filters: { stato?: string; supplierId?: string }) {
  const where: Prisma.SupplierRequestWhereInput = {}
  if (filters.stato) where.stato = filters.stato as SupplierReqStato
  if (filters.supplierId) where.supplierId = filters.supplierId
  return prisma.supplierRequest.findMany({ where, orderBy: { createdAt: 'desc' } })
}

// Genera la bozza precompilata da un materiale o accessorio sotto soglia (addSupplierRequest).
// La quantità richiesta e il testo replicano esattamente la logica del prototipo.
export async function createSupplierRequest(
  input: { materialId?: string; accessoryId?: string },
  userId: string,
) {
  const material = input.materialId ? await prisma.material.findUnique({ where: { id: input.materialId } }) : null
  const accessory = input.accessoryId ? await prisma.accessory.findUnique({ where: { id: input.accessoryId } }) : null
  const item = material ?? accessory
  if (!item) throw badRequest('Specificare un materiale o accessorio esistente')
  if (!item.supplierId) throw badRequest(`${item.nome} non ha un fornitore associato`)

  const disponibile = material
    ? Number(material.metriAcquistati) - Number(material.metriUtilizzati)
    : Number(accessory!.quantitaAcquistata) - Number(accessory!.quantitaUtilizzata)
  const sogliaMinima = Number(item.sogliaMinima)
  const richiesta = Math.max(sogliaMinima * 3, 10)
  const mancante = Math.max(richiesta - Math.max(disponibile, 0), 0)
  const esaurito = item.stato === 'esaurito'
  const unita = material ? material.unitaMisura : accessory!.unitaMisura

  return prisma.$transaction(async (tx) => {
    const created = await tx.supplierRequest.create({
      data: {
        supplier: { connect: { id: item.supplierId! } },
        material: material ? { connect: { id: material.id } } : undefined,
        accessory: accessory ? { connect: { id: accessory.id } } : undefined,
        oggetto: `${esaurito ? 'Riordino urgente' : 'Richiesta disponibilità'} ${item.nome}: ${esaurito ? 'scorta esaurita' : 'sotto soglia minima'}`,
        testo: `Buongiorno, la scorta di ${item.nome} (${item.codice}) risulta ${esaurito ? 'esaurita' : `sotto la soglia minima di ${sogliaMinima}`}. Potete confermare disponibilità, tempi di consegna, costo aggiornato e quantità minima ordinabile per un riordino di almeno ${richiesta} ${unita}?`,
        quantitaRichiesta: new Prisma.Decimal(richiesta),
        quantitaDisponibile: new Prisma.Decimal(Math.max(disponibile, 0)),
        quantitaMancante: new Prisma.Decimal(mancante),
        urgenza: esaurito ? 'alta' : 'media',
        stato: 'bozza_generata',
      },
    })
    await logActivity(tx, {
      userId, azione: 'create', entita: 'supplier_request', entitaId: created.id,
      valoreNuovo: `bozza_generata (${item.nome})`,
    })
    return created
  })
}

// Macchina a stati FR-05: transizioni consentite tra gli stati della richiesta.
const ALLOWED_TRANSITIONS: Record<SupplierReqStato, SupplierReqStato[]> = {
  bozza_generata: ['in_attesa_approvazione', 'modificata', 'approvata', 'annullata'],
  modificata: ['in_attesa_approvazione', 'approvata', 'annullata'],
  in_attesa_approvazione: ['approvata', 'modificata', 'annullata'],
  approvata: ['inviata', 'modificata', 'annullata'],
  inviata: ['risposta_ricevuta', 'chiusa', 'annullata'],
  risposta_ricevuta: ['chiusa', 'annullata'],
  chiusa: [],
  annullata: [],
}

export async function setSupplierRequestStatus(
  id: string,
  stato: SupplierReqStato,
  userId: string,
  extra?: { rispostaFornitore?: string },
) {
  const before = await prisma.supplierRequest.findUnique({ where: { id } })
  if (!before) throw notFound('Richiesta fornitore non trovata')
  if (before.stato !== stato && !ALLOWED_TRANSITIONS[before.stato].includes(stato)) {
    throw conflict(`Transizione non consentita: ${before.stato} → ${stato}`)
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.supplierRequest.update({
      where: { id },
      data: { stato, rispostaFornitore: extra?.rispostaFornitore, approvataDa: stato === 'approvata' ? userId : undefined },
    })
    await logActivity(tx, {
      userId, azione: 'update', entita: 'supplier_request', entitaId: id,
      valorePrecedente: before.stato, valoreNuovo: stato,
    })
    return updated
  })
}

export async function updateSupplierRequestDraft(
  id: string,
  patch: { testo?: string; quantitaRichiesta?: number; deadlineIdeale?: string },
  userId: string,
) {
  const before = await prisma.supplierRequest.findUnique({ where: { id } })
  if (!before) throw notFound('Richiesta fornitore non trovata')
  return prisma.$transaction(async (tx) => {
    const updated = await tx.supplierRequest.update({
      where: { id },
      data: {
        testo: patch.testo,
        quantitaRichiesta: patch.quantitaRichiesta !== undefined ? new Prisma.Decimal(patch.quantitaRichiesta) : undefined,
        deadlineIdeale: patch.deadlineIdeale ? new Date(patch.deadlineIdeale) : undefined,
        stato: 'modificata',
      },
    })
    await logActivity(tx, { userId, azione: 'update', entita: 'supplier_request', entitaId: id, valoreNuovo: 'modificata' })
    return updated
  })
}

// Invio email al fornitore (FR-06, DEC-028): Gmail messages.send, scope gmail.send.
// Implementato il 2026-08-11 (Fase 15.1 punto 2) — prima era un 409 «non ancora scritto».
//
// L'ordine delle operazioni è la cosa che conta, ed è deliberato: **prima si spedisce,
// poi si scrive che è partita**. Il contrario — marcare "inviata" e poi provare a mandare —
// è esattamente il difetto che questa funzione aveva prima di esistere davvero: lasciava
// un fornitore in attesa di una richiesta mai spedita, e nessuno se ne accorgeva.
// Un'azione verso l'esterno non è compiuta finché il servizio esterno non lo conferma.
export async function sendSupplierRequest(id: string, userId: string) {
  const req = await prisma.supplierRequest.findUnique({ where: { id }, include: { supplier: true } })
  if (!req) throw notFound('Richiesta fornitore non trovata')

  // Nessun doppio invio, e nessun invio da uno stato che non lo prevede. Il controllo sta
  // qui e non dentro la macchina a stati perché deve valere **prima** che l'email parta:
  // scoprire dopo che la transizione non era ammessa significherebbe averla già spedita.
  if (req.stato === 'inviata') {
    throw conflict(`Questa richiesta risulta già inviata${req.inviataIl ? ` il ${req.inviataIl.toLocaleDateString('it-IT')}` : ''}: non viene spedita una seconda volta.`)
  }
  if (req.stato !== 'approvata') {
    throw conflict(
      `Una richiesta si invia solo dopo l'approvazione (stato attuale: ${req.stato}). ` +
        'Approvala e poi usa "Invia al fornitore".',
    )
  }
  if (!indirizzoValido(req.supplier.email)) {
    throw badRequest(
      `Il fornitore "${req.supplier.nome}" non ha un indirizzo email valido in anagrafica: ` +
        'aggiungilo prima di inviare la richiesta.',
    )
  }

  richiediConfigurata('gmail')

  // Da qui in avanti l'email può essere partita davvero: quello che segue non deve più
  // fallire per motivi nostri.
  const esito = await inviaEmail({
    a: req.supplier.email!.trim(),
    oggetto: req.oggetto,
    testo: req.testo,
  })

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.supplierRequest.update({
        where: { id },
        data: { stato: 'inviata', inviataIl: new Date() },
      })
      await logActivity(tx, {
        userId, azione: 'invia_richiesta_fornitore', entita: 'supplier_request', entitaId: id,
        valorePrecedente: req.stato,
        // L'identificativo del messaggio è la traccia con cui ritrovare l'email in "Posta
        // inviata" dell'account aziendale, il giorno in cui qualcuno chiederà se è partita.
        valoreNuovo: `inviata a ${req.supplier.email} (messaggio Gmail ${esito.id})`,
      })
      return updated
    })
  } catch (err) {
    // Caso raro ma non impossibile: posta partita, database non aggiornato. Dirlo è
    // l'unica risposta onesta — se restasse "approvata" in silenzio, qualcuno la
    // rimanderebbe, e il fornitore riceverebbe due volte la stessa richiesta.
    throw conflict(
      `L'email al fornitore È STATA INVIATA (messaggio Gmail ${esito.id}), ma lo stato della richiesta ` +
        'non è stato aggiornato per un errore del database. Non reinviarla: portala a "Inviata" a mano ' +
        `quando il problema è risolto. Dettaglio tecnico: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
