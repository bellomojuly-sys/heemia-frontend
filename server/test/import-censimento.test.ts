// Import del censimento — Fase 21.
//
// La proprietà che conta è l'**idempotenza**: rilanciare non deve duplicare niente. È anche
// il criterio di uscita scritto in Data_Migration («provato due volte senza duplicati»),
// quindi qui l'import viene eseguito davvero due volte e si confrontano i conteggi.
//
// Gira contro il Postgres di sviluppo vero, con dati propri sotto un prefisso unico.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { importaCensimento, type Censimento } from '../src/modules/migration/importCensimento.js'
import { tessutoConosciuto } from '../src/core/tessuti.js'

const prisma = new PrismaClient()
const RUN = `TEST-IMP-${Date.now().toString(36).toUpperCase()}`
let userId = ''

const prodotto = (n: string, extra: Partial<Record<string, string>> = {}) => ({
  codice_prodotto: `${RUN}-${n}`,
  nome: `${RUN} ${n}`,
  categoria: 'maglieria',
  tessuto: 'cotone',
  taglie_disponibili: 'S;M;L',
  colori_disponibili: 'Nero;Crema',
  prezzo_vendita: '122',
  prezzo_showroom: '122',
  su_shopify: 'false',
  descrizione_breve: 'Maglia in cotone',
  descrizione_tecnica: 'Lavorazione a costina',
  costo_diretto: '40',
  vestibilita: 'Regular',
  stock_totale: '7',
  ...extra,
})

const variante = (capo: string, sku: string, stock: string) => ({
  sku: `${RUN}-${sku}`,
  codice_prodotto: `${RUN}-${capo}`,
  taglia: 'M',
  colore: 'Nero',
  stock_disponibile: stock,
})

function censimento(over: Partial<Censimento> = {}): Censimento {
  return {
    prodotti: [prodotto('A'), prodotto('B'), prodotto('ESCLUSO', { costo_diretto: '', stock_totale: '0' })],
    varianti: [variante('A', 'A-M-NER', '4'), variante('A', 'A-L-NER', '3'), variante('B', 'B-M-NER', '5')],
    fornitori: [
      { nome: `${RUN} Tessitura`, categoria: 'Tessuti', piva: '01234567890', citta: 'Carpi (MO)', telefono: '', email: 't@test.local' },
      // Categoria col valore vero della tabella: deve essere tradotta nel nome del client.
      { nome: `${RUN} Bottonificio`, categoria: 'Asole/Bottoni', piva: '', citta: '', telefono: '', email: '' },
    ],
    esclusiDallInventario: [`${RUN} ESCLUSO`],
    faseIniziale: 'in_vendita',
    ...over,
  }
}

async function conteggi() {
  const [prodotti, varianti, giacenze, fornitori] = await Promise.all([
    prisma.product.count({ where: { codiceProdotto: { startsWith: RUN } } }),
    prisma.productVariant.count({ where: { sku: { startsWith: RUN } } }),
    prisma.inventoryRecord.count({ where: { variant: { sku: { startsWith: RUN } } } }),
    prisma.supplier.count({ where: { nome: { startsWith: RUN } } }),
  ])
  return { prodotti, varianti, giacenze, fornitori }
}

before(async () => {
  const u = await prisma.user.create({
    data: { nome: `${RUN} admin`, email: `${RUN.toLowerCase()}@test.local`, role: 'admin', passwordHash: 'non-usato' },
  })
  userId = u.id
})

