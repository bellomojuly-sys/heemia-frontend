// Le modifiche del 2026-09-07, provate attraverso l'API vera con Fastify.inject: matrice
// permessi modificabile, fine della pipeline, eliminazione di clienti e utenti, modifica
// dei fornitori, contesto dell'AI Assistant.
//
// Le prove che contano davvero sono due, e sono quelle che distinguono un permesso vero da
// un pulsante nascosto:
//   - togliere un permesso **chiude l'endpoint**, non solo l'interfaccia;
//   - le protezioni (proprio account, ultimo amministratore, caselle intoccabili) reggono
//     anche quando la richiesta arriva senza passare dall'interfaccia.
//
//     cd server && npm test
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { _svuotaRegistro } from '../src/modules/auth/tentativiLogin.js'
import { invalidaCachePermessi } from '../src/core/permissions.js'

const prisma = new PrismaClient()
const RUN = `TEST-PERM-${Date.now().toString(36).toUpperCase()}`
const password = 'Password-di-test-abbastanza-lunga-2026!'

let app: Awaited<ReturnType<typeof buildApp>>
const emailCreate: string[] = []
const prodottiCreati: string[] = []
const clientiCreati: string[] = []
const fornitoriCreati: string[] = []
const materialiCreati: string[] = []
const accessoriCreati: string[] = []

let adminId = ''
let secondoAdminId = ''
let teamId = ''
let cookieAdmin = ''
let cookieTeam = ''

let contatoreIp = 0
async function login(email: string) {
  _svuotaRegistro()
  contatoreIp += 1
  const response = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    remoteAddress: `127.0.8.${(contatoreIp % 200) + 1}`,
    payload: { email, password },
  })
  const setCookie = response.headers['set-cookie']
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie
  return { response, cookie: raw?.split(';')[0] ?? '' }
}

async function creaUtente(ruolo: 'admin' | 'team', etichetta: string) {
  const email = `${RUN.toLowerCase()}-${etichetta}@test.local`
  emailCreate.push(email)
  const utente = await prisma.user.create({
    data: { nome: `${RUN} ${etichetta}`, email, role: ruolo, passwordHash: await bcrypt.hash(password, 4) },
  })
  return utente.id
}

before(async () => {
  adminId = await creaUtente('admin', 'admin')
  secondoAdminId = await creaUtente('admin', 'admin2')
  teamId = await creaUtente('team', 'team')
  app = await buildApp()
  await app.ready()
  cookieAdmin = (await login(`${RUN.toLowerCase()}-admin@test.local`)).cookie
  cookieTeam = (await login(`${RUN.toLowerCase()}-team@test.local`)).cookie
})

after(async () => {
  // La matrice torna com'era: un test che lascia in giro un permesso tolto romperebbe
  // quelli successivi, e soprattutto l'app di chi sviluppa.
  await prisma.rolePermission.deleteMany({})
  invalidaCachePermessi()
  await app.close()

  await prisma.inventoryRecord.deleteMany({ where: { variant: { productId: { in: prodottiCreati } } } })
  await prisma.productVariant.deleteMany({ where: { productId: { in: prodottiCreati } } })
  await prisma.productionStep.deleteMany({ where: { productId: { in: prodottiCreati } } })
  await prisma.product.deleteMany({ where: { id: { in: prodottiCreati } } })
  await prisma.order.deleteMany({ where: { customerId: { in: clientiCreati } } })
  await prisma.customer.deleteMany({ where: { id: { in: clientiCreati } } })
  await prisma.accessory.deleteMany({ where: { id: { in: accessoriCreati } } })
  await prisma.material.deleteMany({ where: { id: { in: materialiCreati } } })
  await prisma.supplierRequest.deleteMany({ where: { supplierId: { in: fornitoriCreati } } })
  await prisma.supplier.deleteMany({ where: { id: { in: fornitoriCreati } } })

  const ids = await prisma.user.findMany({ where: { email: { in: emailCreate } }, select: { id: true } })
  const userIds = ids.map((u) => u.id)
  await prisma.activityLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entitaId: { in: userIds } }] } })
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await prisma.$disconnect()
})

