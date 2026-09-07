// Letture documentali AI. Ogni endpoint usa il modulo della funzione che lo richiama:
// prodotti per le schede tecniche, lavorazioni per il DDT di rientro.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { getContestoRientroAi } from '../lavorazioni/service.js'
import { scanDdtRientro, scanTechnicalSheetPdf, suggestMeasurements } from './service.js'
import { chiediAllAssistente, storicoSessione } from './assistente.js'
import { costruisciContesto } from './contesto.js'

const scanSchema = z.object({
  /** Contenuto del PDF in base64 (con o senza prefisso data URL). */
  pdfBase64: z.string().min(1, 'PDF mancante'),
  nomeFile: z.string().optional(),
})

const measurementsSchema = z.object({
  categoria: z.string().min(1, 'Categoria mancante'),
  descrizione: z.string().max(2000).optional(),
  vestibilita: z.string().max(500).optional(),
  stile: z.string().max(500).optional(),
  genere: z.string().max(200).optional(),
  lunghezza: z.string().max(200).optional(),
  volume: z.string().max(200).optional(),
  dettagliCostruttivi: z.string().max(2000).optional(),
})

const domandaSchema = z.object({
  domanda: z.string().trim().min(3, 'Scrivi una domanda').max(1000, 'Domanda troppo lunga'),
  /** Continua una conversazione già aperta; se manca se ne apre una nuova. */
  sessionId: z.string().uuid().optional(),
})

const ddtRientroSchema = z.object({
  bollaId: z.string().uuid(),
  fileBase64: z.string().min(1, 'Documento mancante'),
  nomeFile: z.string().min(1).max(200),
  mimeType: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']),
})

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  }
  return parsed.data
}

export async function aiRoutes(app: FastifyInstance) {
  // Limite proprio, molto sotto il globale di 300/minuto. Qui ogni richiesta porta fino a
  // 20 MB di documento e fa partire una chiamata a OpenAI che si paga: il limite globale
  // difende il server dal carico, questo difende la bolletta. Dieci letture al minuto
  // sono più di quante una persona ne possa controllare.
  const limiteAi = { rateLimit: { max: 10, timeWindow: '1 minute' } }
  const prodottiWrite = {
    config: limiteAi,
    preHandler: [authenticate, requireModule('prodotti'), requireEdit],
  }
  const lavorazioniWrite = {
    config: limiteAi,
    preHandler: [authenticate, requireModule('lavorazioni'), requireEdit],
  }

  // --- AI Assistant (FR-28) --------------------------------------------------------
  //
  // Sta sotto il modulo «ai-assistant» in **lettura**: l'assistente non modifica niente,
  // e chiedere non è scrivere. I dati che riceve sono però filtrati un'altra volta, per
  // modulo, dentro `costruisciContesto`: chi non vede Costi e margini non può aggirare il
  // divieto girando la domanda all'assistente.
  const assistente = {
    config: limiteAi,
    preHandler: [authenticate, requireModule('ai-assistant')],
  }

  // I dati veri che l'assistente legge, esattamente come li legge lui. È anche ciò che la
  // pagina mostra quando OpenAI non è collegato: numeri del gestionale, non frasi finte.
  app.get('/ai/contesto', assistente, async (req) => costruisciContesto(req.user!.role))

  app.post('/ai/domanda', assistente, async (req) => {
    const { domanda, sessionId } = parse(domandaSchema, req.body)
    return chiediAllAssistente({ id: req.user!.id, role: req.user!.role }, { domanda, sessionId })
  })

  app.get('/ai/sessioni/:sessionId', assistente, async (req) => {
    const { sessionId } = req.params as { sessionId: string }
    return storicoSessione(sessionId, req.user!.id)
  })

  app.post('/ai/scan-technical-sheet', prodottiWrite, async (req) => {
    const { pdfBase64, nomeFile } = parse(scanSchema, req.body)
    const estrazione = await scanTechnicalSheetPdf(pdfBase64, nomeFile)
    return { estrazione, analizzatoIl: new Date().toISOString() }
  })

  // Quali misure servono per questo capo: l'AI propone l'elenco, i valori si compilano a mano.
  app.post('/ai/suggest-measurements', prodottiWrite, async (req) => {
    return suggestMeasurements(parse(measurementsSchema, req.body))
  })

  // Legge il DDT e restituisce soltanto una proposta. Il magazzino non viene toccato:
  // la scrittura resta sull'endpoint /lavorazioni/bolle/:id/rientri dopo la conferma.
  app.post('/ai/scan-ddt-rientro', lavorazioniWrite, async (req) => {
    const input = parse(ddtRientroSchema, req.body)
    const contesto = await getContestoRientroAi(input.bollaId)
    const proposta = await scanDdtRientro(
      input.fileBase64,
      input.nomeFile,
      input.mimeType,
      contesto,
    )
    return { proposta, analizzatoIl: new Date().toISOString() }
  })
}
