// Letture documentali AI: schede tecniche e DDT di rientro dai lavoranti.
// La founder carica il documento e l'AI restituisce sempre una proposta strutturata e
// modificabile. Nessuna lettura AI scrive direttamente nelle giacenze.
//
// Fornitore: **OpenAI** (DEC-050, scelta di Giulia il 2026-08-08 — l'azienda usa già
// ChatGPT). Si parla con la Responses API: il PDF viaggia come `input_file` in base64 e
// la risposta è vincolata a uno schema JSON (`text.format`), quindi non c'è testo libero
// da interpretare. Il modello si cambia da variabile d'ambiente senza toccare il codice.
//
// Perché lato server e non nel browser: la chiave API non deve mai finire nel frontend.
// Il PDF arriva qui in base64, viene inoltrato a OpenAI e torna un oggetto strutturato.
// I valori estratti restano SEMPRE modificabili a mano nell'interfaccia: l'AI propone,
// la founder conferma (stessa logica della quantità suggerita dei materiali).
import OpenAI from 'openai'
import { AppError, badRequest } from '../../core/errors.js'
import { config } from '../../core/config.js'
import {
  DDT_RIENTRO_PROMPT,
  ddtRientroSchema,
  normalizzaPropostaDdt,
  type DdtRientroContext,
  type DdtRientroProposal,
} from './proposta-ddt.js'

export type { DdtRientroContext, DdtRientroProposal } from './proposta-ddt.js'

/** Limite dei documenti accettati: oltre questa soglia la richiesta è rifiutata con un messaggio chiaro. */
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024 // 20 MB

// Schema dell'estrazione. Passato a OpenAI come structured output, così la risposta è
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

// --- DDT di rientro da lavorazione esterna ---------------------------------
// Tipi, schema strutturato, istruzioni e normalizzazione stanno in `proposta-ddt.ts`:
// lì non si importa la configurazione, quindi restano verificabili senza database.

