// Il prezzo di un capo si calcola, non si digita (regola 2026-09-10).
//
// Le prove qui dentro guardano tre cose che devono restare vere insieme, perché è
// dall'accordo fra loro che la funzione ha senso:
//
//   1. il prezzo esce dai **costi della scheda tecnica**, righe strutturate comprese;
//   2. la base è il **solo costo del capo**: la quota di costi fissi resta calcolata ma non
//      entra nel prezzo (Giulia, 2026-09-10 — i prezzi non si possono alzare);
//   3. un capo che un prezzo ce l'ha già **non se lo vede riscrivere** da solo.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { computeProductMargin } from '../src/modules/margins/service.js'
import { prezzoConsigliato, applicaPrezziCalcolati } from '../src/modules/products/prezziAutomatici.js'
import { composizioneDelCapo } from '../src/modules/products/composizioneAutomatica.js'
import { _svuotaRegistro } from '../src/modules/auth/tentativiLogin.js'

const prisma = new PrismaClient()
const RUN = `TEST-PREZZI-${Date.now().toString(36).toUpperCase()}`
const password = 'Password-di-test-abbastanza-lunga-2026!'
const email = `${RUN.toLowerCase()}@test.local`

let app: Awaited<ReturnType<typeof buildApp>>
let adminId = ''
let teamId = ''
let cookieAdmin = ''
let cookieTeam = ''
/** Quota costi fissi per capo che le prove danno per nota. Vedi `before`. */
let quotaPerCapo = 0

async function login(indirizzo: string, ip: string): Promise<string> {
  const r = await app.inject({
    method: 'POST', url: '/api/v1/auth/login', remoteAddress: ip, payload: { email: indirizzo, password },
  })
  const raw = r.headers['set-cookie']
  return (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0] ?? ''
}

/** Un capo con una scheda tecnica valorizzata a righe: costo 47 € tondi. */
async function capoConScheda(suffisso: string, opzioni: { prezzoVendita?: number } = {}) {
  const p = await prisma.product.create({
    data: {
      nome: `${RUN} ${suffisso}`,
      codiceProdotto: `${RUN}-${suffisso}`,
      linea: 'tessile',
      stato: 'completato',
      prezzoVendita: opzioni.prezzoVendita ?? 0,
      prezzoNettoIva: opzioni.prezzoVendita ? opzioni.prezzoVendita / 1.22 : 0,
    },
    select: { id: true },
  })
  const scheda = await prisma.technicalSheet.create({
    data: { productId: p.id, versione: 'finale', statoScheda: 'bozza' },
    select: { id: true },
  })
  await prisma.sheetMaterialUsage.create({
    data: {
      technicalSheetId: scheda.id,
      descrizione: 'Tessuto',
      unitaMisura: 'm',
      // 2 m × 10 €/m + 10% di scarto = 22 €
      quantitaSuggerita: 2,
      percentualeScarto: 10,
      costoUnitario: 10,
    },
  })
  await prisma.sheetCostLine.create({
    data: { technicalSheetId: scheda.id, voce: 'confezione', label: 'Confezione', importo: 25, kind: 'diretto' },
  })
  return { productId: p.id, schedaId: scheda.id }
}

before(async () => {
  // La quota costi fissi deve essere un numero noto: altrimenti le prove dipendono da quante
  // voci di costo fisso ci sono nel database di sviluppo.
  await prisma.appSetting.upsert({
    where: { chiave: 'capi_prodotti_annui' },
    update: {},
    create: { chiave: 'capi_prodotti_annui', valore: '442' },
  })
  await prisma.appSetting.upsert({
    where: { chiave: 'soglia_margine_percent' },
    update: { valore: '35' },
    create: { chiave: 'soglia_margine_percent', valore: '35' },
  })
  const voci = await prisma.fixedCostItem.findMany({ select: { importoAnnuo: true } })
  const capiAnnui = 442
  quotaPerCapo = Math.round((voci.reduce((s, v) => s + Number(v.importoAnnuo), 0) / capiAnnui) * 100) / 100

  const hash = await bcrypt.hash(password, 4)
  const admin = await prisma.user.create({
    data: { nome: `${RUN} admin`, email, role: 'admin', passwordHash: hash },
  })
  adminId = admin.id
  const team = await prisma.user.create({
    data: { nome: `${RUN} team`, email: `team-${email}`, role: 'team', passwordHash: hash },
  })
  teamId = team.id

  app = await buildApp()
  await app.ready()
  _svuotaRegistro()
  cookieAdmin = await login(email, '127.0.7.1')
  cookieTeam = await login(`team-${email}`, '127.0.7.2')
})

