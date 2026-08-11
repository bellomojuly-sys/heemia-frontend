// Forma e regole della proposta di rientro letta da un DDT: tipi, schema strutturato,
// istruzioni al modello e normalizzazione del risultato.
//
// Sta in un file suo, separato da `service.ts`, per una ragione precisa: qui non si
// importa `core/config.ts`, quindi niente di tutto questo pretende `DATABASE_URL` o le
// altre variabili d'ambiente. La normalizzazione — l'unica difesa che impedisce a una
// risposta del modello di introdurre ID estranei o quantità negative — resta così
// verificabile con un test puro, senza database e senza chiave OpenAI.

export interface DdtRientroContext {
  bollaId: string
  numeroBollaUscita: string | null
  lavorante: string
  prodotto: { id: string; nome: string; codice: string } | null
  quantitaAttesa: number
  capiGiaRientrati: number
  righe: {
    id: string
    descrizione: string
    sku: string | null
    unitaMisura: string
    lotto: string | null
    colore: string | null
    variante: string | null
    quantitaAncoraFuori: number
  }[]
  varianti: { id: string; sku: string; taglia: string; colore: string }[]
}

export interface DdtRientroProposal {
  numeroDocumentoLavorante: string | null
  data: string | null
  righe: {
    rigaId: string | null
    descrizioneDocumento: string
    utilizzata: number | null
    restituita: number | null
    scartoRecuperato: number | null
    scartoPerso: number | null
    note: string | null
    affidabilita: 'alta' | 'media' | 'bassa'
  }[]
  capi: {
    variantId: string | null
    descrizioneDocumento: string
    quantita: number | null
    note: string | null
    affidabilita: 'alta' | 'media' | 'bassa'
  }[]
  note: string
  affidabilita: 'alta' | 'media' | 'bassa'
}

export function ddtRientroSchema(contesto: DdtRientroContext) {
  return {
    type: 'object',
    properties: {
      numeroDocumentoLavorante: {
        type: ['string', 'null'],
        description: 'Numero del DDT emesso dal lavorante, esattamente come appare sul documento',
      },
      data: {
        type: ['string', 'null'],
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: 'Data del DDT in formato AAAA-MM-GG, oppure null se non leggibile',
      },
      righe: {
        type: 'array',
        description: 'Materiali della bolla di uscita che il DDT dichiara utilizzati, restituiti o scartati',
        items: {
          type: 'object',
          properties: {
            rigaId: {
              type: ['string', 'null'],
              enum: [...contesto.righe.map((r) => r.id), null],
              description: 'ID copiato dal contesto soltanto quando la corrispondenza è chiara',
            },
            descrizioneDocumento: { type: 'string' },
            utilizzata: { type: ['number', 'null'], minimum: 0 },
            restituita: { type: ['number', 'null'], minimum: 0 },
            scartoRecuperato: { type: ['number', 'null'], minimum: 0 },
            scartoPerso: { type: ['number', 'null'], minimum: 0 },
            note: { type: ['string', 'null'] },
            affidabilita: { type: 'string', enum: ['alta', 'media', 'bassa'] },
          },
          required: [
            'rigaId', 'descrizioneDocumento', 'utilizzata', 'restituita',
            'scartoRecuperato', 'scartoPerso', 'note', 'affidabilita',
          ],
          additionalProperties: false,
        },
      },
      capi: {
        type: 'array',
        description: 'Capi finiti consegnati dal lavorante, associati a una variante solo se inequivocabile',
        items: {
          type: 'object',
          properties: {
            variantId: {
              type: ['string', 'null'],
              enum: [...contesto.varianti.map((v) => v.id), null],
              description: 'ID copiato dal contesto soltanto quando SKU, taglia e colore coincidono',
            },
            descrizioneDocumento: { type: 'string' },
            quantita: { type: ['integer', 'null'], minimum: 1 },
            note: { type: ['string', 'null'] },
            affidabilita: { type: 'string', enum: ['alta', 'media', 'bassa'] },
          },
          required: ['variantId', 'descrizioneDocumento', 'quantita', 'note', 'affidabilita'],
          additionalProperties: false,
        },
      },
      note: {
        type: 'string',
        description: 'Sintesi italiana: dati letti, associazioni dubbie e campi da verificare a mano',
      },
      affidabilita: { type: 'string', enum: ['alta', 'media', 'bassa'] },
    },
    required: ['numeroDocumentoLavorante', 'data', 'righe', 'capi', 'note', 'affidabilita'],
    additionalProperties: false,
  } as const
}

