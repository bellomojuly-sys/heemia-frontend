// Webhook Shopify in ingresso — API_Mapping §B1, System_Architecture A4.
//
// I webhook sono la **fonte primaria** degli eventi (un ordine arriva nel momento in cui
// viene fatto); la riconciliazione periodica resta la rete di sicurezza per quelli persi.
//
// Tre regole che questo file rispetta, e che sono tutte e tre nella nota di API_Mapping §B1:
//
//  1. **La firma si verifica sempre.** Senza, questo endpoint sarebbe un modo per chiunque
//     di scrivere ordini nel gestionale: è pubblico per forza — Shopify non ha una sessione —
//     quindi l'unica cosa che distingue una consegna vera da una finta è l'HMAC.
//  2. **Si risponde 200 in fretta.** Shopify considera fallita una consegna che non riceve
//     risposta entro pochi secondi e riprova; se l'elaborazione fosse dentro la risposta, un
//     ordine con molte righe diventerebbe un ordine consegnato più volte. Qui si risponde
//     subito e si elabora dopo.
//  3. **Un'elaborazione fallita non sparisce.** Va nel log strutturato con `reportError`,
//     e la riconciliazione la recupera comunque.
import crypto from 'node:crypto'
import { prisma } from '../../core/prisma.js'
import { config } from '../../core/config.js'
import { reportError } from '../../core/reportError.js'
import { shopifyGraphQL } from './client.js'
import { salvaOrdine } from './service.js'

/** Topic che l'app sa gestire. Uno non previsto viene accettato e ignorato, senza errore. */
export const TOPIC_GESTITI = ['orders/create', 'orders/updated', 'products/update', 'inventory_levels/update'] as const

/**
 * Confronto della firma **a tempo costante**. Un `===` su stringhe esce al primo carattere
 * diverso, e quella differenza di tempo è misurabile: basta a ricostruire la firma un
 * carattere alla volta. `timingSafeEqual` impiega lo stesso tempo comunque vada.
 */
export function firmaValida(corpo: Buffer, firmaRicevuta: string | undefined, segreto: string): boolean {
  if (!firmaRicevuta || !segreto) return false
  const attesa = crypto.createHmac('sha256', segreto).update(corpo).digest()
  let ricevuta: Buffer
  try {
    ricevuta = Buffer.from(firmaRicevuta, 'base64')
  } catch {
    return false
  }
  if (ricevuta.length !== attesa.length) return false
  return crypto.timingSafeEqual(ricevuta, attesa)
}

// --- Conversione del formato ----------------------------------------------------------
// I webhook consegnano il payload nel formato REST (snake_case), anche quando l'app usa
// GraphQL: i nomi dei campi sono diversi da quelli delle query. Qui si traduce una volta
// sola, così il salvataggio dell'ordine è lo stesso del percorso di import.

interface OrdineWebhook {
  name: string
  admin_graphql_api_id?: string
  created_at: string
  cancelled_at: string | null
  fulfillment_status: string | null
  total_price: string
  customer?: { email?: string | null; first_name?: string | null; last_name?: string | null } | null
  line_items?: { quantity: number; sku?: string | null; title: string; price: string }[]
}

function ordineDaWebhook(p: OrdineWebhook) {
  return {
    id: p.admin_graphql_api_id ?? p.name,
    name: p.name,
    createdAt: p.created_at,
    cancelledAt: p.cancelled_at,
    // Nel formato REST `fulfillment_status` vale "fulfilled", "partial" o null; in GraphQL
    // l'equivalente è FULFILLED. Si normalizza qui, non nel salvataggio.
    displayFulfillmentStatus: p.fulfillment_status === 'fulfilled' ? 'FULFILLED' : 'UNFULFILLED',
    totalPriceSet: { shopMoney: { amount: p.total_price } },
    customer: p.customer
      ? { email: p.customer.email ?? null, firstName: p.customer.first_name ?? null, lastName: p.customer.last_name ?? null }
      : null,
    lineItems: {
      nodes: (p.line_items ?? []).map((r) => ({
        quantity: r.quantity,
        sku: r.sku ?? null,
        title: r.title,
        originalUnitPriceSet: { shopMoney: { amount: r.price } },
      })),
    },
  }
}