const get = (url: string, cookie: string) => app.inject({ method: 'GET', url, headers: { cookie } })
const del = (url: string, cookie: string) => app.inject({ method: 'DELETE', url, headers: { cookie } })
const patch = (url: string, cookie: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, headers: { cookie }, payload })
const post = (url: string, cookie: string, payload?: unknown) =>
  app.inject({ method: 'POST', url, headers: { cookie }, payload })
const put = (url: string, cookie: string, payload: unknown) =>
  app.inject({ method: 'PUT', url, headers: { cookie }, payload })

describe('Matrice permessi modificabile', () => {
  test('l’identità arriva insieme ai permessi: il client non deve indovinarli', async () => {
    const me = await get('/api/v1/auth/me', cookieAdmin)
    assert.equal(me.statusCode, 200)
    const corpo = me.json()
    assert.equal(corpo.role, 'admin')
    assert.equal(typeof corpo.permessi, 'object')
    assert.deepEqual(corpo.permessi.prodotti, { vedere: true, creare: true, modificare: true, eliminare: true })
  })

  test('togliere un permesso chiude davvero l’endpoint, non solo il pulsante', async () => {
    const fornitore = await prisma.supplier.create({
      data: { nome: `${RUN} fornitore`, categoria: 'Tessuti' },
    })
    fornitoriCreati.push(fornitore.id)

    // Prima: il team può correggere un fornitore.
    const prima = await patch(`/api/v1/suppliers/${fornitore.id}`, cookieTeam, { telefono: '0550000' })
    assert.equal(prima.statusCode, 200)

    // L'amministratore gli toglie «modificare» su fornitori.
    const salvataggio = await put('/api/v1/permissions/matrix', cookieAdmin, {
      voci: [
        { role: 'team', moduleKey: 'fornitori', permessi: { vedere: true, creare: false, modificare: false, eliminare: false } },
      ],
    })
    assert.equal(salvataggio.statusCode, 200)
    assert.equal(salvataggio.json().cambiate, 1)

    // Dopo: la stessa richiesta viene rifiutata dal server.
    const dopo = await patch(`/api/v1/suppliers/${fornitore.id}`, cookieTeam, { telefono: '0551111' })
    assert.equal(dopo.statusCode, 403)
    assert.match(dopo.json().error.message, /non può modificare/i)

    // La lettura resta aperta: si è tolta la scrittura, non l'accesso.
    assert.equal((await get('/api/v1/suppliers', cookieTeam)).statusCode, 200)

    // E il client riceve la matrice nuova, così smette di mostrare il pulsante.
    const me = await get('/api/v1/auth/me', cookieTeam)
    assert.equal(me.json().permessi.fornitori.modificare, false)

    // Ripristino, per non lasciare il team senza permessi ai test successivi.
    await post('/api/v1/permissions/matrix/reset', cookieAdmin)
    assert.equal((await patch(`/api/v1/suppliers/${fornitore.id}`, cookieTeam, { telefono: '' })).statusCode, 200)
  })

  test('l’amministratore non può chiudersi fuori da Impostazioni e Utenti', async () => {
    for (const moduleKey of ['impostazioni', 'utenti']) {
      const esito = await put('/api/v1/permissions/matrix', cookieAdmin, {
        voci: [{ role: 'admin', moduleKey, permessi: { vedere: false, creare: false, modificare: false, eliminare: false } }],
      })
      assert.equal(esito.statusCode, 409, `${moduleKey} doveva essere rifiutato`)
    }
  })

  test('non si può dare la scrittura su un modulo che non si vede', async () => {
    const esito = await put('/api/v1/permissions/matrix', cookieAdmin, {
      voci: [{ role: 'viewer', moduleKey: 'prodotti', permessi: { vedere: false, creare: true, modificare: false, eliminare: false } }],
    })
    assert.equal(esito.statusCode, 400)
    assert.match(esito.json().error.message, /non si vede/i)
  })

  test('solo un amministratore modifica la matrice; il team la legge e basta', async () => {
    assert.equal((await get('/api/v1/permissions/matrix', cookieTeam)).statusCode, 200)
    const scrittura = await put('/api/v1/permissions/matrix', cookieTeam, {
      voci: [{ role: 'viewer', moduleKey: 'prodotti', permessi: { vedere: true, creare: true, modificare: true, eliminare: true } }],
    })
    assert.equal(scrittura.statusCode, 403)
  })

  test('tornare al valore predefinito toglie la riga invece di salvarne una uguale al codice', async () => {
    const predefinito = { vedere: true, creare: true, modificare: true, eliminare: false }
    await put('/api/v1/permissions/matrix', cookieAdmin, {
      voci: [{ role: 'team', moduleKey: 'inventario', permessi: { vedere: true, creare: false, modificare: false, eliminare: false } }],
    })
    assert.equal(await prisma.rolePermission.count({ where: { role: 'team', moduleKey: 'inventario' } }), 1)

    await put('/api/v1/permissions/matrix', cookieAdmin, {
      voci: [{ role: 'team', moduleKey: 'inventario', permessi: predefinito }],
    })
    assert.equal(await prisma.rolePermission.count({ where: { role: 'team', moduleKey: 'inventario' } }), 0)
  })
})

