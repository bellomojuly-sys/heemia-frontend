// Clienti (FR-24). Porting di addCustomer/customers dal DataStore: la dedup per email
// è server-side (API_Mapping §Clienti) — oggi era nel form showroom.
import { Prisma } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { conflict, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'

export function listCustomers(filters: { tipologia?: string; q?: string }) {
  const where: Prisma.CustomerWhereInput = {}
  if (filters.tipologia) where.tipologia = filters.tipologia as Prisma.CustomerWhereInput['tipologia']
  if (filters.q) where.nome = { contains: filters.q, mode: 'insensitive' }
  return prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' } })
}

// Ritrova un cliente per email (case-insensitive) o ne crea uno nuovo. Usato sia dal CRUD
// interno sia dalla registrazione showroom, così un'email esistente non genera doppioni.
export async function findOrCreateCustomer(
  input: Prisma.CustomerCreateInput,
  userId: string | null,
) {
  if (input.email) {
    const existing = await prisma.customer.findFirst({
      where: { email: { equals: input.email, mode: 'insensitive' } },
    })
    if (existing) return existing
  }
  return prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({ data: input })
    await logActivity(tx, { userId, azione: 'create', entita: 'customer', entitaId: created.id, valoreNuovo: created.nome })
    return created
  })
}

// --- Modifica ed eliminazione di un cliente (2026-09-07) --------------------------

export async function updateCustomer(
  id: string,
  patch: Prisma.CustomerUpdateInput,
  userId: string,
) {
  const prima = await prisma.customer.findUnique({ where: { id } })
  if (!prima) throw notFound('Cliente non trovato')
  return prisma.$transaction(async (tx) => {
    const dopo = await tx.customer.update({ where: { id }, data: patch })
    await logActivity(tx, {
      userId, azione: 'update', entita: 'customer', entitaId: id,
      valorePrecedente: prima.nome, valoreNuovo: dopo.nome,
    })
    return dopo
  })
}

/**
 * Cosa comporta eliminare un cliente, **prima** di eliminarlo.
 *
 * Un cliente non vive da solo: ordini e fatture lo citano, le visite e le richieste
 * showroom gli appartengono. Le due relazioni si comportano in modo opposto, e chi
 * conferma la cancellazione deve saperlo:
 *
 *   - **Ordini e fatture restano.** Il collegamento al cliente diventa vuoto
 *     (`ON DELETE SET NULL`): il documento contabile non sparisce, ma da domani non si sa
 *     più a chi era intestato. È una perdita, non una pulizia.
 *   - **Visite, preferiti e richieste showroom spariscono** insieme al cliente
 *     (`ON DELETE CASCADE`): sono suoi e non hanno senso senza di lui.
 *
 * Il metodo non decide: conta e riferisce. La decisione la prende la persona davanti alla
 * conferma, che è l'unica a sapere se quel cliente è un doppione da togliere o un cliente
 * vero con dieci anni di ordini.
 */
export async function checkCustomerDeletion(id: string) {
  const cliente = await prisma.customer.findUnique({
    where: { id },
    include: {
      _count: {
        select: { orders: true, invoices: true, showroomVisits: true, showroomFavorites: true, showroomRequests: true },
      },
    },
  })
  if (!cliente) throw notFound('Cliente non trovato')

  const c = cliente._count
  const avvertenze: string[] = []
  if (c.orders > 0) {
    avvertenze.push(
      c.orders === 1
        ? "1 ordine resta registrato ma senza cliente: il fatturato non cambia, il nome sull'ordine sì."
        : `${c.orders} ordini restano registrati ma senza cliente: il fatturato non cambia, i nomi sugli ordini sì.`,
    )
  }
  if (c.invoices > 0) {
    avvertenze.push(
      c.invoices === 1
        ? '1 fattura resta in archivio senza intestatario.'
        : `${c.invoices} fatture restano in archivio senza intestatario.`,
    )
  }
  const showroom = c.showroomVisits + c.showroomFavorites + c.showroomRequests
  if (showroom > 0) {
    avvertenze.push(
      `${showroom} record dello showroom (visite, preferiti, richieste) vengono eliminati insieme al cliente.`,
    )
  }

  return {
    nome: [cliente.nome, cliente.cognome].filter(Boolean).join(' '),
    // Nessun blocco assoluto: nessuna relazione impedisce tecnicamente la cancellazione.
    // Quello che serve è che le conseguenze siano dette prima, non scoperte dopo.
    eliminabile: true,
    haStorico: c.orders > 0 || c.invoices > 0,
    avvertenze,
    conseguenze: {
      ordiniSenzaCliente: c.orders,
      fattureSenzaCliente: c.invoices,
      visiteShowroom: c.showroomVisits,
      preferitiShowroom: c.showroomFavorites,
      richiesteShowroom: c.showroomRequests,
    },
  }
}

/**
 * Elimina un cliente. Quando ha ordini o fatture collegate serve la conferma esplicita
 * (`confermaStorico`): il pulsante da solo non basta se la conseguenza è che dei documenti
 * contabili perdono l'intestatario.
 */
export async function deleteCustomer(id: string, userId: string, opts: { confermaStorico?: boolean } = {}) {
  const verifica = await checkCustomerDeletion(id)
  if (verifica.haStorico && !opts.confermaStorico) {
    throw conflict(
      `${verifica.nome} ha documenti collegati. ${verifica.avvertenze.join(' ')} ` +
        'Conferma esplicitamente per procedere.',
    )
  }

  return prisma.$transaction(async (tx) => {
    // Il log si scrive PRIMA della cancellazione: dopo, l'unica traccia di cosa è stato
    // eliminato sarebbe questa riga, e scriverla in coda significherebbe rischiare di
    // perderla proprio nel caso in cui serve.
    await logActivity(tx, {
      userId, azione: 'delete', entita: 'customer', entitaId: id,
      valorePrecedente: verifica.nome,
      valoreNuovo: verifica.avvertenze.length > 0 ? verifica.avvertenze.join(' ') : 'nessun documento collegato',
    })
    await tx.customer.delete({ where: { id } })
    return { deleted: true, ...verifica.conseguenze }
  })
}
