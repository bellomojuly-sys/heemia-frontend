// Da dove viene il costo diretto di un capo (DEC-066).
//
// La regola nasce da una frase di Giulia: «inserirò schede tecniche vecchie che non hanno
// costi, che andranno calcolati secondariamente». Una scheda con le cinque voci a zero somma
// a zero, e zero è un numero: senza queste prove, una modifica distratta rimetterebbe il
// gestionale nella condizione di dichiarare margine 100% su capi di cui non sa niente.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { computeProductMargin } from '../src/modules/margins/service.js'

const prisma = new PrismaClient()
const RUN = `TEST-COSTO-${Date.now().toString(36).toUpperCase()}`

/** Un capo con prezzo netto tondo, così i conti si leggono a occhio. */
async function capo(suffisso: string, costoDirettoRiferimento: number | null) {
  return prisma.product.create({
    data: {
      nome: `${RUN} ${suffisso}`,
      codiceProdotto: `${RUN}-${suffisso}`,
      linea: 'tessile',
      stato: 'completato',
      prezzoVendita: 122,
      prezzoNettoIva: 100,
      costoDirettoRiferimento,
    },
    select: { id: true },
  })
}

/** Una scheda tecnica come quelle che Giulia sta per caricare: senza costi. */
async function schedaSenzaCosti(productId: string) {
  await prisma.technicalSheet.create({
    data: { productId, versione: 'finale', statoScheda: 'bozza' },
  })
}

before(async () => {
  // La quota costi fissi deve essere un numero noto, altrimenti le prove dipendono da quante
  // voci di costo ci sono nel database di sviluppo.
  await prisma.appSetting.upsert({
    where: { chiave: 'capi_prodotti_annui' },
    update: {},
    create: { chiave: 'capi_prodotti_annui', valore: '442' },
  })
})

after(async () => {
  await prisma.technicalSheet.deleteMany({ where: { product: { codiceProdotto: { startsWith: RUN } } } })
  await prisma.product.deleteMany({ where: { codiceProdotto: { startsWith: RUN } } })
  await prisma.$disconnect()
})

describe('Costo diretto: quale fonte vince, e quando si ammette di non saperlo', () => {
  test('senza scheda e senza riferimento il costo NON è noto, e il margine non si calcola', async () => {
    const p = await capo('IGNOTO', null)
    const m = (await computeProductMargin(p.id))!

    assert.equal(m.costoNoto, false)
    assert.equal(m.fonteCosto, 'sconosciuto')
    // Questo è il punto di tutta la storia: prima il capo risultava con margine pari
    // all'intero prezzo. Ora il numero c'è ancora, ma `costoNoto` dice di non mostrarlo.
    assert.equal(m.costoDiretto, 0)
    assert.equal(
      m.sottoSoglia, false,
      'un capo di cui non sappiamo il costo non ha un problema di margine: ha un dato mancante',
    )
  })

  test('una scheda tecnica SENZA costi non conta come costo zero: vale il riferimento', async () => {
    const p = await capo('VECCHIA', 61)
    await schedaSenzaCosti(p.id)
    const m = (await computeProductMargin(p.id))!

    assert.equal(m.fonteCosto, 'censimento')
    assert.equal(m.costoNoto, true)
    assert.equal(m.costoDiretto, 61)
  })

  test('appena la scheda è valorizzata vince lei, senza che nessuno spenga il riferimento', async () => {
    const p = await capo('VALORIZZATA', 61)
    await schedaSenzaCosti(p.id)
    await prisma.technicalSheet.updateMany({
      where: { productId: p.id },
      data: { costoTessuto: 30, costoAccessori: 5, costoManodopera: 12 },
    })
    const m = (await computeProductMargin(p.id))!

    assert.equal(m.fonteCosto, 'scheda')
    assert.equal(m.costoDiretto, 47)
  })

  test('un riferimento a zero è un costo noto, e resta diverso da «non lo so»', async () => {
    // È la ragione per cui la colonna è nullable invece di avere default 0.
    const p = await capo('ZERO', 0)
    const m = (await computeProductMargin(p.id))!

    assert.equal(m.costoNoto, true)
    assert.equal(m.fonteCosto, 'censimento')
    assert.equal(m.costoDiretto, 0)
  })
})