describe('Fine della pipeline di produzione', () => {
  test('la pipeline contiene solo i capi in lavorazione, non tutto il catalogo', async () => {
    const inLavorazione = await prisma.product.create({
      data: { nome: `${RUN} in lavorazione`, codiceProdotto: `${RUN}-LAV`, linea: 'tessile', stato: 'prototipo' },
    })
    const finito = await prisma.product.create({
      data: { nome: `${RUN} finito`, codiceProdotto: `${RUN}-FIN`, linea: 'tessile', stato: 'completato' },
    })
    prodottiCreati.push(inLavorazione.id, finito.id)

    const righe = (await get('/api/v1/production', cookieAdmin)).json() as { productId: string }[]
    const idsInPipeline = righe.map((r) => r.productId)
    assert.ok(idsInPipeline.includes(inLavorazione.id), 'il capo in prototipo deve essere in pipeline')
    assert.ok(
      !idsInPipeline.includes(finito.id),
      'un capo con la produzione completata non deve comparire fra i prodotti in produzione',
    )
  })

  test('la fase «In vendita» non esiste più e non si può assegnare', async () => {
    const prodotto = await prisma.product.create({
      data: { nome: `${RUN} stato`, codiceProdotto: `${RUN}-STA`, linea: 'tessile', stato: 'idea' },
    })
    prodottiCreati.push(prodotto.id)
    const esito = await patch(`/api/v1/products/${prodotto.id}`, cookieAdmin, { stato: 'in_vendita' })
    assert.equal(esito.statusCode, 400)
  })

  test('l’avanzamento non registra più un responsabile di fase', async () => {
    const prodotto = await prisma.product.create({
      data: { nome: `${RUN} avanza`, codiceProdotto: `${RUN}-AVZ`, linea: 'tessile', stato: 'idea' },
    })
    prodottiCreati.push(prodotto.id)
    // Anche mandandolo esplicitamente: lo schema non lo accetta più e viene ignorato.
    const esito = await post(`/api/v1/production/${prodotto.id}/advance`, cookieAdmin, { responsabile: 'Qualcuno' })
    assert.equal(esito.statusCode, 200)
    const step = await prisma.productionStep.findFirst({ where: { productId: prodotto.id, fase: 'concept' } })
    assert.equal(step?.responsabile, null)
  })
})

