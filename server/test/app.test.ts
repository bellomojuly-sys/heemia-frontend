// Verifiche HTTP trasversali delle Fasi 16-18. Usano Fastify.inject: attraversano router,
// cookie, validazione, RBAC e Prisma senza aprire una porta di rete. Il database resta vero
// e isolabile con DATABASE_URL, come le prove delle lavorazioni.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { SESSION_COOKIE } from '../src/modules/auth/session.js'
import { _svuotaRegistro } from '../src/modules/auth/tentativiLogin.js'

const prisma = new PrismaClient()
const RUN = `TEST-HTTP-${Date.now().toString(36).toUpperCase()}`
const adminEmail = `${RUN.toLowerCase()}-admin@test.local`
const viewerEmail = `${RUN.toLowerCase()}-viewer@test.local`
const password = 'Password-di-test-abbastanza-lunga-2026!'

let app: Awaited<ReturnType<typeof buildApp>>
let adminId = ''
let viewerId = ''
const productIds: string[] = []

async function login(email: string, remoteAddress: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    remoteAddress,
    payload: { email, password },
  })
  const setCookie = response.headers['set-cookie']
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie
  return { response, cookie: raw?.split(';')[0] ?? '' }
}

before(async () => {
  const passwordHash = await bcrypt.hash(password, 4)
  const [admin, viewer] = await Promise.all([
    prisma.user.create({ data: { nome: `${RUN} Admin`, email: adminEmail, role: 'admin', passwordHash } }),
    prisma.user.create({ data: { nome: `${RUN} Viewer`, email: viewerEmail, role: 'viewer', passwordHash } }),
  ])
  adminId = admin.id
  viewerId = viewer.id
  app = await buildApp()
  await app.ready()
})

after(async () => {
  await app.close()
  if (productIds.length) {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } })
    await prisma.activityLog.deleteMany({ where: { entitaId: { in: productIds } } })
  }
  await prisma.activityLog.deleteMany({ where: { userId: { in: [adminId, viewerId] } } })
  await prisma.session.deleteMany({ where: { userId: { in: [adminId, viewerId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [adminId, viewerId] } } })
  await prisma.$disconnect()
})

