// Registra (o riallinea) i webhook Shopify gestiti da Heemia.
//
// Uso:
//   npm run shopify:webhooks:register -- https://heemia-api.onrender.com/api/v1/shopify/webhooks
//
// È intenzionalmente un comando esplicito e non parte all'avvio del server: aggiornare
// sottoscrizioni è una modifica esterna e va eseguita soltanto quando l'endpoint pubblico
// della nuova versione è già online e verificato.
import { config } from '../src/core/config.js'
import { shopifyGraphQL } from '../src/modules/shopify/client.js'

const TOPIC = ['ORDERS_CREATE', 'ORDERS_UPDATED', 'PRODUCTS_UPDATE', 'INVENTORY_LEVELS_UPDATE'] as const

const uri = String(process.argv[2] ?? '').trim().replace(/\/$/, '')
if (!uri || !uri.startsWith('https://')) {
  throw new Error('Indica l’URL HTTPS completo del webhook come primo argomento.')
}
if (uri.includes('localhost') || uri.includes('127.0.0.1')) {
  throw new Error('Shopify non può consegnare webhook a un indirizzo locale.')
}
if (!config.shopifyStoreDomain || !(config.shopifyAdminApiToken || (config.shopifyClientId && config.shopifyClientSecret))) {
  throw new Error('Credenziali Shopify mancanti: controlla SHOPIFY_STORE_DOMAIN e Client ID/Secret.')
}

type Sottoscrizione = { id: string; topic: string; uri: string }
type ErroriUtente = { field?: string[] | null; message: string }[]

const esistenti = await shopifyGraphQL<{ webhookSubscriptions: { nodes: Sottoscrizione[] } }>(`
  query WebhookHeemiaEsistenti {
    webhookSubscriptions(first: 250) { nodes { id topic uri } }
  }
`)

const crea = `
  mutation CreaWebhookHeemia($topic: WebhookSubscriptionTopic!, $input: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $input) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }
`

const aggiorna = `
  mutation AggiornaWebhookHeemia($id: ID!, $input: WebhookSubscriptionInput!) {
    webhookSubscriptionUpdate(id: $id, webhookSubscription: $input) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }
`

let create = 0
let update = 0
let invariati = 0

for (const topic of TOPIC) {
  const stessoTopic = esistenti.webhookSubscriptions.nodes.find((w) => w.topic === topic)
  if (stessoTopic?.uri === uri) {
    invariati += 1
    continue
  }

  if (stessoTopic) {
    const r = await shopifyGraphQL<{
      webhookSubscriptionUpdate: { webhookSubscription: Sottoscrizione | null; userErrors: ErroriUtente }
    }>(aggiorna, { id: stessoTopic.id, input: { uri } })
    if (r.webhookSubscriptionUpdate.userErrors.length) {
      throw new Error(`${topic}: ${r.webhookSubscriptionUpdate.userErrors.map((e) => e.message).join('; ')}`)
    }
    update += 1
    continue
  }

  const r = await shopifyGraphQL<{
    webhookSubscriptionCreate: { webhookSubscription: Sottoscrizione | null; userErrors: ErroriUtente }
  }>(crea, { topic, input: { uri } })
  if (r.webhookSubscriptionCreate.userErrors.length) {
    throw new Error(`${topic}: ${r.webhookSubscriptionCreate.userErrors.map((e) => e.message).join('; ')}`)
  }
  create += 1
}

console.log(JSON.stringify({ ok: true, uri, create, update, invariati, totale: TOPIC.length }))
