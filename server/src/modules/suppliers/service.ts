// Fornitori (FR-25) e richieste fornitore / bozze email (FR-06). Porting fedele di
// addSupplier, addSupplierRequest, setSupplierRequestStatus, updateSupplierRequestDraft dal MockStore.
import { Prisma, type SupplierReqStato } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import { daImplementare, richiediConfigurata } from '../../core/integrations.js'

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
//
// ⚠️ Il pezzo che compone e spedisce il messaggio NON è ancora scritto (Fase 15.1 punto 2).
// Prima questa funzione controllava solo le credenziali e poi marcava comunque la
// richiesta come "inviata": il giorno in cui le credenziali Google fossero comparse
// nell'ambiente, l'app avrebbe dichiarato inviate email che nessuno spediva, e il
// fornitore sarebbe rimasto in attesa di una richiesta mai partita. Il secondo controllo
// esiste per questo, e va tolto **insieme** al codice che invia davvero, non prima.
export async function sendSupplierRequest(id: string, userId: string) {
  const req = await prisma.supplierRequest.findUnique({ where: { id }, include: { supplier: true } })
  if (!req) throw notFound('Richiesta fornitore non trovata')
  richiediConfigurata('gmail')
  // TODO(Fase 15.1 punto 2): costruire il MIME (destinatario req.supplier.email, oggetto,
  // corpo da req.testo) e chiamare gmail.users.messages.send con il refresh token del
  // server; solo a invio riuscito passare lo stato a "inviata" e registrarlo nel log.
  daImplementare(
    'Invio della richiesta al fornitore via email',
    'Fase 15.1 punto 2, API_Mapping §B2',
  )
  // Riga di arrivo quando l'invio esisterà: setSupplierRequestStatus(id, 'inviata', userId)
}