describe('API, autenticazione e permessi', () => {
  test('health prova anche il database e applica gli header di sicurezza', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    assert.equal(response.statusCode, 200)
    assert.equal(response.json().status, 'ok')
    assert.match(String(response.headers['content-security-policy']), /default-src 'none'/)
    assert.equal(response.headers['x-content-type-options'], 'nosniff')
    assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN')
  })

  test('una rotta interna senza sessione restituisce JSON 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/products' })
    assert.equal(response.statusCode, 401)
    assert.deepEqual(response.json(), {
      error: { code: 'UNAUTHORIZED', message: 'Non autenticato' },
    })
  })

  test('il login non rivela se è sbagliata la mail o la password', async () => {
    const [utenteAssente, passwordErrata] = await Promise.all([
      app.inject({
        method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.0.21',
        payload: { email: 'non-esiste@test.local', password },
      }),
      app.inject({
        method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.0.22',
        payload: { email: adminEmail, password: 'password-sbagliata' },
      }),
    ])
    assert.equal(utenteAssente.statusCode, 401)
    assert.equal(passwordErrata.statusCode, 401)
    assert.deepEqual(utenteAssente.json(), passwordErrata.json())
  })

  test('il login valido crea un cookie httpOnly e non restituisce la sessione nel corpo', async () => {
    const { response, cookie } = await login(adminEmail, '127.0.0.23')
    assert.equal(response.statusCode, 200)
    assert.ok(cookie.startsWith(`${SESSION_COOKIE}=`))
    const header = String(response.headers['set-cookie'])
    assert.match(header, /HttpOnly/i)
    assert.match(header, /SameSite=Lax/i)
    assert.match(header, /Max-Age=\d+/i)
    assert.equal('sessionId' in response.json(), false)

    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })
    assert.equal(me.statusCode, 200)
    assert.equal(me.json().email, adminEmail)
    assert.equal('sessionId' in me.json(), false)
  })

  test('scrittura e rilettura passano dalla API e persistono su PostgreSQL', async () => {
    const { cookie } = await login(adminEmail, '127.0.0.24')
    const codiceProdotto = `${RUN}-PROD`
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: { cookie },
      payload: {
        nome: `${RUN} Capo prova`, codiceProdotto, linea: 'tessile',
        categoria: 'test', prezzoVendita: 122, visibileShowroom: true,
      },
    })
    assert.equal(created.statusCode, 201)
    const productId = created.json().id as string
    productIds.push(productId)

    const reloaded = await app.inject({
      method: 'GET', url: `/api/v1/products/${productId}`, headers: { cookie },
    })
    assert.equal(reloaded.statusCode, 200)
    assert.equal(reloaded.json().codiceProdotto, codiceProdotto)
    assert.equal(Number(reloaded.json().prezzoVendita), 122)
    assert.equal(await prisma.productionStep.count({ where: { productId } }), 1)
  })

  test('il catalogo pubblico espone solo dati commerciali, mai costi o scorte', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/showroom/catalog' })
    assert.equal(response.statusCode, 200)
    const product = (response.json() as Array<Record<string, unknown>>)
      .find((row) => row.id === productIds[0])
    assert.ok(product)
    for (const forbidden of ['prezzoNettoIva', 'costoDiretto', 'stockDisponibile', 'supplierId']) {
      assert.equal(forbidden in product, false, `${forbidden} non deve uscire nel catalogo`)
    }
  })

  test('un ruolo viewer legge ma non può scrivere', async () => {
    const { cookie } = await login(viewerEmail, '127.0.0.25')
    const read = await app.inject({ method: 'GET', url: '/api/v1/products', headers: { cookie } })
    assert.equal(read.statusCode, 200)
    const write = await app.inject({
      method: 'POST', url: '/api/v1/products', headers: { cookie },
      payload: { nome: `${RUN} Vietato`, codiceProdotto: `${RUN}-NO`, linea: 'tessile' },
    })
    assert.equal(write.statusCode, 403)
    assert.equal(write.json().error.code, 'FORBIDDEN')
  })

  test('un identificativo malformato si ferma a 400 prima di Prisma', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/products/non-uuid' })
    assert.equal(response.statusCode, 400)
    assert.equal(response.json().error.code, 'BAD_REQUEST')
  })

  // Due freni distinti, provati separatamente perché proteggono da due cose diverse.
  // Ogni prova sceglie email e indirizzi in modo che scatti solo quello in esame.

  test('l’undicesimo tentativo di login dallo stesso indirizzo viene limitato', async () => {
    _svuotaRegistro()
    let response
    // Email tutte diverse: qui l'oggetto della prova è il limite per indirizzo, non quello
    // per account, che con un solo bersaglio scatterebbe prima.
    for (let i = 0; i < 11; i += 1) {
      response = await app.inject({
        method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.0.99',
        payload: { email: `brute-force-${i}@test.local`, password: `tentativo-${i}` },
      })
    }
    assert.equal(response!.statusCode, 429)
    assert.deepEqual(response!.json(), {
      error: { code: 'RATE_LIMIT', message: 'Troppe richieste, riprova tra poco' },
    })
  })

  // Il limite per indirizzo si aggira cambiando indirizzo, e su Render l'indirizzo arriva
  // da un'intestazione. Il conteggio per email no: è il bersaglio stesso.
  test('nove tentativi sullo stesso account bloccano l’account, anche cambiando indirizzo ogni volta', async () => {
    _svuotaRegistro()
    const bersaglio = `${RUN.toLowerCase()}-bersaglio@test.local`
    let response
    for (let i = 0; i < 9; i += 1) {
      response = await app.inject({
        method: 'POST', url: '/api/v1/auth/login', remoteAddress: `127.0.3.${i + 1}`,
        payload: { email: bersaglio, password: `tentativo-${i}` },
      })
    }
    assert.equal(response!.statusCode, 429)
    assert.equal(response!.json().error.code, 'RATE_LIMIT')
    assert.match(response!.json().error.message, /Troppi tentativi di accesso per questo indirizzo/)

    // Il blocco vale anche presentando la password giusta: non è un controllo di credenziali.
    const conPasswordGiusta = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.3.50',
      payload: { email: adminEmail, password },
    })
    assert.equal(conPasswordGiusta.statusCode, 200, 'un altro account non deve essere coinvolto')
  })

  test('un accesso riuscito azzera i tentativi falliti di quell’account', async () => {
    _svuotaRegistro()
    for (let i = 0; i < 7; i += 1) {
      await app.inject({
        method: 'POST', url: '/api/v1/auth/login', remoteAddress: `127.0.4.${i + 1}`,
        payload: { email: viewerEmail, password: 'sbagliata' },
      })
    }
    const riuscito = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.4.20',
      payload: { email: viewerEmail, password },
    })
    assert.equal(riuscito.statusCode, 200)

    // Se il contatore non si fosse azzerato, l'ottavo fallimento porterebbe subito al blocco.
    const dopo = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.4.21',
      payload: { email: viewerEmail, password: 'sbagliata' },
    })
    assert.equal(dopo.statusCode, 401)
  })
})
