import { Prisma } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { conflict, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import { calcolaDisponibilita, registraRettifiche, verificaMigrazione } from '../inventory/service.js'

export function listProducts(filters: { stato?: string; linea?: string; q?: string }) {
  const where: Prisma.ProductWhereInput = {}
  if (filters.stato) where.stato = filters.stato as Prisma.ProductWhereInput['stato']
  if (filters.linea) where.linea = filters.linea as Prisma.ProductWhereInput['linea']
  if (filters.q) where.nome = { contains: filters.q, mode: 'insensitive' }
  return prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, include: { variants: true } })
}

export async function getProduct(id: string) {
  const p = await prisma.product.findUnique({
    where: { id },
    include: { variants: true, technicalSheets: true, productionSteps: true },
  })
  if (!p) throw notFound('Prodotto non trovato')
  return p
}

export async function createProduct(input: Prisma.ProductCreateInput, userId: string) {
  const exists = await prisma.product.findUnique({ where: { codiceProdotto: input.codiceProdotto } })
  if (exists) throw conflict(`Codice prodotto "${input.codiceProdotto}" già esistente`)
  return prisma.$transaction(async (tx) => {
    const created = await tx.product.create({ data: input })
    // FR-07: ogni prodotto entra subito in pipeline dalla sua fase iniziale. Senza questo
    // step il capo non comparirebbe nel kanban Produzione (comportamento del prototipo).
    await tx.productionStep.create({
      data: {
        productId: created.id,
        fase: created.stato,
        responsabile: 'Da assegnare',
        dataInizio: new Date(),
        bloccata: false,
      },
    })
    await logActivity(tx, { userId, azione: 'create', entita: 'product', entitaId: created.id, valoreNuovo: created.nome })
    return created
  })
}

export async function updateProduct(id: string, input: Prisma.ProductUpdateInput, userId: string) {
  const before = await prisma.product.findUnique({ where: { id } })
  if (!before) throw notFound('Prodotto non trovato')
  return prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({ where: { id }, data: input })
    await logActivity(tx, {
      userId, azione: 'update', entita: 'product', entitaId: id,
      valorePrecedente: before.nome, valoreNuovo: updated.nome,
    })
    return updated
  })
}

// --- Eliminazione di un capo ---
//
// Cancellare un prodotto porta via con sé, per cascata, varianti, giacenze, schede tecniche,
// documenti della modellista e righe di pipeline. Su un capo che ha già uno storico
// contabile questo falserebbe report e margini a ritroso, quindi la cancellazione si
// FERMA e spiega perché: i dati di vendita restano coerenti e al loro posto si archivia
// il capo (stato `archivio`), che lo toglie dalle liste senza distruggere niente.

export interface VerificaEliminazione {
  nome: string
  eliminabile: boolean
  /** Motivi che impediscono la cancellazione, in italiano, pronti da mostrare. */
  blocchi: string[]
  /** Cosa sparirebbe insieme al capo: serve a scrivere una conferma onesta. */
  conseguenze: {
    varianti: number
    schedeTecniche: number
    documentiModellista: number
    fasiPipeline: number
    pezziInGiacenza: number
  }
}

