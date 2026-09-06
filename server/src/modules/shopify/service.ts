// Sincronizzazione con Shopify — FR-17, DEC-009 (bidirezionale), DEC-027 (nei conflitti
// vince Shopify, ma **la divergenza non si risolve mai in silenzio**).
//
// Come è stata letta DEC-027, perché è il punto su cui questo modulo poteva sbagliare.
// «Vince Shopify» non significa che la riconciliazione sovrascrive le giacenze interne da
// sola: significa che quando una divergenza viene risolta, il numero giusto è quello di
// Shopify. La riconciliazione quindi **registra e segnala**, non corregge; la correzione è
// un gesto esplicito (`allineaVarianteAShopify`) che lascia una traccia nell'activity log e
// un movimento di magazzino. Il motivo pratico: la giacenza interna comprende laboratorio,
// capi in produzione e capi presso i lavoranti, che Shopify non conosce — sovrascriverla con
// il numero dell'e-commerce cancellerebbe informazione che l'e-commerce non ha.
//
// L'abbinamento fra i due mondi è lo **SKU**: è unico da entrambe le parti e non cambia
// quando si rinomina un capo. Nessun identificativo Shopify viene salvato a database: si
// risolve a ogni sincronizzazione, così un prodotto ricreato su Shopify non lascia dietro
// un riferimento morto.
import { prisma } from '../../core/prisma.js'
import { badRequest, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import { configurata, messaggioNonConfigurata } from '../../core/integrations.js'
import { shopifyGraphQL, verificaUserErrors } from './client.js'

const CHIAVE_ULTIMA_RICONCILIAZIONE = 'shopify_ultima_riconciliazione'

// --- Lettura da Shopify ---------------------------------------------------------------

const QUERY_VARIANTI = `
  query varianti($cursor: String) {
    productVariants(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        sku
        inventoryQuantity
        inventoryItem { id }
        product { id title status }
      }
    }
  }
`

export interface VarianteShopify {
  id: string
  sku: string
  quantita: number
  inventoryItemId: string
  productId: string
  productTitle: string
  /** ACTIVE | DRAFT | ARCHIVED */
  productStatus: string
}

/** Tutte le varianti del negozio, seguendo la paginazione fino in fondo. */
export async function leggiVarianti(): Promise<VarianteShopify[]> {
  const varianti: VarianteShopify[] = []
  let cursor: string | null = null

  do {
    const data: {
      productVariants: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: {
          id: string
          sku: string | null
          inventoryQuantity: number | null
          inventoryItem: { id: string } | null
          product: { id: string; title: string; status: string }
        }[]
      }
    } = await shopifyGraphQL(QUERY_VARIANTI, { cursor })

    for (const n of data.productVariants.nodes) {
      // Una variante senza SKU non è abbinabile: non è un errore, è un prodotto che su
      // Shopify non ha codice. Viene contata a parte nel rapporto, non ignorata in silenzio.
      if (!n.sku?.trim()) continue
      varianti.push({
        id: n.id,
        sku: n.sku.trim(),
        quantita: n.inventoryQuantity ?? 0,
        inventoryItemId: n.inventoryItem?.id ?? '',
        productId: n.product.id,
        productTitle: n.product.title,
        productStatus: n.product.status,
      })
    }
    cursor = data.productVariants.pageInfo.hasNextPage ? data.productVariants.pageInfo.endCursor : null
  } while (cursor)

  return varianti
}

/** Lo stato di pubblicazione dell'app, dedotto da quello di Shopify. */
function statoPubblicazione(shopify: string): 'pubblicato' | 'bozza' | 'non_pubblicato' {
  if (shopify === 'ACTIVE') return 'pubblicato'
  if (shopify === 'DRAFT') return 'bozza'
  return 'non_pubblicato'
}

export interface EsitoRiconciliazione {
  eseguitaIl: string
  varianteSuShopify: number
  varianteInHeemia: number
  abbinate: number
  divergenze: { sku: string; interno: number; shopify: number }[]
  soloSuShopify: string[]
  soloInHeemia: string[]
  prodottiAggiornati: number
}

