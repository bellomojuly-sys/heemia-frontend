// Le due formule che decidono cosa il cliente paga e cosa legge sull'etichetta.
//
// Sono prove senza database di proposito: qui non si controlla che una rotta risponda, si
// controlla che il **conto** sia quello giusto. Il margine e il ricarico si somigliano
// abbastanza da essere scambiati da chi rilegge il codice fra sei mesi, e la differenza fra
// i due è il conto economico dell'anno.
import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  IVA, SCONTO_SHOWROOM, calcolaPrezzi, conIva, prezzoDaMargine, prezzoShowroomDa, senzaIva,
} from '../src/core/prezzi.js'
import {
  componiComposizione, formattaComposizione, leggiFibre, normalizzaComposizione, stessaComposizione,
} from '../src/core/composizione.js'

describe('Prezzo: margine, non ricarico', () => {
  test('con 35% di margine un capo da 65 € di costo si vende a 100 € netti', () => {
    // 65 / (1 − 0,35) = 100. Il ricarico darebbe 65 × 1,35 = 87,75, che è la risposta
    // sbagliata: questa riga esiste per non farla tornare.
    assert.equal(prezzoDaMargine(65, 35), 100)
    assert.notEqual(prezzoDaMargine(65, 35), 87.75)
  })

  test('il margine che ne risulta è davvero quello chiesto', () => {
    for (const costo of [12.4, 47, 65, 133.33, 210.75]) {
      for (const margine of [20, 35, 50, 62.5]) {
        const prezzo = prezzoDaMargine(costo, margine)
        const ottenuto = ((prezzo - costo) / prezzo) * 100
        // Un centesimo di arrotondamento sul prezzo sposta il margine di pochissimo.
        assert.ok(
          Math.abs(ottenuto - margine) < 0.02,
          `costo ${costo} margine chiesto ${margine}% → ottenuto ${ottenuto.toFixed(3)}%`,
        )
      }
    }
  })

  test('margini impossibili non producono un prezzo inventato', () => {
    assert.equal(prezzoDaMargine(65, 100), 0, 'il 100% di margine vorrebbe un prezzo infinito')
    assert.equal(prezzoDaMargine(65, 0), 0)
    assert.equal(prezzoDaMargine(65, -10), 0)
    assert.equal(prezzoDaMargine(0, 35), 0, 'senza costo non c’è prezzo: si dice, non si inventa')
    assert.equal(prezzoDaMargine(Number.NaN, 35), 0)
  })

  test('IVA: andata e ritorno', () => {
    assert.equal(conIva(100), 122)
    assert.equal(senzaIva(122), 100)
    assert.equal(IVA, 0.22)
  })

  test('lo showroom è il listino meno il dieci per cento', () => {
    assert.equal(SCONTO_SHOWROOM, 0.1)
    assert.equal(prezzoShowroomDa(122), 109.8)
    assert.equal(prezzoShowroomDa(0), 0)
  })

  test('i tre prezzi insieme, su un capo da 65 € di costo al 35%', () => {
    const p = calcolaPrezzi(65, 35)
    assert.equal(p.prezzoNettoIva, 100)
    assert.equal(p.prezzoVendita, 122)
    assert.equal(p.prezzoShowroom, 109.8)
    assert.equal(p.costoTotale, 65)
  })

  test('senza costo noto tutti e tre restano a zero, e le viste mostrano «–»', () => {
    const p = calcolaPrezzi(0, 35)
    assert.deepEqual(
      [p.prezzoNettoIva, p.prezzoVendita, p.prezzoShowroom],
      [0, 0, 0],
    )
  })
})

describe('Composizione ricavata dai tessuti', () => {
  test('si leggono le fibre comunque siano scritte', () => {
    const attese = [{ percentuale: 70, nome: 'Lana' }, { percentuale: 30, nome: 'Cashmere' }]
    for (const scrittura of [
      '70% Lana - 30% Cashmere',
      '70% lana / 30% cashmere',
      '70%Lana, 30%Cashmere',
      '70 % Lana + 30 % Cashmere',
    ]) {
      assert.deepEqual(leggiFibre(scrittura), attese, scrittura)
    }
  })

  test('la forma canonica è «70% Lana / 30% Cashmere», dalla più presente alla meno', () => {
    assert.equal(normalizzaComposizione('30% cashmere - 70% lana'), '70% Lana / 30% Cashmere')
    assert.equal(
      normalizzaComposizione('80% Cotone - 10% Poliestere - 10% Elastan'),
      '80% Cotone / 10% Poliestere / 10% Elastan',
    )
  })

  test('un testo che non contiene percentuali resta com’è: non si inventa una composizione', () => {
    assert.equal(normalizzaComposizione('Misto lana, vedi cartellino'), 'Misto lana, vedi cartellino')
    assert.equal(normalizzaComposizione(null), '')
  })

  test('due scritture diverse della stessa composizione sono la stessa composizione', () => {
    assert.ok(stessaComposizione('80% Cotone - 20% Elastan', '80% cotone / 20% elastan'))
    assert.ok(!stessaComposizione('80% Cotone - 20% Elastan', '70% Cotone - 30% Elastan'))
  })

  test('un tessuto solo: la composizione è la sua', () => {
    const r = componiComposizione([{ nome: 'lana', composizione: '70% lana - 30% cashmere' }])
    assert.equal(r.composizione, '70% Lana / 30% Cashmere')
    assert.equal(r.daConfermare, false)
    assert.deepEqual(r.fonti, ['lana'])
  })

  test('più tessuti che dicono la stessa cosa non sono un problema', () => {
    const r = componiComposizione([
      { nome: 'piquè', composizione: '80% Cotone - 20% Elastan' },
      { nome: 'piquè bis', composizione: '80% cotone / 20% elastan' },
    ])
    assert.equal(r.composizione, '80% Cotone / 20% Elastan')
    assert.equal(r.daConfermare, false)
  })

  test('⚠️ tessuti diversi: si elencano, NON si sommano le percentuali', () => {
    // Il punto della prova. La composizione è in peso e l'app conosce i metri: una somma
    // darebbe un numero dall'aria precisa e sbagliato, stampato su un'etichetta di lavaggio.
    const r = componiComposizione([
      { nome: 'Esterno', composizione: '100% Lana' },
      { nome: 'Fodera', composizione: '100% Viscosa' },
    ])
    assert.equal(r.daConfermare, true)
    assert.equal(r.composizione, 'Esterno: 100% Lana · Fodera: 100% Viscosa')
    assert.ok(!/50%/.test(r.composizione), 'nessuna percentuale inventata')
  })

  test('tessuti senza composizione non contano', () => {
    const r = componiComposizione([
      { nome: 'senza dati', composizione: null },
      { nome: 'lana', composizione: '100% Lana' },
    ])
    assert.equal(r.composizione, '100% Lana')
    assert.deepEqual(componiComposizione([{ nome: 'x', composizione: null }]), {
      composizione: '', fonti: [], daConfermare: false,
    })
  })

  test('formattaComposizione arrotonda solo quando serve', () => {
    assert.equal(
      formattaComposizione([{ percentuale: 33.333, nome: 'Lana' }, { percentuale: 66.667, nome: 'Cotone' }]),
      '66.7% Cotone / 33.3% Lana',
    )
  })
})