export async function checkProductDeletion(id: string): Promise<VerificaEliminazione> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { variants: { select: { id: true } } },
  })
  if (!product) throw notFound('Prodotto non trovato')

  const variantIds = product.variants.map((v) => v.id)

  const [
    righeOrdine, righeFattura, schedeTecniche, documenti, fasiPipeline,
    movimenti, impegniAperti, giacenze, richiesteFornitore, richiesteShowroom,
  ] = await Promise.all([
    prisma.orderItem.count({ where: { productId: id } }),
    prisma.invoiceProduct.count({ where: { productId: id } }),
    prisma.technicalSheet.count({ where: { productId: id } }),
    prisma.patternDocument.count({ where: { productId: id } }),
    prisma.productionStep.count({ where: { productId: id } }),
    variantIds.length ? prisma.inventoryMovement.count({ where: { variantId: { in: variantIds } } }) : 0,
    prisma.stockCommitment.count({ where: { productId: id, stato: 'in_produzione' } }),
    variantIds.length
      ? prisma.inventoryRecord.findMany({
          where: { variantId: { in: variantIds } },
          select: { qtaMagazzino: true, qtaLaboratorio: true, qtaVenduta: true },
        })
      : [],
    prisma.supplierRequest.count({ where: { productId: id } }),
    // Richieste dalla vista cliente ancora aperte (spec 2026-08-06): il capo resterebbe
    // scollegato dalla scheda (FK SetNull) e l'atelier non saprebbe più cosa è stato chiesto.
    prisma.showroomRequest.count({
      where: { productId: id, stato: { notIn: ['consegnato', 'annullato'] } },
    }),
  ])

  const pezziInGiacenza = giacenze.reduce((s, g) => s + g.qtaMagazzino + g.qtaLaboratorio, 0)
  const pezziVenduti = giacenze.reduce((s, g) => s + g.qtaVenduta, 0)

  const blocchi: string[] = []
  if (righeOrdine > 0) {
    blocchi.push(`è presente in ${righeOrdine} ${righeOrdine === 1 ? 'riga d\'ordine' : 'righe d\'ordine'}: cancellarlo lascerebbe vendite senza capo`)
  }
  if (righeFattura > 0) {
    blocchi.push(`è collegato a ${righeFattura} ${righeFattura === 1 ? 'fattura' : 'fatture'}: la ripartizione dei costi (FR-23) perderebbe il riferimento`)
  }
  if (pezziVenduti > 0) {
    blocchi.push(`risultano ${pezziVenduti} pezzi già venduti a inventario`)
  }
  if (movimenti > 0) {
    blocchi.push(`ha ${movimenti} ${movimenti === 1 ? 'movimento' : 'movimenti'} di magazzino registrati: è lo storico degli spostamenti fra magazzino e laboratorio`)
  }
  if (impegniAperti > 0) {
    blocchi.push(`ha ${impegniAperti} ${impegniAperti === 1 ? 'lavorazione aperta' : 'lavorazioni aperte'} con capi in produzione: chiudile o rimetti i capi a disposizione prima`)
  }
  if (richiesteFornitore > 0) {
    blocchi.push(`è citato in ${richiesteFornitore} ${richiesteFornitore === 1 ? 'richiesta a fornitore' : 'richieste a fornitore'}`)
  }
  if (richiesteShowroom > 0) {
    blocchi.push(`ha ${richiesteShowroom} ${richiesteShowroom === 1 ? 'richiesta showroom aperta' : 'richieste showroom aperte'}: chiudile o annullale prima`)
  }

  return {
    nome: product.nome,
    eliminabile: blocchi.length === 0,
    blocchi,
    conseguenze: {
      varianti: variantIds.length,
      schedeTecniche,
      documentiModellista: documenti,
      fasiPipeline,
      pezziInGiacenza,
    },
  }
}

export async function deleteProduct(id: string, userId: string) {
  // Il controllo si rifà qui e non ci si fida di quello fatto dal client: fra la conferma
  // a schermo e il click possono essere arrivati un ordine o una fattura.
  const verifica = await checkProductDeletion(id)
  if (!verifica.eliminabile) {
    throw conflict(
      `"${verifica.nome}" non si può eliminare: ${verifica.blocchi.join('; ')}. ` +
        'Puoi archiviarlo: sparisce dalle liste operative e lo storico resta intatto.',
    )
  }

  return prisma.$transaction(async (tx) => {
    // Il log resta anche dopo la cancellazione: entitaId è un identificativo libero, senza
    // vincolo verso la tabella prodotti, quindi la traccia di chi ha cancellato non si perde.
    await logActivity(tx, {
      userId, azione: 'delete', entita: 'product', entitaId: id,
      valorePrecedente: verifica.nome,
      valoreNuovo: `eliminato (${verifica.conseguenze.varianti} varianti, ${verifica.conseguenze.schedeTecniche} schede tecniche)`,
    })
    await tx.product.delete({ where: { id } })
    return { id, nome: verifica.nome }
  })
}

// --- Varianti (FR-03) ---
// Porting di addVariant: variante e record inventario nascono insieme e restano collegati.

export async function createVariant(
  productId: string,
  input: { sku: string; taglia: string; colore: string; stockIniziale: number; sogliaMinima: number; immagineUrl?: string },
  userId: string,
) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw notFound('Prodotto non trovato')
  const dup = await prisma.productVariant.findUnique({ where: { sku: input.sku } })
  if (dup) throw conflict(`SKU "${input.sku}" già esistente`)

  const stato = stockStato(input.stockIniziale, input.sogliaMinima)
  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.create({
      data: {
        productId,
        sku: input.sku,
        taglia: input.taglia,
        colore: input.colore,
        stockDisponibile: input.stockIniziale,
        immagineUrl: input.immagineUrl,
        statoDisponibilita: stato,
      },
    })
    await tx.inventoryRecord.create({
      data: {
        variantId: variant.id,
        qtaMagazzino: input.stockIniziale,
        sogliaMinima: input.sogliaMinima,
        stato,
        stockShopify: input.stockIniziale,
        divergenzaShopify: false,
        // Variante creata dall'app: chi la inserisce sa già dove sono i capi, quindi
        // non c'è nessuna distribuzione iniziale da ricostruire (FR-49). La migrazione
        // riguarda solo le righe che arrivano dall'import, dove si conosce il totale
        // ma non la ripartizione fra magazzino e laboratorio.
        totaleMigrazione: input.stockIniziale,
        migrazioneCompletata: true,
        migrazioneConfermataIl: new Date(),
        migrazioneConfermataDa: userId,
      },
    })
    await logActivity(tx, { userId, azione: 'create', entita: 'product_variant', entitaId: variant.id, valoreNuovo: variant.sku })
    return variant
  })
}