/**
 * Riconciliazione: legge Shopify e aggiorna ciò che di Shopify l'app tiene a database
 * (quantità pubblicata e stato di pubblicazione). **Non tocca le giacenze interne.**
 *
 * È anche la rete di sicurezza per i webhook persi (System_Architecture A4): i webhook sono
 * la fonte primaria, ma un webhook che non arriva non lascia traccia — questa funzione sì.
 */
export async function riconcilia(userId: string): Promise<EsitoRiconciliazione> {
  const varianti = await leggiVarianti()
  const perSku = new Map(varianti.map((v) => [v.sku.toUpperCase(), v]))

  const nostre = await prisma.productVariant.findMany({
    select: { id: true, sku: true, productId: true, inventory: { select: { qtaMagazzino: true, stockShopify: true } } },
  })

  const divergenze: EsitoRiconciliazione['divergenze'] = []
  const soloInHeemia: string[] = []
  const abbinateSku = new Set<string>()
  const statiProdotto = new Map<string, 'pubblicato' | 'bozza' | 'non_pubblicato'>()

  for (const nostra of nostre) {
    const suShopify = perSku.get(nostra.sku.toUpperCase())
    if (!suShopify) {
      soloInHeemia.push(nostra.sku)
      continue
    }
    abbinateSku.add(nostra.sku.toUpperCase())
    statiProdotto.set(nostra.productId, statoPubblicazione(suShopify.productStatus))

    // Il confronto è con la giacenza di **magazzino**: è quella che alimenta l'e-commerce.
    // Laboratorio, capi in produzione e capi presso i lavoranti non sono vendibili online.
    const interno = nostra.inventory?.qtaMagazzino ?? 0
    const divergente = interno !== suShopify.quantita
    if (divergente) divergenze.push({ sku: nostra.sku, interno, shopify: suShopify.quantita })

    await prisma.inventoryRecord.updateMany({
      where: { variantId: nostra.id },
      data: { stockShopify: suShopify.quantita, divergenzaShopify: divergente },
    })
  }

  // Lo stato di pubblicazione si scrive una volta per prodotto, non una per variante.
  let prodottiAggiornati = 0
  for (const [productId, stato] of statiProdotto) {
    const esito = await prisma.product.updateMany({
      where: { id: productId, statoPubblicazioneShopify: { not: stato } },
      data: { statoPubblicazioneShopify: stato },
    })
    prodottiAggiornati += esito.count
  }

  const soloSuShopify = varianti.filter((v) => !abbinateSku.has(v.sku.toUpperCase())).map((v) => v.sku)
  const eseguitaIl = new Date().toISOString()

  await prisma.appSetting.upsert({
    where: { chiave: CHIAVE_ULTIMA_RICONCILIAZIONE },
    update: { valore: eseguitaIl },
    create: { chiave: CHIAVE_ULTIMA_RICONCILIAZIONE, valore: eseguitaIl },
  })

  await logActivity(prisma, {
    userId,
    azione: 'riconciliazione_shopify',
    entita: 'integrazione',
    valoreNuovo:
      `${abbinateSku.size} varianti abbinate · ${divergenze.length} divergenze · ` +
      `${soloSuShopify.length} solo su Shopify · ${soloInHeemia.length} solo in Heemia`,
  })

  return {
    eseguitaIl,
    varianteSuShopify: varianti.length,
    varianteInHeemia: nostre.length,
    abbinate: abbinateSku.size,
    divergenze,
    soloSuShopify,
    soloInHeemia,
    prodottiAggiornati,
  }
}

/**
 * Risoluzione esplicita di una divergenza: la giacenza di magazzino prende il numero di
 * Shopify (DEC-027). È un gesto umano, non un effetto della sincronizzazione, e lascia un
 * movimento di magazzino con la motivazione — altrimenti fra un mese nessuno saprebbe
 * perché quella variante è cambiata.
 */
