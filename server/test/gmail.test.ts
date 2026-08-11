// Invio delle richieste ai fornitori — FR-06, DEC-028 (Fase 15.1 punto 2).
//
// Cosa si può provare senza credenziali Google, che è quasi tutto ciò che conta:
//   1. la composizione del messaggio (accenti, iniezione di intestazioni, base64);
//   2. i rifiuti che devono avvenire **prima** che l'email parta — richiesta non
//      approvata, già inviata, fornitore senza indirizzo, credenziali mancanti.
//
// Il punto (2) è il cuore: qui l'ordine delle operazioni è la funzionalità. Se uno di
// questi controlli finisse dopo l'invio, l'email sarebbe già partita quando l'app dice
// di no — ed è esattamente il difetto che questa integrazione ha sostituito.
//
// Resta fuori una cosa sola, e va detta: **nessuna email è mai stata spedita davvero.**
// Serve il refresh token dell'account Heemia (Integrazioni_Setup §2). Il giorno che
// arriva, la prova è `POST /api/v1/integrations/gmail/test`, che manda un messaggio
// all'indirizzo aziendale stesso.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { componiMime, indirizzoValido } from '../src/modules/gmail/service.js'
import { sendSupplierRequest, setSupplierRequestStatus } from '../src/modules/suppliers/service.js'

const prisma = new PrismaClient()
const RUN = `TEST-MAIL-${Date.now().toString(36).toUpperCase()}`

const admin = { id: '' }
let supplierConEmail = ''
let supplierSenzaEmail = ''
const richieste: string[] = []

async function nuovaRichiesta(supplierId: string) {
  const r = await prisma.supplierRequest.create({
    data: {
      supplierId,
      oggetto: `${RUN} Richiesta riassortimento`,
      testo: 'Buongiorno,\nvi chiediamo la disponibilità di 20 metri.\nGrazie.',
      stato: 'bozza_generata',
    },
  })
  richieste.push(r.id)
  return r.id
}

before(async () => {
  const u = await prisma.user.create({
    data: { nome: 'Tester invio', email: `${RUN.toLowerCase()}@test.local`, role: 'admin' },
  })
  admin.id = u.id
  const a = await prisma.supplier.create({
    data: { nome: `${RUN} Tessuti Rossi`, categoria: 'Tessuti', email: 'fornitore@example.invalid' },
  })
  supplierConEmail = a.id
  const b = await prisma.supplier.create({
    data: { nome: `${RUN} Tessuti Senza Posta`, categoria: 'Tessuti' },
  })
  supplierSenzaEmail = b.id
})

after(async () => {
  await prisma.activityLog.deleteMany({ where: { entitaId: { in: richieste } } })
  await prisma.supplierRequest.deleteMany({ where: { id: { in: richieste } } })
  await prisma.supplier.deleteMany({ where: { id: { in: [supplierConEmail, supplierSenzaEmail] } } })
  await prisma.activityLog.deleteMany({ where: { userId: admin.id } })
  await prisma.user.delete({ where: { id: admin.id } })
  await prisma.$disconnect()
})