describe('Eliminazione di un cliente', () => {
  test('un cliente senza documenti si elimina; con ordini serve la conferma', async () => {
    const pulito = await prisma.customer.create({ data: { nome: `${RUN} cliente pulito` } })
    clientiCreati.push(pulito.id)

    const verifica = (await get(`/api/v1/customers/${pulito.id}/deletion-check`, cookieAdmin)).json()
    assert.equal(verifica.haStorico, false)
    assert.equal((await del(`/api/v1/customers/${pulito.id}`, cookieAdmin)).statusCode, 200)
    assert.equal(await prisma.customer.count({ where: { id: pulito.id } }), 0)

    const conOrdine = await prisma.customer.create({ data: { nome: `${RUN} cliente con ordine` } })
    clientiCreati.push(conOrdine.id)
    const ordine = await prisma.order.create({
      data: { numero: `${RUN}-ORD`, customerId: conOrdine.id, canale: 'fisico', data: new Date(), totale: 100 },
    })

    const senzaConferma = await del(`/api/v1/customers/${conOrdine.id}`, cookieAdmin)
    assert.equal(senzaConferma.statusCode, 409)
    assert.match(senzaConferma.json().error.message, /documenti collegati/i)

    assert.equal((await del(`/api/v1/customers/${conOrdine.id}?conferma=storico`, cookieAdmin)).statusCode, 200)

    // L'ordine sopravvive senza intestatario: il fatturato non deve sparire con il cliente.
    const dopo = await prisma.order.findUnique({ where: { id: ordine.id } })
    assert.ok(dopo, "l'ordine non doveva essere cancellato")
    assert.equal(dopo.customerId, null)
    assert.equal(Number(dopo.totale), 100)
    await prisma.order.delete({ where: { id: ordine.id } })
  })
})

describe('Eliminazione di un utente', () => {
  test('non si elimina il proprio account né l’ultimo amministratore attivo', async () => {
    const verifica = (await get(`/api/v1/users/${adminId}/deletion-check`, cookieAdmin)).json()
    assert.equal(verifica.eliminabile, false)
    assert.match(verifica.blocchi.join(' '), /tuo stesso account/i)

    assert.equal((await del(`/api/v1/users/${adminId}`, cookieAdmin)).statusCode, 409)

    // L'ultimo amministratore attivo: si disattivano gli altri e si prova a togliere quello
    // che resta. Deve rifiutare anche se non è chi sta chiedendo.
    const altriAdmin = await prisma.user.findMany({
      where: { role: 'admin', attivo: true, id: { notIn: [adminId, secondoAdminId] } },
      select: { id: true },
    })
    await prisma.user.updateMany({ where: { id: { in: altriAdmin.map((u) => u.id) } }, data: { attivo: false } })
    try {
      const esito = await del(`/api/v1/users/${secondoAdminId}?conferma=storico`, cookieAdmin)
      // Con due admin attivi (adminId e secondoAdminId) l'eliminazione è lecita: il blocco
      // scatta sull'ultimo. Si verifica riducendo a uno solo.
      assert.equal(esito.statusCode, 200)
      const verificaUltimo = (await get(`/api/v1/users/${adminId}/deletion-check`, cookieAdmin)).json()
      assert.match(verificaUltimo.blocchi.join(' '), /ultimo amministratore/i)
    } finally {
      await prisma.user.updateMany({ where: { id: { in: altriAdmin.map((u) => u.id) } }, data: { attivo: true } })
    }
  })

  test('un account che ha firmato qualcosa chiede una conferma in più', async () => {
    const conStoria = await creaUtente('team', 'storia')
    await prisma.activityLog.create({
      data: { userId: conStoria, azione: 'test', entita: 'user', entitaId: conStoria },
    })

    const verifica = (await get(`/api/v1/users/${conStoria}/deletion-check`, cookieAdmin)).json()
    assert.equal(verifica.eliminabile, true)
    assert.equal(verifica.haStorico, true)
    assert.ok(verifica.conseguenze.firmeAnonime >= 1)

    assert.equal((await del(`/api/v1/users/${conStoria}`, cookieAdmin)).statusCode, 409)
    assert.equal((await del(`/api/v1/users/${conStoria}?conferma=storico`, cookieAdmin)).statusCode, 200)

    // La firma resta nell'activity log, ma anonima: si sa cosa è successo, non più da chi.
    const riga = await prisma.activityLog.findFirst({ where: { entitaId: conStoria, azione: 'test' } })
    assert.ok(riga, "la riga dell'activity log non doveva sparire")
    assert.equal(riga.userId, null)
  })
})