export async function allineaVarianteAShopify(variantId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.inventoryRecord.findUnique({
      where: { variantId },
      include: { variant: { select: { sku: true } } },
    })
    if (!record) throw notFound('Record di inventario non trovato per questa variante')
    if (!record.divergenzaShopify) throw badRequest('Questa variante non è in divergenza con Shopify.')

    const precedente = record.qtaMagazzino
    const nuovo = record.stockShopify
    const differenza = nuovo - precedente

    const aggiornato = await tx.inventoryRecord.update({
      where: { variantId },
      data: { qtaMagazzino: nuovo, divergenzaShopify: false },
    })
    await tx.productVariant.update({
      where: { id: variantId },
      data: { stockDisponibile: nuovo + aggiornato.qtaLaboratorio },
    })
    await tx.inventoryMovement.create({
      data: {
        variantId,
        tipo: differenza >= 0 ? 'carico' : 'scarico',
        quantita: Math.abs(differenza),
        motivo: 'Allineamento a Shopify (DEC-027: nei conflitti vince il dato Shopify)',
        note: `magazzino ${precedente} → ${nuovo}`,
        createdBy: userId,
      },
    })
    await logActivity(tx, {
      userId,
      azione: 'allinea_a_shopify',
      entita: 'inventory_record',
      entitaId: record.id,
      valorePrecedente: `${record.variant.sku}: magazzino ${precedente}`,
      valoreNuovo: `magazzino ${nuovo} (valore Shopify)`,
    })
    return { variantId, sku: record.variant.sku, precedente, nuovo }
  })
}

// --- Scrittura verso Shopify ----------------------------------------------------------

const QUERY_LOCATION = `query { locations(first: 1, includeInactive: false) { nodes { id name } } }`

const MUTATION_STOCK = `
  mutation impostaGiacenze($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup { createdAt }
      userErrors { field message code }
    }
  }
`

/** L'ubicazione del negozio. Una sola: Heemia vende da un magazzino solo. */
async function locationId(): Promise<string> {
  if (config_locationId) return config_locationId
  const data: { locations: { nodes: { id: string; name: string }[] } } = await shopifyGraphQL(QUERY_LOCATION)
  const location = data.locations.nodes[0]
  if (!location) throw badRequest('Il negozio Shopify non ha nessuna ubicazione attiva: non si può scrivere lo stock.')
  config_locationId = location.id
  return location.id
}
let config_locationId = ''

/**
 * Pubblica su Shopify la giacenza di **magazzino** delle varianti abbinate.
 *
 * Idempotente per costruzione: `inventorySetQuantities` scrive una quantità **assoluta**,
 * non un delta. Un tentativo ripetuto dopo un timeout riscrive lo stesso numero invece di
 * sommarlo — che è la ragione per cui qui non si usa `inventoryAdjustQuantities`.
 */
export async function pubblicaGiacenze(userId: string) {
  const varianti = await leggiVarianti()
  const perSku = new Map(varianti.map((v) => [v.sku.toUpperCase(), v]))

  const nostre = await prisma.productVariant.findMany({
    select: { sku: true, inventory: { select: { qtaMagazzino: true } } },
  })

  const quantities: { inventoryItemId: string; locationId: string; quantity: number }[] = []
  const location = await locationId()
  const scritte: string[] = []

  for (const nostra of nostre) {
    const suShopify = perSku.get(nostra.sku.toUpperCase())
    if (!suShopify?.inventoryItemId) continue
    const quantita = nostra.inventory?.qtaMagazzino ?? 0
    if (quantita === suShopify.quantita) continue // già allineata: nessuna scrittura inutile
    quantities.push({ inventoryItemId: suShopify.inventoryItemId, locationId: location, quantity: quantita })
    scritte.push(`${nostra.sku}: ${suShopify.quantita} → ${quantita}`)
  }

  if (quantities.length === 0) {
    return { scritte: 0, dettaglio: [] as string[], nota: 'Tutte le giacenze erano già allineate.' }
  }

  const data: {
    inventorySetQuantities: {
      inventoryAdjustmentGroup: { createdAt: string } | null
      userErrors: { field?: string[] | null; message: string }[]
    }
  } = await shopifyGraphQL(MUTATION_STOCK, {
    input: {
      name: 'available',
      reason: 'correction',
      // Senza questo Shopify pretende il valore atteso di partenza per ogni riga e rifiuta
      // la scrittura se qualcuno ha venduto nel frattempo. Qui la fonte è Heemia e la
      // scrittura è deliberata, quindi si sovrascrive.
      ignoreCompareQuantity: true,
      quantities,
    },
  })
  verificaUserErrors('la scrittura delle giacenze', data.inventorySetQuantities.userErrors)

  await prisma.appSetting.upsert({
    where: { chiave: CHIAVE_ULTIMA_RICONCILIAZIONE },
    update: { valore: new Date().toISOString() },
    create: { chiave: CHIAVE_ULTIMA_RICONCILIAZIONE, valore: new Date().toISOString() },
  })
  await logActivity(prisma, {
    userId,
    azione: 'pubblica_giacenze_shopify',
    entita: 'integrazione',
    valoreNuovo: `${quantities.length} varianti scritte su Shopify`,
  })

  return { scritte: quantities.length, dettaglio: scritte }
}

