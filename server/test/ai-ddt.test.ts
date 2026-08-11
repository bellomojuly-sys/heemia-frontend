// Verifica pura della normalizzazione della proposta AI: nessun database, nessuna chiave
// OpenAI. Si importa `proposta-ddt.js` e non `service.js` proprio per questo — `service.js`
// carica la configurazione del server e pretenderebbe DATABASE_URL per un test di logica.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizzaPropostaDdt,
  type DdtRientroContext,
  type DdtRientroProposal,
} from '../src/modules/ai/proposta-ddt.js'

const contesto: DdtRientroContext = {
  bollaId: '11111111-1111-4111-8111-111111111111',
  numeroBollaUscita: 'DDT-2026-0001',
  lavorante: 'Confezioni Bianchi',
  prodotto: { id: 'p1', nome: 'Cappotto', codice: 'CAP-01' },
  quantitaAttesa: 10,
  capiGiaRientrati: 0,
  righe: [
    {
      id: 'riga-valida', descrizione: 'Lana grigia', sku: 'TES-01', unitaMisura: 'm',
      lotto: null, colore: 'grigio', variante: null, quantitaAncoraFuori: 12,
    },
  ],
  varianti: [{ id: 'variante-valida', sku: 'CAP-01-42-NERO', taglia: '42', colore: 'nero' }],
}

test('la proposta DDT non può introdurre ID estranei o quantità negative', () => {
  const proposta: DdtRientroProposal = {
    numeroDocumentoLavorante: '  DDT 44  ',
    data: '11/08/2026',
    righe: [
      {
        rigaId: 'riga-inesistente', descrizioneDocumento: ' Lana ', utilizzata: -2,
        restituita: 3, scartoRecuperato: null, scartoPerso: null, note: '  verificare lotto  ',
        affidabilita: 'media',
      },
      {
        rigaId: 'riga-valida', descrizioneDocumento: 'Lana grigia', utilizzata: 7,
        restituita: null, scartoRecuperato: 1, scartoPerso: 0, note: null,
        affidabilita: 'alta',
      },
    ],
    capi: [
      {
        variantId: 'variante-inesistente', descrizioneDocumento: 'Cappotto 42', quantita: 2,
        note: null, affidabilita: 'bassa',
      },
      {
        variantId: 'variante-valida', descrizioneDocumento: 'Cappotto nero 42', quantita: 3,
        note: null, affidabilita: 'alta',
      },
    ],
    note: '  proposta da controllare  ',
    affidabilita: 'media',
  }

  const normalizzata = normalizzaPropostaDdt(proposta, contesto)

  assert.equal(normalizzata.numeroDocumentoLavorante, 'DDT 44')
  assert.equal(normalizzata.data, null)
  assert.equal(normalizzata.righe[0].rigaId, null)
  assert.equal(normalizzata.righe[0].utilizzata, null)
  assert.equal(normalizzata.righe[0].restituita, 3)
  assert.equal(normalizzata.righe[0].note, 'verificare lotto')
  assert.equal(normalizzata.righe[1].rigaId, 'riga-valida')
  assert.equal(normalizzata.capi[0].variantId, null)
  assert.equal(normalizzata.capi[1].variantId, 'variante-valida')
  assert.equal(normalizzata.capi[1].quantita, 3)
  assert.equal(normalizzata.note, 'proposta da controllare')
})