after(async () => {
  const varianti = await prisma.productVariant.findMany({ where: { sku: { startsWith: RUN } }, select: { id: true } })
  const ids = varianti.map((v) => v.id)
  await prisma.inventoryRecord.deleteMany({ where: { variantId: { in: ids } } })
  await prisma.productVariant.deleteMany({ where: { id: { in: ids } } })
  await prisma.productionStep.deleteMany({ where: { product: { codiceProdotto: { startsWith: RUN } } } })
  await prisma.product.deleteMany({ where: { codiceProdotto: { startsWith: RUN } } })
  await prisma.supplier.deleteMany({ where: { nome: { startsWith: RUN } } })
  await prisma.activityLog.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('Import del censimento', () => {
  test('la simulazione non lascia una sola riga a database', async () => {
    const esito = await importaCensimento(censimento(), userId, { simulazione: true })
    assert.equal(esito.simulazione, true)
    assert.equal(esito.prodotti.creati, 3, 'i numeri sono quelli veri, non zero')
    assert.equal(esito.varianti.create, 3)
    assert.deepEqual(await conteggi(), { prodotti: 0, varianti: 0, giacenze: 0, fornitori: 0 })
  })

  test('il primo import crea tutto, e lo stock entra in laboratorio', async () => {
    const esito = await importaCensimento(censimento(), userId)
    assert.equal(esito.prodotti.creati, 3)
    assert.equal(esito.varianti.create, 3)
    assert.equal(esito.fornitori.creati, 2)
    assert.equal(esito.giacenze.pezzi, 12)

    const record = await prisma.inventoryRecord.findFirstOrThrow({
      where: { variant: { sku: `${RUN}-A-M-NER` } },
    })
    // Regola 2 di Data_Migration: tutto in laboratorio, magazzino a zero, distribuzione
    // NON confermata — sono le persone a dire dove stanno davvero i pezzi.
    assert.equal(record.qtaLaboratorio, 4)
    assert.equal(record.qtaMagazzino, 0)
    assert.equal(record.totaleMigrazione, 4)
    assert.equal(record.migrazioneCompletata, false)
  })

  test('i capi entrano nella fase decisa, non nella prima della pipeline', async () => {
    const capo = await prisma.product.findUniqueOrThrow({ where: { codiceProdotto: `${RUN}-A` } })
    assert.equal(capo.stato, 'in_vendita')
    // Il prezzo netto IVA si calcola: 122 / 1,22 = 100.
    assert.equal(Number(capo.prezzoNettoIva), 100)
    assert.deepEqual(capo.taglieDisponibili, ['S', 'M', 'L'])
  })

  test('un capo escluso entra in catalogo ma senza giacenze', async () => {
    const escluso = await prisma.product.findUniqueOrThrow({ where: { codiceProdotto: `${RUN}-ESCLUSO` } })
    assert.ok(escluso.id)
    assert.equal(await prisma.productVariant.count({ where: { productId: escluso.id } }), 0)
  })

  test('rilanciarlo NON duplica niente: aggiorna e basta', async () => {
    const prima = await conteggi()
    const esito = await importaCensimento(censimento(), userId)
    assert.equal(esito.prodotti.creati, 0, 'nessun capo nuovo')
    assert.equal(esito.prodotti.aggiornati, 3)
    assert.equal(esito.varianti.create, 0, 'nessuna variante nuova')
    assert.equal(esito.varianti.aggiornate, 3)
    assert.equal(esito.fornitori.creati, 0, 'nessun fornitore doppio')
    assert.deepEqual(await conteggi(), prima, 'i conteggi non si muovono')
  })

  test('una distribuzione già confermata da una persona non viene sovrascritta', async () => {
    const variante = await prisma.productVariant.findUniqueOrThrow({ where: { sku: `${RUN}-B-M-NER` } })
    // Qualcuno ha sistemato le ubicazioni dall'app e ha confermato.
    await prisma.inventoryRecord.update({
      where: { variantId: variante.id },
      data: { qtaMagazzino: 3, qtaLaboratorio: 2, migrazioneCompletata: true },
    })

    const esito = await importaCensimento(censimento(), userId)
    assert.ok(
      esito.saltate.some((s) => s.riga.includes('B-M-NER') && /confermata/.test(s.motivo)),
      'la riga saltata deve essere dichiarata, non sparire',
    )
    const dopo = await prisma.inventoryRecord.findUniqueOrThrow({ where: { variantId: variante.id } })
    assert.equal(dopo.qtaMagazzino, 3, 'il numero verificato da una persona resta')
    assert.equal(dopo.qtaLaboratorio, 2)
  })

  test('una variante senza il suo capo ferma tutto prima di scrivere', async () => {
    const prima = await conteggi()
    await assert.rejects(
      () => importaCensimento(
        censimento({ varianti: [{ sku: `${RUN}-ORFANA`, codice_prodotto: `${RUN}-NON-ESISTE`, taglia: 'M', colore: 'Nero', stock_disponibile: '1' }] }),
        userId,
      ),
      /non è nel censimento/,
    )
    assert.deepEqual(await conteggi(), prima)
  })

  test('le descrizioni di Notion arrivano sul capo, gia\' approvate', async () => {
    const capo = await prisma.product.findUniqueOrThrow({ where: { codiceProdotto: `${RUN}-A` } })
    assert.equal(capo.descrizioneBreve, 'Maglia in cotone')
    assert.equal(capo.descrizioneTecnica, 'Lavorazione a costina')
    // I testi del censimento sono gia' stati controllati dall'azienda (DEC-064): entrano
    // approvati, non come bozza da rileggere 93 volte.
    assert.equal(capo.descrizioneBreveStato, 'approvata')
  })

  test('il tessuto compila composizione e consigli di cura anche in import', async () => {
    const capo = await prisma.product.findUniqueOrThrow({ where: { codiceProdotto: `${RUN}-A` } })
    assert.equal(capo.tessuto, 'cotone')
    assert.equal(capo.composizione, '100% Cotone (maglieria)')
    assert.match(capo.consigliCura ?? '', /ciclo delicato e detergente neutro/)
    assert.equal(capo.consigliCuraStato, 'approvata')
  })

  test('una descrizione vuota nel censimento NON cancella quella già a database', async () => {
    await prisma.product.update({
      where: { codiceProdotto: `${RUN}-B` },
      data: { descrizioneBreve: 'Scritta a mano dall\'app' },
    })
    await importaCensimento(
      censimento({ prodotti: [prodotto('B', { descrizione_breve: '', descrizione_tecnica: '' })], varianti: [] }),
      userId,
    )
    const capo = await prisma.product.findUniqueOrThrow({ where: { codiceProdotto: `${RUN}-B` } })
    assert.equal(capo.descrizioneBreve, 'Scritta a mano dall\'app', 'il vuoto significa «non lo so», non «cancella»')
  })

  test('una descrizione diversa viene riscritta, ma il conteggio lo dichiara', async () => {
    await prisma.product.update({
      where: { codiceProdotto: `${RUN}-A` },
      data: { descrizioneBreve: 'Testo vecchio' },
    })
    const esito = await importaCensimento(
      censimento({ prodotti: [prodotto('A')], varianti: [] }),
      userId,
    )
    assert.equal(esito.descrizioni.riscritte, 1, 'la sostituzione non deve passare in silenzio')
    const capo = await prisma.product.findUniqueOrThrow({ where: { codiceProdotto: `${RUN}-A` } })
    assert.equal(capo.descrizioneBreve, 'Maglia in cotone')
  })

  test('una categoria fornitore sconosciuta ferma l\'import invece di indovinare', async () => {
    const prima = await conteggi()
    await assert.rejects(
      () => importaCensimento(
        censimento({
          prodotti: [prodotto('NUOVO-DOPO-ERRORE')],
          varianti: [],
          fornitori: [{ nome: `${RUN} Ignoto`, categoria: 'Categoria inventata', piva: '', citta: '', telefono: '', email: '' }],
        }),
        userId,
      ),
      /Categoria fornitore non riconosciuta/,
    )
    // O tutto o niente: il capo che veniva dopo il fornitore rotto non deve essere entrato.
    assert.deepEqual(await conteggi(), prima)
    assert.equal(await prisma.product.count({ where: { codiceProdotto: `${RUN}-NUOVO-DOPO-ERRORE` } }), 0)
  })
})