interface ProdottoWebhook {
  status?: string
  variants?: { sku?: string | null; inventory_quantity?: number | null }[]
}

const QUERY_SKU_DA_INVENTORY_ITEM = `
  query skuDaInventoryItem($id: ID!) {
    inventoryItem(id: $id) { variant { sku } }
  }
`

/**
 * Aggiorna quantità pubblicata e divergenza di una variante, partendo dallo SKU.
 * Non tocca la giacenza interna: DEC-027 vuole che la divergenza si veda, non che si
 * risolva da sola.
 */
async function aggiornaDaShopify(sku: string, quantitaShopify: number) {
  const variante = await prisma.productVariant.findUnique({
    where: { sku: sku.trim() },
    select: { id: true, inventory: { select: { qtaMagazzino: true } } },
  })
  if (!variante) return
  const interno = variante.inventory?.qtaMagazzino ?? 0
  await prisma.inventoryRecord.updateMany({
    where: { variantId: variante.id },
    data: { stockShopify: quantitaShopify, divergenzaShopify: interno !== quantitaShopify },
  })
}

/** Elabora la consegna. Chiamata **dopo** aver già risposto 200 a Shopify. */
export async function elabora(topic: string, payload: unknown): Promise<void> {
  if (topic === 'orders/create' || topic === 'orders/updated') {
    await salvaOrdine(ordineDaWebhook(payload as OrdineWebhook))
    return
  }

  if (topic === 'products/update') {
    const p = payload as ProdottoWebhook
    const stato = p.status === 'active' ? 'pubblicato' : p.status === 'draft' ? 'bozza' : 'non_pubblicato'
    for (const v of p.variants ?? []) {
      if (!v.sku?.trim()) continue
      await aggiornaDaShopify(v.sku, v.inventory_quantity ?? 0)
      await prisma.product.updateMany({
        where: { variants: { some: { sku: v.sku.trim() } }, statoPubblicazioneShopify: { not: stato } },
        data: { statoPubblicazioneShopify: stato },
      })
    }
    return
  }

  if (topic === 'inventory_levels/update') {
    // Il payload porta l'`inventory_item_id`, che è un identificativo Shopify: l'app non lo
    // conserva (l'abbinamento è per SKU, che non invecchia). Si risolve con una domanda a
    // Shopify — una sola, e solo quando un livello cambia davvero.
    const p = payload as { inventory_item_id?: number | string; available?: number }
    if (p.inventory_item_id === undefined) return
    const gid = `gid://shopify/InventoryItem/${p.inventory_item_id}`
    const data: { inventoryItem: { variant: { sku: string | null } | null } | null } = await shopifyGraphQL(
      QUERY_SKU_DA_INVENTORY_ITEM,
      { id: gid },
    )
    const sku = data.inventoryItem?.variant?.sku
    if (sku) await aggiornaDaShopify(sku, p.available ?? 0)
  }
}

/** Avvia l'elaborazione senza far aspettare Shopify, e non lascia cadere gli errori. */
export function elaboraInBackground(topic: string, payload: unknown) {
  void elabora(topic, payload).catch((err) => {
    reportError(err)
  })
}

/** Il segreto configurato per i webhook, o stringa vuota se non è stato impostato. */
export function segretoWebhook(): string {
  // Shopify firma le consegne con il client secret dell'app. L'override separato resta
  // utile durante una rotazione, quando per un breve periodo può servire il secret meno
  // recente, ma nella configurazione normale non va duplicato in una seconda variabile.
  return config.shopifyWebhookSecret || config.shopifyClientSecret
}
