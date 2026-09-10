// Prova il confine col database: lo storico deve leggere solo la stessa categoria,
// senza badare alle maiuscole, e ignorare le righe ancora prive di valore.
import test, { after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { leggiStoricoMisure } from '../src/modules/ai/service.js'

const prisma = new PrismaClient()
const RUN = `TEST-MISURE-${Date.now().toString(36).toUpperCase()}`
const prodottiCreati: string[] = []

async function creaCapo(categoria: string, suffisso: string, valore: number | null) {
  const prodotto = await prisma.product.create({
    data: {
      nome: `${RUN} ${suffisso}`,
      codiceProdotto: `${RUN}-${suffisso}`,
      linea: 'tessile',
      categoria,
    },
  })
  prodottiCreati.push(prodotto.id)
  await prisma.technicalSheet.create({
    data: {
      productId: prodotto.id,
      versione: 'finale',
      misure: {
        create: [{ nome: 'Giro torace', unita: 'cm', tagliaRiferimento: 'M', valore }],
      },
    },
  })
}

after(async () => {
  await prisma.technicalSheet.deleteMany({ where: { productId: { in: prodottiCreati } } })
  await prisma.product.deleteMany({ where: { id: { in: prodottiCreati } } })
  await prisma.$disconnect()
})

describe('Lettura dello storico misure da PostgreSQL', () => {
  test('filtra per categoria e usa soltanto valori realmente compilati', async () => {
    await creaCapo('Cappotti', 'A', 52)
    await creaCapo('CAPPOTTI', 'B', null)
    await creaCapo('Pantaloni', 'C', 80)

    const gruppi = await leggiStoricoMisure('  cappotti  ')

    assert.equal(gruppi.length, 1)
    assert.equal(gruppi[0].chiave, 'giro torace')
    assert.equal(gruppi[0].taglia, 'M')
    assert.equal(gruppi[0].media, 52)
    assert.deepEqual(gruppi[0].capi, [`${RUN} A`])
  })
})
