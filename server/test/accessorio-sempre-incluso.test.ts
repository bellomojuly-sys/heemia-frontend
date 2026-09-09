// L'accessorio che va su ogni capo (Giulia, 2026-09-09: «ogni capo usa cartellini e velina,
// sempre che sia ordinato in showroom o online»).
//
// Cosa proteggono queste prove: che la regola stia nel **dato** e non nel nome. La velina è
// riconosciuta perché `sempreIncluso` è vero, non perché si chiama «velina» — se domani
// diventa «carta velina», il costo deve continuare a entrare nelle schede. E la colonna deve
// nascere `false`: un accessorio che entra da solo in tutte le schede senza che nessuno
// l'abbia deciso sarebbe un costo comparso dal nulla su novantaquattro capi.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { _svuotaRegistro } from '../src/modules/auth/tentativiLogin.js'

const prisma = new PrismaClient()
const RUN = `TEST-SEM-${Date.now().toString(36).toUpperCase()}`
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
    method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.9.1', payload: { email, password },
  })
  const raw = r.headers['set-cookie']
  cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0] ?? ''
})

after(async () => {
  await app.close()
  await prisma.accessory.deleteMany({ where: { codice: { startsWith: RUN } } })
  await prisma.activityLog.deleteMany({ where: { userId } })
  await prisma.session.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
})

const crea = (payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/v1/accessories', headers: { cookie }, payload })

describe('Accessorio incluso in ogni capo', () => {
  test('nasce «no»: nessun accessorio entra nelle schede senza che qualcuno lo decida', async () => {
    const r = await crea({ nome: `${RUN} bottone`, codice: `${RUN}-BOT`, destinazione: 'capo' })
    assert.equal(r.statusCode, 201)
    assert.equal(r.json().sempreIncluso, false)
  })

  test('si dichiara alla creazione e torna indietro dall’API', async () => {
    const r = await crea({
      nome: `${RUN} velina`, codice: `${RUN}-VEL`, destinazione: 'packaging', sempreIncluso: true, costoUnitario: 0.06,
    })
    assert.equal(r.statusCode, 201)
    assert.equal(r.json().sempreIncluso, true)

    // Riletto dal database, non dalla risposta: è la garanzia che chiede CLAUDE.md.
    const salvato = await prisma.accessory.findUniqueOrThrow({ where: { codice: `${RUN}-VEL` } })
    assert.equal(salvato.sempreIncluso, true)
  })

  test('si toglie e si rimette dopo, senza ricreare la riga', async () => {
    const creato = await crea({ nome: `${RUN} cartellino`, codice: `${RUN}-CAR`, destinazione: 'packaging' })
    const id = creato.json().id

    const acceso = await app.inject({
      method: 'PATCH', url: `/api/v1/accessories/${id}`, headers: { cookie }, payload: { sempreIncluso: true },
    })
    assert.equal(acceso.statusCode, 200)
    assert.equal(acceso.json().sempreIncluso, true)

    const spento = await app.inject({
      method: 'PATCH', url: `/api/v1/accessories/${id}`, headers: { cookie }, payload: { sempreIncluso: false },
    })
    assert.equal(spento.statusCode, 200)
    assert.equal((await prisma.accessory.findUniqueOrThrow({ where: { id } })).sempreIncluso, false)
  })

  test('non è un sinonimo di packaging: i cartellini sono packaging e restano una scelta', async () => {
    // La distinzione è il senso della colonna. Se bastasse `destinazione`, ogni cartellino
    // entrerebbe in ogni scheda — e i quattro cartellini non costano uguale né vanno tutti
    // sullo stesso capo.
    const pack = await prisma.accessory.findMany({
      where: { codice: { startsWith: RUN }, destinazione: 'packaging' },
      select: { codice: true, sempreIncluso: true },
    })
    assert.equal(pack.length, 2)
    assert.deepEqual(
      pack.filter((a) => a.sempreIncluso).map((a) => a.codice),
      [`${RUN}-VEL`],
    )
  })
})
