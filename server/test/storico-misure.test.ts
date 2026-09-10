// Guardrail puro dei valori suggeriti dall'AI (DEC-069): nessun database e nessuna
// chiamata OpenAI. Queste prove impediscono soprattutto di mescolare taglie diverse.
import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  chiaveMisura,
  filtraValoriInventati,
  riassumiStorico,
  testoStorico,
  type RigaStorica,
} from '../src/modules/ai/storico-misure.js'

const righe: RigaStorica[] = [
  { nome: 'Giro torace', unita: 'cm', taglia: 'S', valore: 48, capo: 'Como' },
  { nome: 'Giro  Tòrace:', unita: 'CM', taglia: 's', valore: 50, capo: 'Lecco' },
  { nome: 'Giro torace', unita: 'cm', taglia: 'L', valore: 56, capo: 'Milano' },
  { nome: 'Giro torace', unita: 'mm', taglia: 'S', valore: 490, capo: 'Bergamo' },
  { nome: 'Lunghezza totale', unita: 'cm', taglia: null, valore: 92, capo: 'Como' },
]

describe('Storico delle misure per categoria', () => {
  test('normalizza accenti, maiuscole, spazi e punteggiatura', () => {
    assert.equal(chiaveMisura('  Giro  Tòrace:  '), 'giro torace')
  })

  test('non mescola taglie o unità diverse nella stessa media', () => {
    const gruppi = riassumiStorico(righe)
    const toraceCm = gruppi.filter((g) => g.chiave === 'giro torace' && g.unita === 'cm')

    assert.equal(toraceCm.length, 2)
    assert.deepEqual(
      toraceCm.map((g) => ({ taglia: g.taglia?.toUpperCase(), media: g.media, rilevazioni: g.rilevazioni })),
      [
        { taglia: 'S', media: 49, rilevazioni: 2 },
        { taglia: 'L', media: 56, rilevazioni: 1 },
      ],
    )
    assert.equal(gruppi.some((g) => g.chiave === 'giro torace' && g.unita === 'mm'), true)
  })

  test('accetta un valore sostenuto dalla stessa misura, unità e taglia', () => {
    const [misura] = filtraValoriInventati(
      [{ nome: 'Giro torace', unita: 'cm', valore: 49, tagliaRiferimento: 'S', tolleranza: '±0,5 cm', nota: null }],
      riassumiStorico(righe),
    )

    assert.equal(misura.valore, 49)
    assert.equal(misura.tagliaRiferimento?.toUpperCase(), 'S')
    assert.equal(misura.fonteValore, 'storico')
  })

  test('rifiuta un numero della taglia sbagliata anche se esiste su un’altra taglia', () => {
    const [misura] = filtraValoriInventati(
      [{ nome: 'Giro torace', unita: 'cm', valore: 56, tagliaRiferimento: 'S', tolleranza: null, nota: null }],
      riassumiStorico(righe),
    )

    assert.equal(misura.valore, null)
    assert.equal(misura.tagliaRiferimento, null)
    assert.equal(misura.fonteValore, null)
  })

  test('senza taglia dichiarata riconosce il gruppo compatibile col valore', () => {
    const [misura] = filtraValoriInventati(
      [{ nome: 'Giro torace', unita: 'cm', valore: 56, tagliaRiferimento: null, tolleranza: null, nota: null }],
      riassumiStorico(righe),
    )

    assert.equal(misura.valore, 56)
    assert.equal(misura.tagliaRiferimento, 'L')
  })

  test('una taglia estranea non viene sostituita silenziosamente con una nota', () => {
    const [misura] = filtraValoriInventati(
      [{ nome: 'Giro torace', unita: 'cm', valore: 56, tagliaRiferimento: 'XL', tolleranza: null, nota: null }],
      riassumiStorico(righe),
    )

    assert.equal(misura.valore, null)
    assert.equal(misura.tagliaRiferimento, null)
  })

  test('misure assenti dallo storico restano vuote e i duplicati non entrano due volte', () => {
    const misure = filtraValoriInventati(
      [
        { nome: 'Girovita', unita: 'cm', valore: 70, tagliaRiferimento: 'S', tolleranza: null, nota: ' da rilevare ' },
        { nome: ' girovita ', unita: 'cm', valore: 71, tagliaRiferimento: 'S', tolleranza: null, nota: null },
      ],
      riassumiStorico(righe),
    )

    assert.equal(misure.length, 1)
    assert.equal(misure[0].valore, null)
    assert.equal(misure[0].nota, 'da rilevare')
  })

  test('dice esplicitamente al modello quando lo storico è vuoto', () => {
    assert.match(testoStorico([], 'Cappotti'), /nessuna/i)
    assert.match(testoStorico([], 'Cappotti'), /ogni valore a null/i)
  })
})