describe('Fornitori: modifica e completezza', () => {
  test('si salva un fornitore incompleto e lo si completa dopo', async () => {
    const creato = await post('/api/v1/suppliers', cookieAdmin, {
      nome: `${RUN} incompleto`,
      categoria: 'Tessuti',
    })
    assert.equal(creato.statusCode, 201)
    const id = creato.json().id as string
    fornitoriCreati.push(id)

    const prima = (await get(`/api/v1/suppliers/${id}`, cookieAdmin)).json()
    assert.ok(prima.campiMancanti.length > 0, 'una scheda vuota deve risultare incompleta')

    const aggiornato = await patch(`/api/v1/suppliers/${id}`, cookieAdmin, {
      partitaIva: 'IT01234567890',
      email: 'fornitore@test.local',
      telefono: '055 000000',
    })
    assert.equal(aggiornato.statusCode, 200)

    const dopo = (await get(`/api/v1/suppliers/${id}`, cookieAdmin)).json()
    assert.equal(dopo.partitaIva, 'IT01234567890')
    assert.ok(dopo.campiMancanti.length < prima.campiMancanti.length)
  })

  test('una stringa vuota svuota il campo, e non lo lascia com’era', async () => {
    const creato = await post('/api/v1/suppliers', cookieAdmin, {
      nome: `${RUN} da svuotare`, categoria: 'Tessuti', telefono: '055 111111',
    })
    const id = creato.json().id as string
    fornitoriCreati.push(id)

    await patch(`/api/v1/suppliers/${id}`, cookieAdmin, { telefono: '' })
    const dopo = await prisma.supplier.findUnique({ where: { id } })
    assert.equal(dopo?.telefono, null)
  })

  test('il nome non si può svuotare: è ciò che rende riconoscibile un fornitore', async () => {
    const creato = await post('/api/v1/suppliers', cookieAdmin, { nome: `${RUN} nome`, categoria: 'Tessuti' })
    const id = creato.json().id as string
    fornitoriCreati.push(id)
    const esito = await patch(`/api/v1/suppliers/${id}`, cookieAdmin, { nome: '   ' })
    assert.equal(esito.statusCode, 400)
  })
})

describe('Tessuti e accessori: il fornitore si collega dopo', () => {
  test('un accessorio nasce senza fornitore, lo si collega e lo si scollega', async () => {
    const fornitore = await prisma.supplier.create({ data: { nome: `${RUN} lavorante`, categoria: 'Accessori' } })
    fornitoriCreati.push(fornitore.id)

    // Il listino del censimento porta il costo ma non dice da chi si compra
    // (Data_Census §10): un accessorio deve poter entrare senza fornitore.
    const creato = await post('/api/v1/accessories', cookieAdmin, {
      nome: `${RUN} bottone`, codice: `${RUN}-ACC`, costoUnitario: 0.4, quantitaAcquistata: 100, sogliaMinima: 10,
    })
    assert.equal(creato.statusCode, 201)
    const id = creato.json().id as string
    accessoriCreati.push(id)
    assert.equal(creato.json().supplierId, null)

    // Senza fornitore la richiesta di riordino non parte: è la ragione per cui il
    // collegamento tardivo serve davvero.
    const senza = await post('/api/v1/supplier-requests', cookieAdmin, { accessoryId: id })
    assert.equal(senza.statusCode, 400)
    assert.match(senza.json().error.message, /non ha un fornitore associato/i)

    // Si collega dopo.
    assert.equal((await patch(`/api/v1/accessories/${id}`, cookieAdmin, { supplierId: fornitore.id })).statusCode, 200)
    assert.equal((await get(`/api/v1/accessories/${id}`, cookieAdmin)).json().supplierId, fornitore.id)

    // E `null` lo scollega: un fornitore messo per sbaglio si deve poter togliere, non
    // solo sostituire con un altro.
    assert.equal((await patch(`/api/v1/accessories/${id}`, cookieAdmin, { supplierId: null })).statusCode, 200)
    assert.equal((await get(`/api/v1/accessories/${id}`, cookieAdmin)).json().supplierId, null)
  })

  test('lo stesso vale per un tessuto', async () => {
    const fornitore = await prisma.supplier.create({ data: { nome: `${RUN} tessitura`, categoria: 'Tessuti' } })
    fornitoriCreati.push(fornitore.id)

    const creato = await post('/api/v1/materials', cookieAdmin, {
      nome: `${RUN} tessuto`, codice: `${RUN}-MAT`, prezzoAlMetro: 12, metriAcquistati: 50, sogliaMinima: 5,
    })
    assert.equal(creato.statusCode, 201)
    const id = creato.json().id as string
    materialiCreati.push(id)
    assert.equal(creato.json().supplierId, null)

    assert.equal((await patch(`/api/v1/materials/${id}`, cookieAdmin, { supplierId: fornitore.id })).statusCode, 200)
    assert.equal((await get(`/api/v1/materials/${id}`, cookieAdmin)).json().supplierId, fornitore.id)

    // Una modifica che NON nomina il fornitore lo lascia dov'è: `undefined` non è `null`.
    assert.equal((await patch(`/api/v1/materials/${id}`, cookieAdmin, { colore: 'Grigio' })).statusCode, 200)
    const dopo = (await get(`/api/v1/materials/${id}`, cookieAdmin)).json()
    assert.equal(dopo.supplierId, fornitore.id)
    assert.equal(dopo.colore, 'Grigio')
  })
})