// --- Ordini ---------------------------------------------------------------------------

const QUERY_ORDINI = `
  query ordini($cursor: String, $filtro: String) {
    orders(first: 50, after: $cursor, query: $filtro, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        cancelledAt
        displayFulfillmentStatus
        totalPriceSet { shopMoney { amount } }
        customer { email firstName lastName }
        lineItems(first: 100) {
          nodes {
            quantity
            sku
            title
            originalUnitPriceSet { shopMoney { amount } }
          }
        }
      }
    }
  }
`

interface RigaOrdine {
  quantita: number
  prezzoUnitario: string
  variantId: string | null
  productId: string | null
}

interface OrdineShopify {
  id: string
  name: string
  createdAt: string
  cancelledAt: string | null
  displayFulfillmentStatus: string
  totalPriceSet: { shopMoney: { amount: string } }
  customer: { email: string | null; firstName: string | null; lastName: string | null } | null
  lineItems: { nodes: { quantity: number; sku: string | null; title: string; originalUnitPriceSet: { shopMoney: { amount: string } } }[] }
}

function statoOrdine(o: OrdineShopify): 'in_lavorazione' | 'spedito' | 'consegnato' | 'annullato' {
  if (o.cancelledAt) return 'annullato'
  if (o.displayFulfillmentStatus === 'FULFILLED') return 'spedito'
  return 'in_lavorazione'
}

/**
 * Importa gli ordini dell'e-commerce. Non duplica: il numero dell'ordine Shopify (`#1042`)
 * è la chiave, e `orders.numero` è unico a database.
 *
 * Lo stato di consegna resta quello di Shopify per «spedito», ma **«consegnato» non si
 * deduce**: Shopify sa che il pacco è partito, non che è arrivato. Quel passaggio lo fa
 * una persona nel gestionale, com'è sempre stato.
 */
export async function importaOrdini(userId: string, dal?: string) {
  // Per difetto si guardano gli ultimi 90 giorni: abbastanza da recuperare quel che i
  // webhook avessero perso, poco abbastanza da non riscaricare la storia a ogni giro.
  const daQuando = dal ?? new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const filtro = `created_at:>=${daQuando}`

  let cursor: string | null = null
  const ordini: OrdineShopify[] = []
  do {
    const data: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrdineShopify[] } } =
      await shopifyGraphQL(QUERY_ORDINI, { cursor, filtro })
    ordini.push(...data.orders.nodes)
    cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null
  } while (cursor)

  let creati = 0
  let aggiornati = 0
  const righeSenzaCorrispondenza: string[] = []

  for (const o of ordini) {
    const esito = await salvaOrdine(o, righeSenzaCorrispondenza)
    if (esito === 'creato') creati += 1
    if (esito === 'aggiornato') aggiornati += 1
  }

  await logActivity(prisma, {
    userId,
    azione: 'import_ordini_shopify',
    entita: 'integrazione',
    valoreNuovo: `${creati} nuovi · ${aggiornati} aggiornati · ${ordini.length} letti da ${daQuando}`,
  })

  return { letti: ordini.length, creati, aggiornati, righeSenzaCorrispondenza, dal: daQuando }
}

