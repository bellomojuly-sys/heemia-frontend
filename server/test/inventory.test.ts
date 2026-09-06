// Verifiche delle giacenze interne (magazzino ↔ laboratorio ↔ capi in produzione, DEC-047).
//
// Come le prove delle bolle, girano contro il Postgres di sviluppo vero: l'oggetto della
// verifica è che le quantità si muovano davvero come devono, e un doppio finto non potrebbe
// dimostrarlo. Ogni esecuzione si crea i propri dati con un prefisso unico e li cancella
// alla fine.
//
//     cd server && npm test
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import {
  chiudiLavorazione, mandaInProduzione, transferStock,
} from '../src/modules/inventory/service.js'

const prisma = new PrismaClient()

const RUN = `TEST-INV-${Date.now().toString(36).toUpperCase()}`

let userId = ''
let productId = ''
const variantIds: string[] = []

/** Una variante nuova con la giacenza iniziale richiesta: nessun test dipende dagli altri. */
async function nuovaVariante(nome: string, magazzino: number, laboratorio: number) {
  const variant = await prisma.productVariant.create({
    data: {
      productId,
      sku: `${RUN}-${nome}`,
      taglia: 'M',
      colore: 'nero',
      stockDisponibile: magazzino + laboratorio,
    },
  })
  await prisma.inventoryRecord.create({
    data: { variantId: variant.id, qtaMagazzino: magazzino, qtaLaboratorio: laboratorio },
  })
  variantIds.push(variant.id)
  return variant.id
}

async function giacenza(variantId: string) {
  const r = await prisma.inventoryRecord.findUniqueOrThrow({ where: { variantId } })
  return { magazzino: r.qtaMagazzino, laboratorio: r.qtaLaboratorio }
}

before(async () => {
  const user = await prisma.user.create({
    data: { nome: `${RUN} Admin`, email: `${RUN.toLowerCase()}@test.local`, role: 'admin', passwordHash: 'non-usato' },
  })
  userId = user.id
  const product = await prisma.product.create({
    data: { nome: `${RUN} capo`, codiceProdotto: `${RUN}-P`, linea: 'tessile' },
  })
  productId = product.id
})

after(async () => {
  await prisma.inventoryMovement.deleteMany({ where: { variantId: { in: variantIds } } })
  await prisma.stockCommitment.deleteMany({ where: { variantId: { in: variantIds } } })
  await prisma.activityLog.deleteMany({ where: { userId } })
  await prisma.inventoryRecord.deleteMany({ where: { variantId: { in: variantIds } } })
  await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } })
  await prisma.productionStep.deleteMany({ where: { productId } })
  await prisma.product.deleteMany({ where: { id: productId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('Giacenze interne: laboratorio e capi in produzione', () => {
  test('mandare in produzione toglie i capi dal laboratorio, chiuderla ce li riporta', async () => {
    const variantId = await nuovaVariante('CICLO', 0, 10)
    const lavorazione = await mandaInProduzione(variantId, { quantita: 4 }, userId)
    assert.deepEqual(await giacenza(variantId), { magazzino: 0, laboratorio: 6 })

    await chiudiLavorazione(lavorazione.id, 'terminato', userId)
    assert.deepEqual(await giacenza(variantId), { magazzino: 0, laboratorio: 10 })
  })

  test('non si possono mandare in produzione più capi di quanti ce ne sono in laboratorio', async () => {
    const variantId = await nuovaVariante('TROPPI', 0, 3)
    await assert.rejects(
      () => mandaInProduzione(variantId, { quantita: 4 }, userId),
      /In laboratorio ci sono 3 pezzi/,
    )
    assert.deepEqual(await giacenza(variantId), { magazzino: 0, laboratorio: 3 })
  })

  // Regressione del 2026-08-12. La lavorazione veniva letta fuori dal lock e chiusa con un
  // `update` incondizionato: due richieste contemporanee — un doppio clic sul pulsante, o
  // due persone sulla stessa riga — passavano entrambe il controllo sullo stato e
  // accreditavano DUE VOLTE gli stessi capi. Con 10 in giacenza e 4 in lavorazione se ne
  // ritrovavano 14, e l'inventario non aveva più modo di accorgersene.
  test('due chiusure contemporanee: una passa, l\'altra viene respinta senza accreditare due volte', async () => {
    const variantId = await nuovaVariante('CORSA', 0, 10)
    const lavorazione = await mandaInProduzione(variantId, { quantita: 4 }, userId)
    assert.deepEqual(await giacenza(variantId), { magazzino: 0, laboratorio: 6 })

    const esiti = await Promise.allSettled([
      chiudiLavorazione(lavorazione.id, 'terminato', userId),
      chiudiLavorazione(lavorazione.id, 'terminato', userId),
    ])
    assert.equal(esiti.filter((e) => e.status === 'fulfilled').length, 1, 'una sola chiusura deve riuscire')
    assert.equal(esiti.filter((e) => e.status === 'rejected').length, 1, 'la seconda deve essere respinta')

    assert.deepEqual(await giacenza(variantId), { magazzino: 0, laboratorio: 10 })
    // E i capi rientrano una volta sola anche nello storico dei movimenti.
    const carichi = await prisma.inventoryMovement.count({ where: { variantId, tipo: 'carico' } })
    assert.equal(carichi, 1)
  })

  test('una lavorazione già chiusa non si richiude', async () => {
    const variantId = await nuovaVariante('RICHIUSA', 0, 5)
    const lavorazione = await mandaInProduzione(variantId, { quantita: 2 }, userId)
    await chiudiLavorazione(lavorazione.id, 'terminato', userId)
    await assert.rejects(() => chiudiLavorazione(lavorazione.id, 'annullato', userId), /già terminato/)
    assert.deepEqual(await giacenza(variantId), { magazzino: 0, laboratorio: 5 })
  })

  test('il trasferimento sposta i capi senza cambiarne il totale, e non va sotto zero', async () => {
    const variantId = await nuovaVariante('TRASF', 8, 2)
    await transferStock(variantId, 'to_lab', 5, userId)
    assert.deepEqual(await giacenza(variantId), { magazzino: 3, laboratorio: 7 })

    await assert.rejects(
      () => transferStock(variantId, 'to_lab', 4, userId),
      /In magazzino ci sono 3 pezzi/,
    )
    assert.deepEqual(await giacenza(variantId), { magazzino: 3, laboratorio: 7 })
  })

  test('due trasferimenti contemporanei non fanno sparire né comparire capi', async () => {
    const variantId = await nuovaVariante('TRASF-CORSA', 5, 0)
    const esiti = await Promise.allSettled([
      transferStock(variantId, 'to_lab', 4, userId),
      transferStock(variantId, 'to_lab', 4, userId),
    ])
    assert.equal(esiti.filter((e) => e.status === 'fulfilled').length, 1)
    assert.deepEqual(await giacenza(variantId), { magazzino: 1, laboratorio: 4 })
  })
})