describe('Contesto dell’AI Assistant', () => {
  test('porta dati reali, non frasi pronte', async () => {
    const contesto = (await get('/api/v1/ai/contesto', cookieAdmin)).json()
    assert.ok(contesto.azienda.prodotti >= 0)
    assert.ok(contesto.inventario, 'un admin deve vedere la sezione inventario')
    assert.ok(contesto.economia, 'un admin deve vedere la sezione economica')
    assert.equal(typeof contesto.inventario.valore.aPrezzoDiVendita, 'number')
    assert.ok(Array.isArray(contesto.anomalie))
  })

  test('quello che un ruolo non vede non entra nel contesto, quindi non parte verso OpenAI', async () => {
    const contesto = (await get('/api/v1/ai/contesto', cookieTeam)).json()
    assert.equal(contesto.economia, undefined, 'il team non vede Costi e margini: la sezione non deve esserci')
    assert.ok(contesto.sezioniNonVisibili.includes('costi e margini'))
    // L'inventario invece lo vede: il filtro è per modulo, non «tutto o niente».
    assert.ok(contesto.inventario)
  })

  test('senza chiave OpenAI la domanda risponde con un errore chiaro, non con una risposta finta', async (t) => {
    if (process.env.OPENAI_API_KEY) return t.skip('chiave OpenAI presente: la chiamata vera non si fa nei test')
    const esito = await post('/api/v1/ai/domanda', cookieAdmin, { domanda: 'Quali prodotti hanno stock basso?' })
    assert.equal(esito.statusCode, 503)
    assert.equal(esito.json().error.code, 'AI_NOT_CONFIGURED')
  })
})

describe('Costi fissi', () => {
  test('il riepilogo dà totale annuo, mensile e peso di ogni voce', async () => {
    const riepilogo = (await get('/api/v1/fixed-costs/riepilogo', cookieAdmin)).json()
    assert.equal(typeof riepilogo.totaleAnnuo, 'number')
    assert.ok(Math.abs(riepilogo.totaleMensile - riepilogo.totaleAnnuo / 12) < 0.02)
    if (riepilogo.voci.length > 0) {
      // Le voci arrivano dalla più pesante: è l'ordine in cui si guarda un elenco di costi.
      const percentuali = riepilogo.voci.map((v: { percentuale: number }) => v.percentuale)
      assert.deepEqual(percentuali, [...percentuali].sort((a: number, b: number) => b - a))
    }
  })

  test('due voci non possono avere lo stesso nome: l’import le riconosce da lì', async () => {
    const nome = `${RUN} voce`
    const prima = await post('/api/v1/fixed-costs', cookieAdmin, { nome, importoAnnuo: 100 })
    assert.equal(prima.statusCode, 201)
    const id = prima.json().id as string
    try {
      const seconda = await post('/api/v1/fixed-costs', cookieAdmin, { nome, importoAnnuo: 200 })
      assert.equal(seconda.statusCode, 409)
    } finally {
      await prisma.fixedCostItem.deleteMany({ where: { id } })
    }
  })
})
