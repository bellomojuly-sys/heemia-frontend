// Tessuto → composizione → consigli di cura (pagina Notion «CONSIGLI DEL TEAM»).
//
// È una tabella di testi che finiscono sull'etichetta di lavaggio di un capo venduto:
// queste prove servono a fermare una modifica distratta, non a dimostrare che una mappa
// funziona.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { TESSUTI, tessutoConosciuto } from '../src/core/tessuti.js'
import { _svuotaRegistro } from '../src/modules/auth/tentativiLogin.js'

const prisma = new PrismaClient()
const RUN = `TEST-TES-${Date.now().toString(36).toUpperCase()}`
const password = 'Password-di-test-abbastanza-lunga-2026!'
const email = `${RUN.toLowerCase()}@test.local`

let app: Awaited<ReturnType<typeof buildApp>>
let userId = ''
let cookie = ''

before(async () => {
  const u = await prisma.user.create({
    data: { nome: `${RUN} admin`, email, role: 'admin', passwordHash: await bcrypt.hash(password, 4) },
  })
  userId = u.id
  app = await buildApp()
  await app.ready()
  _svuotaRegistro()
  const r = await app.inject({
    method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.6.1', payload: { email, password },
  })
  const raw = r.headers['set-cookie']
  cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0] ?? ''
})

after(async () => {
  await app.close()
  await prisma.productionStep.deleteMany({ where: { product: { codiceProdotto: { startsWith: RUN } } } })
  await prisma.product.deleteMany({ where: { codiceProdotto: { startsWith: RUN } } })
  await prisma.activityLog.deleteMany({ where: { userId } })
  await prisma.session.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('Tessuti, composizione e consigli di cura', () => {
  test('la tabella copre i dodici tessuti e nessuno resta senza testo', () => {
    assert.equal(TESSUTI.length, 12)
    for (const t of TESSUTI) {
      assert.ok(t.composizione.trim().length > 5, `${t.nome}: composizione mancante`)
      assert.ok(t.consigliCura.trim().length > 50, `${t.nome}: consigli troppo corti`)
    }
    // Nessun nome doppio: due righe per lo stesso tessuto renderebbero il risultato
    // dipendente dall'ordine.
    assert.equal(new Set(TESSUTI.map((t) => t.nome)).size, 12)
  })

  test('il tessuto si riconosce senza badare a maiuscole e spazi', () => {
    assert.equal(tessutoConosciuto('  PIQUÈ ')?.composizione, '80% Cotone - 10% Poliestere - 10% Elastan')
    assert.equal(tessutoConosciuto('Alpaca')?.nome, 'alpaca')
  })

  test('un tessuto fuori tabella non restituisce niente, invece di indovinare', () => {
    // `fodera` e le combinazioni non hanno una regola: un capo foderato ha una composizione
    // sua, e nessun documento dice come scriverla.
    assert.equal(tessutoConosciuto('gigiotto+fodera'), null)
    assert.equal(tessutoConosciuto('fodera'), null)
    assert.equal(tessutoConosciuto(''), null)
    assert.equal(tessutoConosciuto(undefined), null)
  })

  test('creando un capo col tessuto, composizione e consigli si compilano da soli', async () => {
    const r = await app.inject({
      method: 'POST', url: '/api/v1/products', headers: { cookie },
      payload: { nome: `${RUN} maglia`, codiceProdotto: `${RUN}-1`, linea: 'maglieria', tessuto: 'alpaca' },
    })
    assert.equal(r.statusCode, 201)
    const capo = await prisma.product.findUniqueOrThrow({ where: { codiceProdotto: `${RUN}-1` } })
    assert.equal(capo.composizione, '57% Poliammide - 42% Alpaca - 1% Elastan')
    assert.match(capo.consigliCura ?? '', /ciclo lana o delicati a freddo/)
    // Il testo è quello approvato dall'azienda: non nasce come bozza da rileggere.
    assert.equal(capo.consigliCuraStato, 'approvata')
  })

  test('una composizione scritta a mano vince su quella derivata', async () => {
    const r = await app.inject({
      method: 'POST', url: '/api/v1/products', headers: { cookie },
      payload: {
        nome: `${RUN} foderato`, codiceProdotto: `${RUN}-2`, linea: 'tessile',
        tessuto: 'gigiotto', composizione: '65% Cotone - 35% Poliestere, fodera 100% Poliestere',
      },
    })
    assert.equal(r.statusCode, 201)
    const capo = await prisma.product.findUniqueOrThrow({ where: { codiceProdotto: `${RUN}-2` } })
    assert.equal(capo.composizione, '65% Cotone - 35% Poliestere, fodera 100% Poliestere')
    // I consigli di cura restano quelli del tessuto: la fodera non cambia come si lava.
    assert.match(capo.consigliCura ?? '', /Primo lavaggio/)
  })

  test('un tessuto sconosciuto non inventa un\'etichetta di lavaggio', async () => {
    const r = await app.inject({
      method: 'POST', url: '/api/v1/products', headers: { cookie },
      payload: { nome: `${RUN} ignoto`, codiceProdotto: `${RUN}-3`, linea: 'tessile', tessuto: 'gigiotto+fodera' },
    })
    assert.equal(r.statusCode, 201)
    const capo = await prisma.product.findUniqueOrThrow({ where: { codiceProdotto: `${RUN}-3` } })
    assert.equal(capo.tessuto, 'gigiotto+fodera', 'il tessuto si salva comunque')
    assert.equal(capo.composizione, null)
    assert.equal(capo.consigliCura, null)
  })

  test('la tabella si legge dall\'API: il client non ne tiene una copia', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/tessuti', headers: { cookie } })
    assert.equal(r.statusCode, 200)
    assert.equal(r.json().length, 12)
    assert.equal(r.json()[0].nome, 'piquè')
  })
})