export const DDT_RIENTRO_PROMPT = `Sei un assistente amministrativo di un'azienda di moda italiana. Leggi un DDT ricevuto da un lavorante esterno e prepara una proposta di registrazione del rientro.

Regole inderogabili:
- Il tuo output è solo una proposta: non stai modificando il magazzino.
- Estrai solo dati effettivamente leggibili. Non inventare quantità, SKU, taglie, colori o destinazioni.
- Usa esclusivamente gli ID presenti nel contesto. Se la corrispondenza non è chiara, usa null e spiegalo nelle note.
- Una riga di materiale che il documento dichiara restituita va in "restituita".
- Compila "utilizzata", "scartoRecuperato" o "scartoPerso" solo se il documento lo dichiara esplicitamente. Non dedurre il consumo per differenza e non considerare perso ciò che non compare.
- I prodotti finiti consegnati vanno in "capi". Associa una variantId solo con corrispondenza chiara di SKU oppure di prodotto, taglia e colore.
- Non superare le quantità ancora presso il lavorante indicate nel contesto.
- Le quantità dei capi sono interi. Per metri e altri materiali sono ammessi decimali.
- Se il documento è illeggibile o non sembra pertinente alla bolla, restituisci gli elementi non associati con ID null e affidabilità bassa.`

function numeroNonNegativo(v: unknown, intero = false): number | null {
  if (v === null || v === undefined || typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null
  if (intero && (!Number.isInteger(v) || v < 1)) return null
  return v
}

/**
 * Seconda cintura dopo lo schema strutturato: non lascia passare ID estranei al contesto
 * né numeri negativi. È esportata per poter verificare questa garanzia senza chiamare l'API.
 */
export function normalizzaPropostaDdt(
  proposta: DdtRientroProposal,
  contesto: DdtRientroContext,
): DdtRientroProposal {
  const righeAmmesse = new Set(contesto.righe.map((r) => r.id))
  const variantiAmmesse = new Set(contesto.varianti.map((v) => v.id))
  const data = proposta.data && /^\d{4}-\d{2}-\d{2}$/.test(proposta.data) ? proposta.data : null

  return {
    numeroDocumentoLavorante: proposta.numeroDocumentoLavorante?.trim() || null,
    data,
    righe: proposta.righe.map((r) => ({
      ...r,
      rigaId: r.rigaId && righeAmmesse.has(r.rigaId) ? r.rigaId : null,
      descrizioneDocumento: r.descrizioneDocumento.trim(),
      utilizzata: numeroNonNegativo(r.utilizzata),
      restituita: numeroNonNegativo(r.restituita),
      scartoRecuperato: numeroNonNegativo(r.scartoRecuperato),
      scartoPerso: numeroNonNegativo(r.scartoPerso),
      note: r.note?.trim() || null,
    })),
    capi: proposta.capi.map((c) => ({
      ...c,
      variantId: c.variantId && variantiAmmesse.has(c.variantId) ? c.variantId : null,
      descrizioneDocumento: c.descrizioneDocumento.trim(),
      quantita: numeroNonNegativo(c.quantita, true),
      note: c.note?.trim() || null,
    })),
    note: proposta.note.trim(),
    affidabilita: proposta.affidabilita,
  }
}
