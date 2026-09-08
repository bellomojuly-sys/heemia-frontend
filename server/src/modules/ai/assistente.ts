// AI Assistant: la domanda parte da qui, insieme ai dati veri del gestionale.
//
// La divisione dei compiti è deliberata e vale a prescindere dal modello:
//
//   `contesto.ts`  decide **cosa** l'assistente può leggere (e i permessi lo filtrano lì,
//                  alla fonte: quello che un ruolo non vede non parte nemmeno).
//   questo file    decide **come** lo si chiede e **cosa si accetta** come risposta.
//
// La chiave OpenAI non esce mai dal server, e non esiste un percorso per cui il browser
// parli direttamente con OpenAI: la domanda arriva qui, il contesto si costruisce qui, la
// risposta torna indietro già formata.
//
// Finché la chiave non c'è, l'endpoint risponde 503 dicendo esattamente cosa manca — e
// **non** inventa una risposta di ripiego. Una frase scritta a mano che sembra generata è
// peggio di un errore onesto: chi legge non ha modo di sapere che l'assistente non ha
// letto niente. Il contesto resta comunque leggibile da `GET /ai/contesto`, quindi la
// pagina può mostrare i numeri veri anche senza modello collegato.
import OpenAI from 'openai'
import type { Role } from '@prisma/client'
import { AppError } from '../../core/errors.js'
import { config } from '../../core/config.js'
import { leggiCredenziale } from '../../core/credenziali.js'
import { prisma } from '../../core/prisma.js'
import { logActivity } from '../../core/activityLog.js'
import { costruisciContesto, type ContestoApp } from './contesto.js'

/**
 * Quanto storico si riporta indietro. Una conversazione operativa vive in poche battute;
 * riportarne cinquanta significherebbe pagare ogni volta per un contesto che nessuno
 * rilegge, e aumentare le probabilità che il modello risponda a una domanda vecchia.
 */
const MAX_STORICO = 8

const ISTRUZIONI = `Sei l'assistente interno del gestionale Heemia, un'azienda italiana di abbigliamento.

Rispondi in italiano, in modo breve e concreto, come farebbe un collega che ha i dati davanti.

REGOLE, in ordine di importanza:

1. Usa SOLTANTO i dati del CONTESTO che ti viene passato. Non stimare, non completare, non
   ricordare dati di conversazioni precedenti che non siano nel contesto. Se un numero non
   c'è, dillo: "questo dato non è nel gestionale" è una risposta corretta.
2. Se la domanda riguarda una sezione elencata in "sezioniNonVisibili", NON provare a
   rispondere lo stesso: spiega che quel modulo non è accessibile con il ruolo attivo e che
   un amministratore può cambiarlo da Impostazioni.
3. Riporta i numeri esattamente come stanno nel contesto, senza arrotondarli diversamente.
   Gli importi sono in euro.
4. Rispetta le "nota" presenti nel contesto: sono avvertenze sul significato dei numeri e
   valgono più della tua interpretazione. In particolare:
   - i capi "in produzione" sono solo quelli nella sezione produzione.capi. Gli altri hanno
     finito la produzione e stanno nello stock: non chiamarli mai "in produzione";
   - un capo senza costo diretto NON ha un margine alto: ha un margine non calcolabile.
5. Non sei autorizzato a modificare niente. Se ti viene chiesto di cambiare un dato, spiega
   in quale schermata si fa.
6. Quando elenchi delle righe, usa un elenco puntato corto e metti prima le più critiche.
   Se l'elenco nel contesto è troncato, dillo.
7. Chiudi con il punto dell'app dove si interviene, quando la domanda lo richiede.`

// Stessa regola di `service.ts`: la chiave si rilegge a ogni domanda, perché dal
// 2026-09-09 la cambia la CEO da Impostazioni e deve valere subito. Il client si ricostruisce
// solo quando la chiave è diversa da quella con cui era stato costruito.
let client: OpenAI | null = null
let chiaveDelClient = ''

async function getClient(): Promise<OpenAI> {
  const apiKey = await leggiCredenziale('openai_api_key')
  if (!apiKey) {
    throw new AppError(
      503,
      "L'AI Assistant non è collegato: l'account OpenAI dell'azienda non è ancora stato inserito. " +
        'Lo collega la CEO (o un amministratore) da Impostazioni → Integrazioni. ' +
        'I dati del gestionale restano consultabili qui sotto.',
      'AI_NOT_CONFIGURED',
    )
  }
  if (!client || chiaveDelClient !== apiKey) {
    client = new OpenAI({ apiKey })
    chiaveDelClient = apiKey
  }
  return client
}