export async function scanDdtRientro(
  fileBase64: string,
  nomeFile: string,
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
  contesto: DdtRientroContext,
): Promise<DdtRientroProposal> {
  const data = fileBase64.includes(',') ? fileBase64.slice(fileBase64.indexOf(',') + 1) : fileBase64
  const pulito = data.replace(/\s/g, '')
  if (!pulito) throw badRequest('Documento mancante.')

  const bytes = Math.floor((pulito.length * 3) / 4)
  if (bytes > MAX_DOCUMENT_BYTES) {
    throw badRequest(`Il documento pesa circa ${Math.round(bytes / 1024 / 1024)} MB: il limite è ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`)
  }

  const fileData = `data:${mimeType};base64,${pulito}`
  const documento = mimeType === 'application/pdf'
    ? { type: 'input_file' as const, filename: nomeFile, file_data: fileData }
    : { type: 'input_image' as const, image_url: fileData, detail: 'high' as const }
  const contestoTesto = JSON.stringify(contesto, null, 2)
  const openai = getClient()

  try {
    const response = await openai.responses.create({
      model: config.openaiModel,
      max_output_tokens: 8000,
      instructions: DDT_RIENTRO_PROMPT,
      input: [
        {
          role: 'user',
          content: [
            documento,
            {
              type: 'input_text',
              text: `Leggi il DDT allegato e prepara la proposta di rientro per questa bolla.\n\nCONTESTO BOLLA:\n${contestoTesto}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'proposta_rientro_ddt',
          schema: ddtRientroSchema(contesto) as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    })

    const proposta = jsonDallaRisposta<DdtRientroProposal>(
      response,
      'Compila il rientro a mano: nessuna giacenza è stata modificata.',
    )
    return normalizzaPropostaDdt(proposta, contesto)
  } catch (err) {
    throw tradurreErroreAI(err)
  }
}

// --- Misure tecniche suggerite (richiesta 3 del backlog "Note") ---
// Le misure necessarie cambiano con la categoria del capo: un pantalone non ha le stesse
// misure di un cappotto. L'AI propone QUALI misure servono; i valori numerici restano da
// compilare a mano, perché dipendono dalla taglia base e dal modello.

const MEASUREMENTS_SCHEMA = {
  type: 'object',
  properties: {
    misure: {
      type: 'array',
      description: 'Misure tecniche pertinenti per questo capo, in ordine di rilevazione',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome della misura in italiano, es. "Girovita"' },
          unita: { type: 'string', enum: ['cm', 'mm', 'in'] },
          tolleranza: { type: ['string', 'null'], description: 'Tolleranza tipica, es. "±0,5 cm"' },
          nota: { type: ['string', 'null'], description: 'Come si rileva la misura, se non ovvio' },
        },
        required: ['nome', 'unita', 'tolleranza', 'nota'],
        additionalProperties: false,
      },
    },
    note: { type: 'string', description: 'Nota sintetica in italiano sulle scelte fatte' },
  },
  required: ['misure', 'note'],
  additionalProperties: false,
} as const

const MEASUREMENTS_PROMPT = `Sei un modellista esperto di abbigliamento che lavora per un'azienda di moda italiana.

Dato un capo, elenchi le misure tecniche da rilevare sul modello.

Regole:
- Proponi SOLO misure pertinenti alla categoria del capo: un pantalone ha girovita, girobacino, altezza cavallo, lunghezza esterna e interna, larghezza coscia, ginocchio e fondo; un cappotto ha lunghezza totale, larghezza spalle, circonferenza torace, larghezza fondo, lunghezza e giro manica, profondità scalfo, altezza collo.
- Usa i nomi italiani correnti in sartoria.
- NON inventare valori numerici: indichi quali misure servono, non quanto devono misurare.
- Ordina le misure come si rilevano in pratica, dall'alto verso il basso.
- Da 5 a 12 misure: poche e giuste, non un elenco esaustivo.`

export interface SuggestedMeasurement {
  nome: string
  unita: 'cm' | 'mm' | 'in'
  tolleranza: string | null
  nota: string | null
}

export interface MeasurementsSuggestion {
  misure: SuggestedMeasurement[]
  note: string
}

export interface MeasurementsInput {
  categoria: string
  descrizione?: string
  vestibilita?: string
  stile?: string
  genere?: string
  lunghezza?: string
  volume?: string
  dettagliCostruttivi?: string
}

export async function suggestMeasurements(input: MeasurementsInput): Promise<MeasurementsSuggestion> {
  if (!input.categoria.trim()) throw badRequest('Serve la categoria del capo per suggerire le misure.')

  const contesto = [
    `Categoria: ${input.categoria}`,
    input.descrizione && `Descrizione dell'idea: ${input.descrizione}`,
    input.vestibilita && `Vestibilità desiderata: ${input.vestibilita}`,
    input.stile && `Stile: ${input.stile}`,
    input.genere && `Genere: ${input.genere}`,
    input.lunghezza && `Lunghezza: ${input.lunghezza}`,
    input.volume && `Volume: ${input.volume}`,
    input.dettagliCostruttivi && `Dettagli costruttivi: ${input.dettagliCostruttivi}`,
  ]
    .filter(Boolean)
    .join('\n')

  const openai = getClient()
  try {
    const response = await openai.responses.create({
      model: config.openaiModel,
      max_output_tokens: 4000,
      instructions: MEASUREMENTS_PROMPT,
      input: `Quali misure tecniche servono per questo capo?\n\n${contesto}`,
      text: {
        format: {
          type: 'json_schema',
          name: 'misure_suggerite',
          schema: MEASUREMENTS_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    })

    return jsonDallaRisposta<MeasurementsSuggestion>(response, 'Aggiungi le misure a mano.')
  } catch (err) {
    throw tradurreErroreAI(err)
  }
}

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!config.openaiApiKey) {
    throw new AppError(
      503,
      'Funzioni AI non disponibili: manca la chiave OpenAI. Imposta OPENAI_API_KEY in server/.env e riavvia il server (procedura: Integrazioni_Setup.md §1).',
      'AI_NOT_CONFIGURED',
    )
  }
  if (!client) client = new OpenAI({ apiKey: config.openaiApiKey })
  return client
}

/**
 * Estrae il JSON dalla risposta, distinguendo i due modi in cui può non esserci.
 * Un rifiuto e una risposta troncata arrivano come risposte *valide*, non come errori:
 * senza questo controllo il JSON.parse fallirebbe con un messaggio incomprensibile.
 */
function jsonDallaRisposta<T>(response: OpenAI.Responses.Response, fallback: string): T {
  for (const item of response.output) {
    if (item.type !== 'message') continue
    for (const blocco of item.content) {
      if (blocco.type === 'refusal') {
        throw new AppError(422, `L'AI non ha potuto rispondere: ${blocco.refusal} ${fallback}`, 'AI_REFUSAL')
      }
    }
  }
  if (response.status === 'incomplete') {
    throw new AppError(
      502,
      `Risposta AI interrotta (${response.incomplete_details?.reason ?? 'motivo sconosciuto'}). ${fallback}`,
      'AI_INCOMPLETE',
    )
  }
  const testo = response.output_text
  if (!testo) throw new AppError(502, `Risposta AI senza contenuto leggibile. ${fallback}`, 'AI_EMPTY')
  return JSON.parse(testo) as T
}

/**
 * Invia il PDF della scheda tecnica a OpenAI e restituisce i costi estratti.
 * `pdfBase64` è il contenuto del file, senza il prefisso data URL.
 */
export async function scanTechnicalSheetPdf(pdfBase64: string, nomeFile?: string): Promise<SheetScanResult> {
  const data = pdfBase64.includes(',') ? pdfBase64.slice(pdfBase64.indexOf(',') + 1) : pdfBase64
  if (!data) throw badRequest('PDF mancante.')

  // La stringa base64 non deve contenere a capo, e il file deve stare nei limiti dell'API.
  const pulito = data.replace(/\s/g, '')
  const bytes = Math.floor((pulito.length * 3) / 4)
  if (bytes > MAX_DOCUMENT_BYTES) {
    throw badRequest(`Il PDF pesa circa ${Math.round(bytes / 1024 / 1024)} MB: il limite è ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`)
  }

  const openai = getClient()

  try {
    const response = await openai.responses.create({
      model: config.openaiModel,
      max_output_tokens: 16000,
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              // Il nome file è obbligatorio quando il PDF viaggia in base64: l'API lo usa
              // per riconoscere il tipo di documento.
              filename: nomeFile ?? 'scheda-tecnica.pdf',
              file_data: `data:application/pdf;base64,${pulito}`,
            },
            {
              type: 'input_text',
              text: `Estrai i costi di produzione del capo da questa scheda tecnica${nomeFile ? ` (file: ${nomeFile})` : ''}.`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'estrazione_scheda_tecnica',
          schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    })

    return jsonDallaRisposta<SheetScanResult>(response, 'Inserisci i costi a mano.')
  } catch (err) {
    throw tradurreErroreAI(err)
  }
}

/** Errori tipizzati dell'SDK tradotti in messaggi comprensibili invece di un 500 generico. */
function tradurreErroreAI(err: unknown): unknown {
  if (err instanceof AppError) return err
  if (err instanceof OpenAI.AuthenticationError) {
    return new AppError(503, 'Chiave OpenAI non valida. Controlla OPENAI_API_KEY in server/.env.', 'AI_BAD_KEY')
  }
  if (err instanceof OpenAI.RateLimitError) {
    // Su OpenAI questo errore copre due casi diversi che l'utente deve poter distinguere:
    // troppe richieste al minuto, oppure credito esaurito sull'account.
    return new AppError(
      429,
      'Richiesta AI non accettata: troppe richieste in questo momento, oppure il credito OpenAI è esaurito. Controlla il saldo su platform.openai.com.',
      'AI_RATE_LIMIT',
    )
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new AppError(503, 'Non riesco a raggiungere OpenAI: controlla la connessione.', 'AI_UNREACHABLE')
  }
  if (err instanceof OpenAI.APIError) {
    return new AppError(502, `Errore della AI (${err.status}): ${err.message}`, 'AI_ERROR')
  }
  return err
}