after(async () => {
  await app.close()
  const dove = { product: { codiceProdotto: { startsWith: RUN } } }
  const schede = await prisma.technicalSheet.findMany({ where: dove, select: { id: true } })
  const ids = schede.map((s) => s.id)
  await prisma.sheetMaterialUsage.deleteMany({ where: { technicalSheetId: { in: ids } } })
  await prisma.sheetCostLine.deleteMany({ where: { technicalSheetId: { in: ids } } })
  await prisma.technicalSheet.deleteMany({ where: dove })
  await prisma.productionStep.deleteMany({ where: dove })
  await prisma.product.deleteMany({ where: { codiceProdotto: { startsWith: RUN } } })
  await prisma.activityLog.deleteMany({ where: { userId: { in: [adminId, teamId] } } })
  await prisma.session.deleteMany({ where: { userId: { in: [adminId, teamId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [adminId, teamId] } } })
  await prisma.$disconnect()
})

describe('Il prezzo nasce dai costi della scheda tecnica', () => {
  test('le righe strutturate della scheda diventano il costo del capo', async () => {
    const { productId } = await capoConScheda('RIGHE')
    const p = await prezzoConsigliato(productId)

    // 2 m × 10 € × 1,10 = 22 € di materiali, più 25 € di confezione = 47 € diretti.
    assert.equal(p.costo.costoDiretto, 47)
    assert.equal(p.costo.fonte, 'scheda_righe')
    assert.equal(p.costo.costoMateriali, 22)
    assert.equal(p.costo.costoLavorazioni, 25)
    // Il costo pieno si continua a calcolare — serve a Costi e margini — ma è un numero a
    // parte, non la base del prezzo: lo dice la prova qui sotto.
    assert.equal(p.costoPieno, Math.round((47 + quotaPerCapo) * 100) / 100)
  })

  test('⚠️ la base del prezzo è il costo del capo, NON il costo pieno', async () => {
    // Decisione di Giulia del 2026-09-10, presa sui numeri veri: con la quota fissi dentro,
    // un capo da 21 € di costo diretto uscirebbe a 205 € contro i 60 € di listino attuale, e
    // i prezzi non si possono alzare. Questa prova è ciò che impedisce alla quota di
    // rientrare nel conto per distrazione.
    const { productId } = await capoConScheda('BASE')
    const p = await prezzoConsigliato(productId)

    assert.equal(p.calcolato.prezzoNettoIva, Math.round((47 / 0.65) * 100) / 100)
    assert.ok(quotaPerCapo > 0, 'la prova ha senso solo se una quota fissi esiste davvero')
    assert.notEqual(
      p.calcolato.prezzoNettoIva,
      Math.round((p.costoPieno / 0.65) * 100) / 100,
      'la quota costi fissi non deve essere entrata nel prezzo',
    )
  })

  test('il prezzo lascia il margine chiesto, e non è un ricarico', async () => {
    const { productId } = await capoConScheda('MARGINE')
    const p = await prezzoConsigliato(productId)

    const atteso = Math.round((p.costo.costoDiretto / 0.65) * 100) / 100
    assert.equal(p.calcolato.prezzoNettoIva, atteso)
    assert.equal(p.calcolato.prezzoVendita, Math.round(atteso * 1.22 * 100) / 100)
    // Il ricarico darebbe costo × 1,35: se un giorno qualcuno lo riscrive così, qui si vede.
    assert.notEqual(p.calcolato.prezzoNettoIva, Math.round(p.costo.costoDiretto * 1.35 * 100) / 100)
  })

  test('lo showroom è il listino meno il dieci per cento', async () => {
    const { productId } = await capoConScheda('SHOWROOM')
    const p = await prezzoConsigliato(productId)
    assert.equal(p.calcolato.prezzoShowroom, Math.round(p.calcolato.prezzoVendita * 0.9 * 100) / 100)
  })

  test('senza costo non c’è prezzo: si dice, non si inventa', async () => {
    const p = await prisma.product.create({
      data: { nome: `${RUN} IGNOTO`, codiceProdotto: `${RUN}-IGNOTO`, linea: 'tessile' },
      select: { id: true },
    })
    const r = await prezzoConsigliato(p.id)
    assert.equal(r.calcolabile, false)
    assert.equal(r.calcolato.prezzoVendita, 0)
    assert.ok(r.motivo)
  })
})

describe('Il prezzo copre il capo; che copra anche la struttura lo dice Costi e margini', () => {
  test('un capo appena prezzato ha il 35% sul costo del capo, e la quota fissi resta scoperta', async () => {
    // Le due affermazioni convivono di proposito, ed è la parte da capire prima di toccare
    // queste formule. Il prezzo garantisce il margine **sul costo del capo**: è ciò che
    // Giulia ha chiesto, perché i prezzi non si possono alzare. Il modulo Costi e margini
    // continua a misurare il margine sul costo pieno, quota fissi compresa, e quindi
    // mostrerà un numero più basso. Non è una contraddizione da sanare: è l'informazione
    // vera — quanto della struttura quel prezzo copre — ed è il motivo per cui la quota
    // resta calcolata e visibile lì, e solo lì.
    const { productId } = await capoConScheda('SOGLIA')
    const applicato = await applicaPrezziCalcolati(productId, adminId)
    assert.equal(applicato.applicato, true)

    const margine = (await computeProductMargin(productId))!
    assert.equal(margine.costoNoto, true)
    assert.equal(margine.fonteCosto, 'scheda')

    // Sul costo del capo il margine è quello chiesto: `margineLordo` = netto − costo diretto.
    const sulCapo = (margine.margineLordo / margine.prezzoNettoIva) * 100
    assert.ok(Math.abs(sulCapo - 35) < 0.05, `margine sul costo del capo ${sulCapo.toFixed(2)}%, atteso 35%`)

    // Sul costo pieno è più basso, esattamente della quota fissi che il prezzo non copre.
    assert.ok(quotaPerCapo > 0, 'la prova ha senso solo se una quota fissi esiste davvero')
    assert.ok(
      margine.marginePercentuale < sulCapo,
      'con la quota fissi dentro il margine deve risultare più basso, non uguale',
    )
    assert.equal(margine.costoIndirettoAllocato, quotaPerCapo)
  })

  test('il modulo margini vede il costo delle righe strutturate, non solo i campi piatti', async () => {
    const { productId } = await capoConScheda('MARGINI-RIGHE')
    const margine = (await computeProductMargin(productId))!
    assert.equal(margine.costoDiretto, 47)
    assert.equal(margine.fonteCosto, 'scheda')
  })
})

describe('Quello che c’è già non si riscrive da solo', () => {
  test('un capo con un prezzo suo resta com’è quando l’applicazione è automatica', async () => {
    const { productId } = await capoConScheda('GIA-PREZZATO', { prezzoVendita: 199 })
    const esito = await applicaPrezziCalcolati(productId, adminId, { soloSeMancante: true })

    assert.equal(esito.applicato, false)
    const dopo = await prisma.product.findUnique({ where: { id: productId }, select: { prezzoVendita: true } })
    assert.equal(Number(dopo!.prezzoVendita), 199)
    // Il prezzo calcolato però si vede: è la differenza fra «non tocco» e «non dico».
    assert.equal(esito.daAllineare, true)
    assert.ok(esito.calcolato.prezzoVendita > 0)
  })

  test('lo stesso capo si allinea quando qualcuno lo chiede esplicitamente', async () => {
    const { productId } = await capoConScheda('ALLINEA', { prezzoVendita: 199 })
    const esito = await applicaPrezziCalcolati(productId, adminId)

    assert.equal(esito.applicato, true)
    const dopo = await prisma.product.findUnique({
      where: { id: productId },
      select: { prezzoVendita: true, prezzoShowroom: true, prezzoConsigliato: true },
    })
    assert.equal(Number(dopo!.prezzoVendita), esito.calcolato.prezzoVendita)
    assert.equal(Number(dopo!.prezzoShowroom), esito.calcolato.prezzoShowroom)
    // Da quando il prezzo si calcola, il «consigliato» è il listino: non un secondo numero.
    assert.equal(Number(dopo!.prezzoConsigliato), esito.calcolato.prezzoVendita)
  })

  test('applicare due volte non cambia niente la seconda', async () => {
    const { productId } = await capoConScheda('IDEMPOTENTE')
    assert.equal((await applicaPrezziCalcolati(productId, adminId)).applicato, true)
    assert.equal((await applicaPrezziCalcolati(productId, adminId)).applicato, false)
  })
})

describe('Chi può calcolare e pubblicare', () => {
  test('il prezzo calcolato si legge dall’API dei prodotti', async () => {
    const { productId } = await capoConScheda('API')
    const r = await app.inject({
      method: 'GET', url: `/api/v1/products/${productId}/prezzo-consigliato`, headers: { cookie: cookieAdmin },
    })
    assert.equal(r.statusCode, 200)
    const body = r.json()
    assert.equal(body.calcolabile, true)
    assert.ok(body.calcolato.prezzoVendita > 0)
  })

  test('⚠️ il team interno può applicare il prezzo e pubblicare, pur non avendo il modulo Shopify', async () => {
    // È la decisione di Giulia del 2026-09-10: pubblicare un capo è un gesto dell'anagrafica
    // prodotti, non un privilegio di chi amministra il negozio. Le rotte stanno perciò sotto
    // il modulo `prodotti`. Questa prova è la ragione per cui non vanno spostate sotto
    // `shopify`: lì il team riceverebbe 403.
    const { productId } = await capoConScheda('TEAM')

    const soloShopify = await app.inject({
      method: 'GET', url: '/api/v1/shopify/status', headers: { cookie: cookieTeam },
    })
    assert.equal(soloShopify.statusCode, 403, 'il team non ha il modulo Shopify')

    const prezzo = await app.inject({
      method: 'POST', url: `/api/v1/products/${productId}/prezzo/applica`, headers: { cookie: cookieTeam }, payload: {},
    })
    assert.equal(prezzo.statusCode, 200)

    // Senza credenziali Shopify configurate la pubblicazione si ferma sull'integrazione
    // (409), non sui permessi (403): il permesso è passato, che è quello che qui si prova.
    const pubblica = await app.inject({
      method: 'POST', url: `/api/v1/products/${productId}/shopify/pubblica`, headers: { cookie: cookieTeam }, payload: {},
    })
    assert.notEqual(pubblica.statusCode, 403, 'la pubblicazione non deve dipendere dal modulo Shopify')
  })
})

describe('La composizione si ricava dai tessuti', () => {
  test('dal tessuto dichiarato, quando la tabella lo conosce', async () => {
    const p = await prisma.product.create({
      data: { nome: `${RUN} TESSUTO`, codiceProdotto: `${RUN}-TESSUTO`, linea: 'tessile', tessuto: 'piquè' },
      select: { id: true },
    })
    const c = await composizioneDelCapo(p.id)
    assert.equal(c.fonte, 'tabella_tessuti')
    assert.equal(c.composizione, '80% Cotone / 10% Poliestere / 10% Elastan')
    assert.equal(c.daConfermare, false)
  })

  test('un capo senza tessuti non riceve una composizione inventata', async () => {
    const p = await prisma.product.create({
      data: { nome: `${RUN} SENZA`, codiceProdotto: `${RUN}-SENZA`, linea: 'tessile' },
      select: { id: true },
    })
    const c = await composizioneDelCapo(p.id)
    assert.equal(c.fonte, 'nessuna')
    assert.equal(c.composizione, '')
  })
})