describe('Invio delle richieste ai fornitori', () => {
  test('il messaggio si compone con le intestazioni giuste e il corpo in base64', () => {
    const mime = componiMime(
      { a: 'fornitore@example.invalid', oggetto: 'Riassortimento tessuto', testo: 'Buongiorno,\nservono 20 metri.' },
      'heemia.lab@gmail.com',
    )
    assert.match(mime, /^From: heemia\.lab@gmail\.com\r\n/)
    assert.match(mime, /\r\nTo: fornitore@example\.invalid\r\n/)
    assert.match(mime, /\r\nSubject: Riassortimento tessuto\r\n/)
    assert.match(mime, /Content-Transfer-Encoding: base64/)
    const corpo = mime.split('\r\n\r\n')[1]
    assert.equal(Buffer.from(corpo, 'base64').toString('utf8'), 'Buongiorno,\nservono 20 metri.')
  })

  test("un oggetto con accenti viaggia codificato, non a pezzi", () => {
    const mime = componiMime(
      { a: 'x@example.invalid', oggetto: 'Richiesta — tessuto Perù, qualità A', testo: 'ciao' },
      'heemia.lab@gmail.com',
    )
    const riga = mime.split('\r\n').find((r) => r.startsWith('Subject: '))!
    assert.match(riga, /^Subject: =\?UTF-8\?B\?/)
    const codificato = riga.replace('Subject: =?UTF-8?B?', '').replace('?=', '')
    assert.equal(Buffer.from(codificato, 'base64').toString('utf8'), 'Richiesta — tessuto Perù, qualità A')
  })

  test('un a capo nell\'oggetto non può aggiungere intestazioni al messaggio', () => {
    const mime = componiMime(
      {
        a: 'x@example.invalid',
        oggetto: 'Normale\r\nBcc: destinatario-nascosto@example.invalid',
        testo: 'ciao',
      },
      'heemia.lab@gmail.com',
    )
    assert.equal(mime.includes('\r\nBcc:'), false, 'intestazione iniettata dall\'oggetto')
    // Prima della riga vuota che separa il corpo stanno solo le intestazioni previste.
    const intestazioni = mime.split('\r\n\r\n')[0].split('\r\n').map((r) => r.split(':')[0])
    assert.deepEqual(
      intestazioni,
      ['From', 'To', 'Subject', 'MIME-Version', 'Content-Type', 'Content-Transfer-Encoding'],
    )
  })

  test('gli indirizzi palesemente non validi vengono riconosciuti', () => {
    assert.equal(indirizzoValido('mario@fornitore.it'), true)
    assert.equal(indirizzoValido('Mario Rossi'), false)
    assert.equal(indirizzoValido('mario@fornitore'), false)
    assert.equal(indirizzoValido(''), false)
    assert.equal(indirizzoValido(null), false)
  })

  test('una richiesta non approvata non parte, e lo dice prima di provarci', async () => {
    const id = await nuovaRichiesta(supplierConEmail)
    await assert.rejects(
      () => sendSupplierRequest(id, admin.id),
      (e: Error) => /solo dopo l'approvazione/.test(e.message),
    )
    const dopo = await prisma.supplierRequest.findUniqueOrThrow({ where: { id } })
    assert.equal(dopo.stato, 'bozza_generata')
    assert.equal(dopo.inviataIl, null)
  })

  test('un fornitore senza indirizzo email blocca l\'invio con il suo nome nel messaggio', async () => {
    const id = await nuovaRichiesta(supplierSenzaEmail)
    await setSupplierRequestStatus(id, 'approvata', admin.id)
    await assert.rejects(
      () => sendSupplierRequest(id, admin.id),
      (e: Error) => /non ha un indirizzo email valido/.test(e.message) && /Senza Posta/.test(e.message),
    )
    assert.equal((await prisma.supplierRequest.findUniqueOrThrow({ where: { id } })).stato, 'approvata')
  })

  test('senza credenziali Google la richiesta si ferma ed elenca cosa manca', async () => {
    const id = await nuovaRichiesta(supplierConEmail)
    await setSupplierRequestStatus(id, 'approvata', admin.id)
    await assert.rejects(
      () => sendSupplierRequest(id, admin.id),
      (e: Error) =>
        /Gmail non ancora attiva/.test(e.message) &&
        /GOOGLE_REFRESH_TOKEN/.test(e.message) &&
        /Integrazioni_Setup/.test(e.message),
    )
    // Il punto: lo stato NON si muove. Prima di questa integrazione passava a "inviata".
    const dopo = await prisma.supplierRequest.findUniqueOrThrow({ where: { id } })
    assert.equal(dopo.stato, 'approvata')
    assert.equal(dopo.inviataIl, null)
  })

  test('una richiesta già inviata non viene spedita una seconda volta', async () => {
    const id = await nuovaRichiesta(supplierConEmail)
    await prisma.supplierRequest.update({ where: { id }, data: { stato: 'inviata', inviataIl: new Date() } })
    await assert.rejects(
      () => sendSupplierRequest(id, admin.id),
      (e: Error) => /già inviata/.test(e.message),
    )
  })
})
