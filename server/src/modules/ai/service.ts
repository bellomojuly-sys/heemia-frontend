// FR-14 + FR-28: scansione AI della scheda tecnica in PDF.
// La founder carica il PDF della scheda tecnica (versione Finale o Piazzamento e taglio)
// e Claude ne estrae i costi del capo, che alimentano il calcolo del break-even.
//
// Perché lato server e non nel browser: la chiave Claude API non deve mai finire nel
// frontend. Il PDF arriva qui in base64, viene inoltrato a Claude e torna un oggetto
// strutturato. I valori estratti restano SEMPRE modificabili a mano nell'interfaccia:
// l'AI propone, la founder conferma (stessa logica della quantità suggerita dei materiali).
import Anthropic from '@anthropic-ai/sdk'
import { AppError, badRequest } from '../../core/errors.js'
import { config } from '../../core/config.js'

/** Limite del PDF accettato: oltre questa soglia la richiesta è rifiutata con un messaggio chiaro. */
const MAX_PDF_BYTES = 20 * 1024 * 1024 // 20 MB

// Schema dell'estrazione. Passato a Claude come structured output, così la risposta è
// sempre un JSON valido con questa forma (niente parsing fragile di testo libero).
const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    nomeProdotto: { type: ['string', 'null'], description: 'Nome del capo, se leggibile nel documento' },
    codiceProdotto: { type: ['string', 'null'], description: 'Codice/SKU del capo, se presente' },
    composizione: { type: ['string', 'null'], description: 'Composizione tessile completa' },
    taglie: { type: 'array', items: { type: 'string' }, description: 'Taglie elencate nel documento' },
    materiali: {
      type: 'array',
      description: 'Materiali e componenti con il relativo consumo e costo, se indicati',
      items: {
        type: 'object',
        properties: {
          descrizione: { type: 'string' },
          unitaMisura: { type: ['string', 'null'] },
          quantita: { type: ['number', 'null'] },
          costoUnitario: { type: ['number', 'null'] },
          costoTotale: { type: ['number', 'null'] },
        },
        required: ['descrizione', 'unitaMisura', 'quantita', 'costoUnitario', 'costoTotale'],
        additionalProperties: false,
      },
    },
    costi: {
      type: 'array',
      description: 'Voci di costo del capo trovate nel documento (lavorazioni, taglio, confezione, sviluppo…)',
      items: {
        type: 'object',
        properties: {
          voce: {
            type: 'string',
            enum: [
              'accessori', 'lavorazioni', 'taglio', 'confezione', 'ricamo_stampa',
              'sviluppo_modello', 'disegno', 'scheda_tecnica', 'prototipazione', 'logistica', 'altro',
            ],
          },
          etichettaOriginale: { type: 'string', description: 'Come la voce è scritta nel documento' },
          importo: { type: 'number' },
          ammortizzabile: {
            type: 'boolean',
            description: 'true per costi una-tantum di sviluppo/disegno/prototipazione/scheda tecnica, da ripartire sui capi prodotti',
          },
        },
        required: ['voce', 'etichettaOriginale', 'importo', 'ammortizzabile'],
        additionalProperties: false,
      },
    },
    quantitaPrevistaProduzione: {
      type: ['number', 'null'],
      description: 'Numero di capi previsti in produzione, se indicato nel documento',
    },
    note: {
      type: 'string',
      description: 'Nota sintetica in italiano su cosa è stato estratto e cosa non era leggibile',
    },
    affidabilita: {
      type: 'string',
      enum: ['alta', 'media', 'bassa'],
      description: 'Quanto è leggibile e completo il documento rispetto ai costi',
    },
  },
  required: ['nomeProdotto', 'codiceProdotto', 'composizione', 'taglie', 'materiali', 'costi', 'quantitaPrevistaProduzione', 'note', 'affidabilita'],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT = `Sei un assistente che legge schede tecniche di capi d'abbigliamento per un'azienda di moda italiana e ne estrae i costi di produzione.

Regole:
- Estrai SOLO ciò che è effettivamente scritto nel documento. Non stimare, non inventare e non completare valori mancanti: se un costo non c'è, non inserirlo.
- Gli importi sono in euro. Riporta i numeri senza simbolo di valuta, usando il punto come separatore decimale.
- Classifica come ammortizzabile (costo una-tantum da ripartire sui capi prodotti) le voci di sviluppo modello, disegno, realizzazione della scheda tecnica e prototipazione. Tutte le altre voci sono costi diretti del singolo capo.
- Se il documento contiene un costo totale già calcolato, NON inserirlo come voce: servono le singole componenti, altrimenti il totale verrebbe contato due volte.
- Nel campo note scrivi in italiano, in una o due frasi, cosa hai trovato e soprattutto cosa NON era leggibile, così la persona sa cosa deve completare a mano.
- Imposta affidabilita a "bassa" quando il documento è poco leggibile o quasi privo di costi, "media" quando mancano voci importanti, "alta" solo quando i costi sono chiari e completi.`

