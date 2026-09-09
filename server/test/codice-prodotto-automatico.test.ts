// Il codice prodotto lo assegna il sistema (Giulia, 2026-09-10: «rendi la creazione del
// codice prodotto automatica, che si autogenera»).
//
// Cosa proteggono queste prove:
// - che il numero esca in coda alla serie vera, letta dai capi presenti, e non da un
//   contatore a parte che con i dati puo' disallinearsi;
// - che i codici fuori serie (il capo di prova, o un codice storico diverso) non spostino
//   il progressivo ne' lo mandino in errore;
// - che un codice esplicito continui a essere accettato: l'import del censimento porta
//   HEE-001…HEE-093 e non deve rinumerarli;
// - che l'anteprima mostrata dal form sia lo stesso numero che poi viene assegnato.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { _svuotaRegistro } from '../src/modules/auth/tentativiLogin.js'

const prisma = new PrismaClient()
const RUN = `TEST-COD-${Date.now().toString(36).toUpperCase()}`
const password = 'Password-di-test-abbastanza-lunga-2026!'
const email = `${RUN.toLowerCase()}@test.local`

let app: Awaited<ReturnType<typeof buildApp>>
let userId = ''
let cookie = ''
/** Codici creati dalle prove: si cancellano alla fine, uno per uno. */
const creati: string[] = []

before(async () => {
  const u = await prisma.user.create({
    data: { nome: `${RUN} admin`, email, role: 'admin', passwordHash: await bcrypt.hash(password, 4) },
  })
  userId = u.id
  app = await buildApp()
  await app.ready()
  _svuotaRegistro()
  const r = await app.inject({
    method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.9.7', payload: { email, password },
  })
  const raw = r.headers['set-cookie']
  cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0] ?? ''
})

after(async () => {
  await app.close()
  const daTogliere = { codiceProdotto: { in: [...creati, `${RUN}-FUORISERIE`] } }
  await prisma.productionStep.deleteMany({ where: { product: daTogliere } })
  await prisma.product.deleteMany({ where: daTogliere })
  await prisma.activityLog.deleteMany({ where: { userId } })
  await prisma.session.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
})

const crea = (payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/v1/products', headers: { cookie }, payload })

const anteprima = async (): Promise<string> => {
  const r = await app.inject({ method: 'GET', url: '/api/v1/products/prossimo-codice', headers: { cookie } })
  assert.equal(r.statusCode, 200)
  return r.json().codiceProdotto as string
}

/** Il numero della serie dentro un codice HEE-###. */
const numero = (codice: string): number => Number(codice.slice(4))

describe('Codice prodotto assegnato dal sistema', () => {
  test('un capo creato senza codice ne riceve uno della serie, in coda a quelli esistenti', async () => {
    const previsto = await anteprima()
    assert.match(previsto, /^HEE-\d{3,}$/, 'il codice segue la serie dell’azienda')

    const r = await crea({ nome: `${RUN} capo senza codice`, linea: 'tessile' })
    assert.equal(r.statusCode, 201)
    const assegnato = r.json().codiceProdotto as string
    creati.push(assegnato)

    assert.equal(assegnato, previsto, 'il form mostra lo stesso numero che il server assegna')
  })

  test('due capi di fila non prendono lo stesso numero', async () => {
    const primo = await crea({ nome: `${RUN} capo A`, linea: 'tessile' })
    const secondo = await crea({ nome: `${RUN} capo B`, linea: 'maglieria' })
    assert.equal(primo.statusCode, 201)
    assert.equal(secondo.statusCode, 201)

    const a = primo.json().codiceProdotto as string
    const b = secondo.json().codiceProdotto as string
    creati.push(a, b)

    assert.notEqual(a, b)
    assert.equal(numero(b), numero(a) + 1, 'la serie avanza di uno, senza buchi')
  })

  test('un codice fuori serie non sposta il progressivo', async () => {
    const primaDi = await anteprima()
    const r = await crea({ nome: `${RUN} capo fuori serie`, linea: 'tessile', codiceProdotto: `${RUN}-FUORISERIE` })
    assert.equal(r.statusCode, 201)
    assert.equal(r.json().codiceProdotto, `${RUN}-FUORISERIE`, 'un codice esplicito viene rispettato')

    assert.equal(await anteprima(), primaDi, 'la serie continua da dov’era: il codice estraneo non conta')
  })

  test('cancellato l’ultimo capo, il suo numero torna disponibile', async () => {
    // Il progressivo si legge dai capi presenti, quindi questo e' il comportamento atteso e
    // non un incidente: un capo con storico non e' cancellabile (checkProductDeletion lo
    // blocca, al suo posto si archivia e l'archivio occupa il numero), quindi qui si sta
    // riprendendo il codice di un capo creato per sbaglio e tolto subito.
    const r = await crea({ nome: `${RUN} capo da cancellare`, linea: 'tessile' })
    const codice = r.json().codiceProdotto as string
    const id = r.json().id as string
    await prisma.productionStep.deleteMany({ where: { productId: id } })
    await prisma.product.delete({ where: { id } })

    assert.equal(await anteprima(), codice)
  })

  test('un codice esplicito già in uso resta un conflitto, non un doppione', async () => {
    const r = await crea({ nome: `${RUN} capo A bis`, linea: 'tessile', codiceProdotto: creati[0] })
    assert.equal(r.statusCode, 409)
  })

  test('il nome resta obbligatorio: il codice automatico non lo sostituisce', async () => {
    const r = await crea({ linea: 'tessile' })
    assert.equal(r.statusCode, 400)
  })
})