export interface RispostaAssistente {
  sessionId: string
  domanda: string
  risposta: string
  /** Il contesto usato: la pagina lo mostra, così la risposta è verificabile riga per riga. */
  contesto: ContestoApp
  modello: string
}

export async function chiediAllAssistente(
  utente: { id: string; role: Role },
  input: { domanda: string; sessionId?: string },
): Promise<RispostaAssistente> {
  const domanda = input.domanda.trim()

  // Il contesto si costruisce PRIMA di guardare la chiave: se OpenAI non è collegato la
  // pagina deve poter mostrare comunque i dati veri, non una schermata vuota.
  const contesto = await costruisciContesto(utente.role)
  const openai = await getClient()

  const sessione = input.sessionId
    ? await prisma.aiSession.findUnique({
        where: { id: input.sessionId },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: MAX_STORICO } },
      })
    : null
  // Una sessione di qualcun altro non si continua: le domande di una persona restano sue.
  const sessioneValida = sessione && sessione.userId === utente.id ? sessione : null

  const storico = (sessioneValida?.messages ?? []).map((m) => ({
    role: m.autore === 'utente' ? ('user' as const) : ('assistant' as const),
    content: m.testo,
  }))

  let risposta: string
  try {
    const response = await openai.responses.create({
      model: config.openaiModel,
      max_output_tokens: 1200,
      instructions: ISTRUZIONI,
      input: [
        ...storico,
        {
          role: 'user',
          content:
            `CONTESTO (dati reali del gestionale, generati adesso):\n${JSON.stringify(contesto)}\n\n` +
            `DOMANDA: ${domanda}`,
        },
      ],
    })
    if (response.status === 'incomplete') {
      throw new AppError(
        502,
        `Risposta interrotta (${response.incomplete_details?.reason ?? 'motivo sconosciuto'}). Riprova con una domanda più stretta.`,
        'AI_INCOMPLETE',
      )
    }
    risposta = response.output_text?.trim() ?? ''
    if (!risposta) throw new AppError(502, 'Risposta AI senza contenuto leggibile.', 'AI_EMPTY')
  } catch (err) {
    throw tradurreErroreAI(err)
  }

  // Si scrive **dopo** che la risposta è arrivata: salvare la domanda prima significherebbe
  // lasciare in sessione domande a cui non ha mai risposto nessuno.
  const salvata = await prisma.$transaction(async (tx) => {
    const s = sessioneValida ?? (await tx.aiSession.create({ data: { userId: utente.id } }))
    await tx.aiMessage.createMany({
      data: [
        { sessionId: s.id, autore: 'utente', testo: domanda },
        { sessionId: s.id, autore: 'assistant', testo: risposta },
      ],
    })
    // FR-18: ogni domanda all'assistente resta nell'activity log. Il testo della domanda
    // c'è, quello della risposta no: il log dice cosa è stato chiesto, non ridonda la
    // conversazione, che sta nella sua tabella.
    await logActivity(tx, {
      userId: utente.id, azione: 'domanda_ai', entita: 'ai_session', entitaId: s.id, valoreNuovo: domanda,
    })
    return s
  })

  return { sessionId: salvata.id, domanda, risposta, contesto, modello: config.openaiModel }
}

/** Le domande già fatte in una sessione: la pagina le ricarica dopo un reload. */
export async function storicoSessione(sessionId: string, userId: string) {
  const sessione = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!sessione || sessione.userId !== userId) return { sessionId, messaggi: [] }
  return {
    sessionId,
    messaggi: sessione.messages.map((m) => ({
      id: m.id, autore: m.autore, testo: m.testo, data: m.createdAt.toISOString(),
    })),
  }
}

function tradurreErroreAI(err: unknown): unknown {
  if (err instanceof AppError) return err
  if (err instanceof OpenAI.AuthenticationError) {
    return new AppError(503, 'Chiave OpenAI non valida. Controlla OPENAI_API_KEY in server/.env.', 'AI_BAD_KEY')
  }
  if (err instanceof OpenAI.RateLimitError) {
    return new AppError(
      429,
      'Richiesta non accettata: troppe richieste in questo momento, oppure il credito OpenAI è esaurito.',
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
