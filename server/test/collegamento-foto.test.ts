import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { collegaFoto } from '../src/modules/drive/collegamento.js'

const prisma = new PrismaClient()
const RUN = `TEST-FOTO-${Date.now().toString(36).toUpperCase()}`
let capoId = ''

const esistente = 'https://drive.google.com/file/d/esistente12345/view'
const fotoA = 'https://drive.google.com/file/d/foto-a-123456/view'
const fotoB = 'https://drive.google.com/file/d/foto-b-123456/view'
const fotoC = 'https://drive.google.com/file/d/foto-c-123456/view'

before(async () => {
  const capo = await prisma.product.create({
    data: {
      nome: `${RUN} Capo`,
      codiceProdotto: RUN,
      linea: 'tessile',
      immaginiUrl: [esistente],
    },
  })
  capoId = capo.id
})

after(async () => {
  if (capoId) {
    await prisma.activityLog.deleteMany({ where: { entita: 'product', entitaId: capoId } })
    await prisma.product.deleteMany({ where: { id: capoId } })
  }
  await prisma.$disconnect()
})

describe('salvataggio degli abbinamenti foto', () => {
  test('raggruppa lo stesso capo, conserva le foto esistenti e non duplica nulla', async () => {
    const esito = await collegaFoto(
      [
        { capoId, urls: [fotoA, fotoB] },
        { capoId, urls: [fotoB, fotoC] },
      ],
      null,
    )

    assert.deepEqual(esito, { capiAggiornati: 1, fotoCollegate: 3, capiNonTrovati: [] })
    const dopo = await prisma.product.findUniqueOrThrow({ where: { id: capoId } })
    assert.deepEqual(dopo.immaginiUrl, [esistente, fotoA, fotoB, fotoC])
    assert.equal(
      await prisma.activityLog.count({ where: { entita: 'product', entitaId: capoId } }),
      1,
      'un capo produce una sola riga di registro',
    )

    const secondoPassaggio = await collegaFoto([{ capoId, urls: [fotoA, fotoB, fotoC] }], null)
    assert.deepEqual(secondoPassaggio, { capiAggiornati: 0, fotoCollegate: 0, capiNonTrovati: [] })
    const invariato = await prisma.product.findUniqueOrThrow({ where: { id: capoId } })
    assert.deepEqual(invariato.immaginiUrl, [esistente, fotoA, fotoB, fotoC])
  })
})