/** Stessa soglia del prototipo (variantStato): 0 = esaurito, <= soglia = low_stock. */
function stockStato(qta: number, sogliaMinima: number): 'disponibile' | 'esaurito' | 'low_stock' {
  if (qta <= 0) return 'esaurito'
  if (qta <= sogliaMinima) return 'low_stock'
  return 'disponibile'
}

// Aggiorna le quantità di una variante passando dal record inventario, così i due
// restano allineati (stessa logica di updateVariantQuantities nel MockStore).
export async function updateVariantQuantities(
  variantId: string,
  patch: {
    qtaMagazzino?: number
    qtaLaboratorio?: number
    qtaRiservata?: number
    sogliaMinima?: number
    sogliaMinimaLaboratorio?: number
  },
  userId: string,
) {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { inventory: true } })
  if (!variant) throw notFound('Variante non trovata')

  const rec = variant.inventory
  // Stessa regola di PATCH /inventory/:id: durante la distribuzione iniziale le quantità
  // si toccano solo dichiarando cosa significa il numero (FR-49). Senza questo controllo
  // la domanda si aggirava scrivendo dal dettaglio prodotto, che passa da questa rotta.
  if (rec) verificaMigrazione(rec, patch)
  const qtaMagazzino = patch.qtaMagazzino ?? rec?.qtaMagazzino ?? 0
  const qtaLaboratorio = patch.qtaLaboratorio ?? rec?.qtaLaboratorio ?? 0
  const qtaRiservata = patch.qtaRiservata ?? rec?.qtaRiservata ?? 0
  const sogliaMinima = patch.sogliaMinima ?? rec?.sogliaMinima ?? 0
  // Disponibile = magazzino + laboratorio: sono entrambe giacenze di capi finiti.
  const calcolo = calcolaDisponibilita({
    qtaMagazzino,
    qtaLaboratorio,
    sogliaMinima,
    stockShopify: rec?.stockShopify ?? qtaMagazzino + qtaLaboratorio,
  })

  return prisma.$transaction(async (tx) => {
    const inventory = await tx.inventoryRecord.upsert({
      where: { variantId },
      update: {
        qtaMagazzino,
        qtaLaboratorio,
        qtaRiservata,
        sogliaMinima,
        sogliaMinimaLaboratorio: patch.sogliaMinimaLaboratorio ?? rec?.sogliaMinimaLaboratorio ?? 0,
        stato: calcolo.stato,
        divergenzaShopify: calcolo.divergenzaShopify,
      },
      create: {
        variantId,
        qtaMagazzino,
        qtaLaboratorio,
        qtaRiservata,
        sogliaMinima,
        sogliaMinimaLaboratorio: patch.sogliaMinimaLaboratorio ?? 0,
        stato: calcolo.stato,
        stockShopify: calcolo.disponibileTotale,
        divergenzaShopify: false,
      },
    })
    const updated = await tx.productVariant.update({
      where: { id: variantId },
      data: {
        stockDisponibile: calcolo.disponibileTotale,
        stockRiservato: qtaRiservata,
        statoDisponibilita: calcolo.stato,
      },
    })
    await registraRettifiche(
      tx,
      variantId,
      { qtaMagazzino: rec?.qtaMagazzino ?? 0, qtaLaboratorio: rec?.qtaLaboratorio ?? 0 },
      { qtaMagazzino, qtaLaboratorio: patch.qtaLaboratorio ?? rec?.qtaLaboratorio ?? 0 },
      userId,
    )
    await logActivity(tx, {
      userId, azione: 'update', entita: 'product_variant', entitaId: variantId,
      valorePrecedente: `magazzino ${rec?.qtaMagazzino ?? 0}`, valoreNuovo: `magazzino ${qtaMagazzino}`,
    })
    return { variant: updated, inventory }
  })
}

// Le schede tecniche complete vivono in ./technicalSheets.ts (estensione 2026-07-30).