export interface SheetScanResult {
  nomeProdotto: string | null
  codiceProdotto: string | null
  composizione: string | null
  taglie: string[]
  materiali: {
    descrizione: string
    unitaMisura: string | null
    quantita: number | null
    costoUnitario: number | null
    costoTotale: number | null
  }[]
  costi: {
    voce: string
    etichettaOriginale: string
    importo: number
    ammortizzabile: boolean
  }[]
  quantitaPrevistaProduzione: number | null
  note: string
  affidabilita: 'alta' | 'media' | 'bassa'
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!config.anthropicApiKey) {
    throw new AppError(
      503,
      'Scansione AI non disponibile: manca la chiave Claude API. Imposta ANTHROPIC_API_KEY in server/.env e riavvia il server.',
      'AI_NOT_CONFIGURED',
    )
  }
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey })
  return client
}

/**
 * Invia il PDF della scheda tecnica a Claude e restituisce i costi estratti.
 * `pdfBase64` è il contenuto del file, senza il prefisso data URL.
 */
export async function scanTechnicalSheetPdf(pdfBase64: string, nomeFile?: string): Promise<SheetScanResult> {
  const data = pdfBase64.includes(',') ? pdfBase64.slice(pdfBase64.indexOf(',') + 1) : pdfBase64
  if (!data) throw badRequest('PDF mancante.')

  // La stringa base64 non deve contenere a capo, e il file deve stare nei limiti dell'API.
  const pulito = data.replace(/\s/g, '')
  const bytes = Math.floor((pulito.length * 3) / 4)
  if (bytes > MAX_PDF_BYTES) {
    throw badRequest(`Il PDF pesa circa ${Math.round(bytes / 1024 / 1024)} MB: il limite è ${MAX_PDF_BYTES / 1024 / 1024} MB.`)
  }

  const anthropic = getClient()

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pulito } },
            {
              type: 'text',
              text: `Estrai i costi di produzione del capo da questa scheda tecnica${nomeFile ? ` (file: ${nomeFile})` : ''}.`,
            },
          ],
        },
      ],
    })

    // Un rifiuto dei classificatori di sicurezza arriva come risposta valida, non come errore.
    if (response.stop_reason === 'refusal') {
      throw new AppError(422, 'Claude non ha potuto elaborare questo documento. Inserisci i costi a mano.', 'AI_REFUSAL')
    }

    const testo = response.content.find((b) => b.type === 'text')
    if (!testo || testo.type !== 'text') {
      throw new AppError(502, 'Risposta AI senza contenuto leggibile. Riprova o inserisci i costi a mano.', 'AI_EMPTY')
    }

    return JSON.parse(testo.text) as SheetScanResult
  } catch (err) {
    if (err instanceof AppError) throw err
    // Errori tipizzati dell'SDK: li traduciamo in messaggi comprensibili invece di un 500 generico.
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AppError(503, 'Chiave Claude API non valida. Controlla ANTHROPIC_API_KEY in server/.env.', 'AI_BAD_KEY')
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AppError(429, 'Troppe richieste alla AI in questo momento. Riprova tra poco.', 'AI_RATE_LIMIT')
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new AppError(503, 'Non riesco a raggiungere Claude API: controlla la connessione.', 'AI_UNREACHABLE')
    }
    if (err instanceof Anthropic.APIError) {
      throw new AppError(502, `Errore della AI (${err.status}): ${err.message}`, 'AI_ERROR')
    }
    throw err
  }
}
