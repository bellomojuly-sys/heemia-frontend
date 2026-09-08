// Shopify — FR-17. Le prove riguardano le tre cose che possono far danno prima ancora che
// esistano le credenziali: la **firma** dei webhook (senza, l'endpoint è un modo per
// chiunque di scrivere ordini), il **retry** verso l'API (che non deve trasformare un
// errore in quattro né rinunciare a un limite di frequenza passeggero) e la **traduzione**
// del payload dei webhook, che arriva in un formato diverso da quello delle query.
//
// Le credenziali qui sono finte e servono solo a far superare il controllo di
// configurazione: nessuna chiamata esce davvero, `fetch` è sostituito.
//
//     cd server && npm test
process.env.SHOPIFY_STORE_DOMAIN = 'heemia-prova.myshopify.com'
process.env.SHOPIFY_ADMIN_API_TOKEN = 'shpat_finto_per_i_test'
process.env.SHOPIFY_WEBHOOK_SECRET = 'segreto-di-prova-abbastanza-lungo'

import test, { afterEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import Fastify from 'fastify'

const { shopifyGraphQL, azzeraTokenShopifyPerTest } = await import('../src/modules/shopify/client.js')
const { firmaValida } = await import('../src/modules/shopify/webhooks.js')
const { shopifyWebhookRoutes } = await import('../src/modules/shopify/routes.js')
const { config } = await import('../src/core/config.js')

const fetchOriginale = globalThis.fetch

afterEach(() => {
  globalThis.fetch = fetchOriginale
  config.shopifyAdminApiToken = 'shpat_finto_per_i_test'
  config.shopifyClientId = ''
  config.shopifyClientSecret = ''
  azzeraTokenShopifyPerTest()
})

/** Sostituisce `fetch` con una sequenza di risposte, e conta quante volte è stato chiamato. */
function fingiFetch(risposte: { stato: number; corpo?: unknown; headers?: Record<string, string> }[]) {
  const chiamate = { n: 0 }
  globalThis.fetch = (async () => {
    const r = risposte[Math.min(chiamate.n, risposte.length - 1)]
    chiamate.n += 1
    return new Response(JSON.stringify(r.corpo ?? {}), {
      status: r.stato,
      headers: { 'content-type': 'application/json', ...(r.headers ?? {}) },
    })
  }) as typeof fetch
  return chiamate
}

describe('Firma dei webhook Shopify', () => {
  const segreto = 'segreto-di-prova-abbastanza-lungo'
  const corpo = Buffer.from(JSON.stringify({ name: '#1001', total_price: '120.00' }), 'utf8')
  const firma = crypto.createHmac('sha256', segreto).update(corpo).digest('base64')

  test('una firma corretta viene accettata', () => {
    assert.equal(firmaValida(corpo, firma, segreto), true)
  })

  test('un corpo modificato di un solo carattere invalida la firma', () => {
    const alterato = Buffer.from(corpo.toString('utf8').replace('120.00', '120.01'), 'utf8')
    assert.equal(firmaValida(alterato, firma, segreto), false)
  })

  test('senza firma, con firma vuota o con segreto assente si rifiuta', () => {
    assert.equal(firmaValida(corpo, undefined, segreto), false)
    assert.equal(firmaValida(corpo, '', segreto), false)
    assert.equal(firmaValida(corpo, firma, ''), false)
  })

  test('una firma di lunghezza diversa non fa esplodere il confronto', () => {
    assert.equal(firmaValida(corpo, Buffer.from('corta').toString('base64'), segreto), false)
    assert.equal(firmaValida(corpo, 'non-è-base64-valido!!!', segreto), false)
  })

  test('un segreto diverso non passa', () => {
    assert.equal(firmaValida(corpo, firma, 'un-altro-segreto-lungo-abbastanza'), false)
  })

  test('se non c’è un override, la firma usa il client secret ufficiale dell’app', async () => {
    const webhookSecret = config.shopifyWebhookSecret
    const clientSecret = config.shopifyClientSecret
    try {
      config.shopifyWebhookSecret = ''
      config.shopifyClientSecret = 'client-secret-usato-anche-per-i-webhook'
      const { segretoWebhook } = await import('../src/modules/shopify/webhooks.js')
      assert.equal(segretoWebhook(), 'client-secret-usato-anche-per-i-webhook')
    } finally {
      config.shopifyWebhookSecret = webhookSecret
      config.shopifyClientSecret = clientSecret
    }
  })

  test('la rotta pubblica unica accetta il topic orders/create nell’header', async () => {
    const app = Fastify()
    await app.register(shopifyWebhookRoutes, { prefix: '/api/v1' })

    const risposta = await app.inject({
      method: 'POST',
      url: '/api/v1/shopify/webhooks',
      headers: {
        'content-type': 'application/json',
        'x-shopify-topic': 'orders/create',
        'x-shopify-hmac-sha256': 'firma-volutamente-errata',
      },
      payload: corpo,
    })

    assert.equal(risposta.statusCode, 401, 'la rotta deve esistere e rifiutare la firma, non rispondere 404')
    await app.close()
  })
})

describe('Chiamate alla GraphQL Admin API', () => {
  test('con Client Credentials ottiene il token e lo riusa finché è valido', async () => {
    config.shopifyAdminApiToken = ''
    config.shopifyClientId = 'client-id-finto'
    config.shopifyClientSecret = 'client-secret-finto'
    azzeraTokenShopifyPerTest()

    const urlChiamati: string[] = []
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      urlChiamati.push(url)
      if (url.endsWith('/admin/oauth/access_token')) {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          client_id: 'client-id-finto',
          client_secret: 'client-secret-finto',
          grant_type: 'client_credentials',
        })
        return new Response(JSON.stringify({ access_token: 'token-dinamico', expires_in: 86_399 }), { status: 200 })
      }
      assert.equal(new Headers(init?.headers).get('X-Shopify-Access-Token'), 'token-dinamico')
      return new Response(JSON.stringify({ data: { shop: { name: 'Heemia' } } }), { status: 200 })
    }) as typeof fetch

    await shopifyGraphQL('query { shop { name } }')
    await shopifyGraphQL('query { shop { name } }')

    assert.equal(urlChiamati.filter((url) => url.endsWith('/admin/oauth/access_token')).length, 1)
    assert.equal(urlChiamati.length, 3)
  })

  test('credenziali Client Credentials rifiutate producono un errore leggibile', async () => {
    config.shopifyAdminApiToken = ''
    config.shopifyClientId = 'client-id-finto'
    config.shopifyClientSecret = 'client-secret-errato'
    azzeraTokenShopifyPerTest()
    const chiamate = fingiFetch([
      { stato: 400, corpo: { error: 'invalid_client', error_description: 'Client authentication failed' } },
    ])

    await assert.rejects(
      () => shopifyGraphQL('query { shop { name } }'),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, 'SHOPIFY_BAD_CREDENTIALS')
        assert.match(err.message, /Client ID|Client Secret/i)
        return true
      },
    )
    assert.equal(chiamate.n, 1)
  })

  test('una risposta buona torna come dati, con una sola chiamata', async () => {
    const chiamate = fingiFetch([{ stato: 200, corpo: { data: { shop: { name: 'Heemia' } } } }])
    const dati = await shopifyGraphQL<{ shop: { name: string } }>('query { shop { name } }')
    assert.equal(dati.shop.name, 'Heemia')
    assert.equal(chiamate.n, 1)
  })

  test('un 429 viene ritentato e il tentativo successivo riesce', async () => {
    const chiamate = fingiFetch([
      { stato: 429, headers: { 'retry-after': '0' } },
      { stato: 200, corpo: { data: { ok: true } } },
    ])
    const dati = await shopifyGraphQL<{ ok: boolean }>('query { ok }')
    assert.equal(dati.ok, true)
    assert.equal(chiamate.n, 2)
  })

  test('un THROTTLED (che arriva con HTTP 200) viene ritentato', async () => {
    const chiamate = fingiFetch([
      { stato: 200, corpo: { errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }] } },
      { stato: 200, corpo: { data: { ok: true } } },
    ])
    await shopifyGraphQL('query { ok }')
    assert.equal(chiamate.n, 2)
  })

  test('un token rifiutato NON viene ritentato, e il messaggio dice cosa controllare', async () => {
    const chiamate = fingiFetch([{ stato: 401 }])
    await assert.rejects(
      () => shopifyGraphQL('query { ok }'),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, 'SHOPIFY_BAD_TOKEN')
        assert.match(err.message, /scope|token/i)
        return true
      },
    )
    assert.equal(chiamate.n, 1, 'un 4xx non migliora riprovando: una chiamata sola')
  })

  test('un errore GraphQL applicativo non viene ritentato', async () => {
    const chiamate = fingiFetch([
      { stato: 200, corpo: { errors: [{ message: "Field 'inesistente' doesn't exist" }] } },
    ])
    await assert.rejects(() => shopifyGraphQL('query { inesistente }'), /ha rifiutato la richiesta/)
    assert.equal(chiamate.n, 1)
  })

  test('dopo quattro tentativi falliti si smette e si spiega perché', async () => {
    const chiamate = fingiFetch([{ stato: 503, headers: { 'retry-after': '0' } }])
    await assert.rejects(() => shopifyGraphQL('query { ok }'), /Shopify ha risposto 503/)
    assert.equal(chiamate.n, 4)
  })

  test('un errore di rete diventa un messaggio leggibile, non uno stack', async () => {
    globalThis.fetch = (async () => {
      throw new Error('fetch failed')
    }) as typeof fetch
    await assert.rejects(
      () => shopifyGraphQL('query { ok }'),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, 'SHOPIFY_UNREACHABLE')
        return true
      },
    )
  })
})