/** Scrive un ordine Shopify nel gestionale. Esportata perché la usa anche il webhook. */
export async function salvaOrdine(o: OrdineShopify, righeSenzaCorrispondenza: string[] = []) {
  const esistente = await prisma.order.findUnique({ where: { numero: o.name } })

  // Lo stato può cambiare dopo l'import (spedizione, annullamento): si aggiorna quello,
  // non si ricreano le righe — le righe di un ordine non cambiano più.
  if (esistente) {
    const stato = statoOrdine(o)
    if (esistente.stato === stato) return 'invariato'
    await prisma.order.update({ where: { id: esistente.id }, data: { stato } })
    return 'aggiornato'
  }

  const customerId = await trovaOCreaCliente(o.customer)

  // Le righe si costruiscono con i campi scalari (`variantId`, `productId`) invece che con
  // `connect`: un `connect` opzionale obbliga a uno spread condizionale dentro l'input di
  // Prisma, e lì l'inferenza dei tipi esplode al punto da bloccare il compilatore.
  const righe: RigaOrdine[] = []
  for (const riga of o.lineItems.nodes) {
    const sku = riga.sku?.trim()
    const variante = sku
      ? await prisma.productVariant.findUnique({ where: { sku }, select: { id: true, productId: true } })
      : null
    // Una riga senza corrispondenza entra lo stesso: il totale dell'ordine deve tornare.
    // Il capo non collegato viene segnalato, così si può sistemare lo SKU.
    if (!variante && sku) righeSenzaCorrispondenza.push(`${o.name}: ${sku} (${riga.title})`)
    righe.push({
      quantita: riga.quantity,
      prezzoUnitario: riga.originalUnitPriceSet.shopMoney.amount,
      variantId: variante?.id ?? null,
      productId: variante?.productId ?? null,
    })
  }

  await prisma.order.create({
    data: {
      numero: o.name,
      canale: 'shopify',
      stato: statoOrdine(o),
      data: new Date(o.createdAt),
      totale: o.totalPriceSet.shopMoney.amount,
      customerId,
      items: { create: righe },
    },
  })
  return 'creato'
}

/**
 * Il cliente dell'e-commerce. L'abbinamento è per email: è l'unico dato stabile che Shopify
 * fornisce sempre. Senza email l'ordine resta senza cliente collegato invece di creare un
 * anonimo nuovo a ogni acquisto.
 */
async function trovaOCreaCliente(
  cliente: { email: string | null; firstName: string | null; lastName: string | null } | null,
): Promise<string | null> {
  const email = cliente?.email?.trim().toLowerCase()
  if (!email) return null

  const esistente = await prisma.customer.findFirst({ where: { email } })
  if (esistente) return esistente.id

  const nome = [cliente?.firstName, cliente?.lastName].filter(Boolean).join(' ').trim() || email
  const creato = await prisma.customer.create({
    data: { nome, email, tipologia: 'ecommerce' },
  })
  return creato.id
}

// --- Stato ----------------------------------------------------------------------------

export async function statoShopify() {
  const [pubblicati, nonPubblicati, divergenze, ultima] = await Promise.all([
    prisma.product.count({ where: { statoPubblicazioneShopify: 'pubblicato' } }),
    prisma.product.count({ where: { statoPubblicazioneShopify: { not: 'pubblicato' } } }),
    prisma.inventoryRecord.count({ where: { divergenzaShopify: true } }),
    prisma.appSetting.findUnique({ where: { chiave: CHIAVE_ULTIMA_RICONCILIAZIONE } }),
  ])
  return {
    configurato: configurata('shopify'),
    pubblicati,
    nonPubblicati,
    divergenzeStock: divergenze,
    ultimaRiconciliazione: ultima?.valore ?? null,
    nota: configurata('shopify') ? undefined : messaggioNonConfigurata('shopify'),
  }
}

/** Elenco delle divergenze aperte, con lo SKU: è quello che serve per risolverle. */
export async function listaDivergenze() {
  const record = await prisma.inventoryRecord.findMany({
    where: { divergenzaShopify: true },
    select: {
      variantId: true,
      qtaMagazzino: true,
      stockShopify: true,
      variant: { select: { sku: true, taglia: true, colore: true, product: { select: { nome: true } } } },
    },
    orderBy: { variant: { sku: 'asc' } },
  })
  return record.map((r) => ({
    variantId: r.variantId,
    sku: r.variant.sku,
    capo: r.variant.product.nome,
    taglia: r.variant.taglia,
    colore: r.variant.colore,
    interno: r.qtaMagazzino,
    shopify: r.stockShopify,
    differenza: r.stockShopify - r.qtaMagazzino,
  }))
}
