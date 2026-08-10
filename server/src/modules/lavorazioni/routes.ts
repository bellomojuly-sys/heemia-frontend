// Bolle / DDT di lavorazione esterna (2026-08-10). Modulo RBAC "lavorazioni".
//
// Le scritture passano tutte da `requireEdit` (viewer in sola lettura). La sola eccezione
// per ruolo è la chiusura **con differenza**, riservata ad admin/CEO: quel controllo vive
// nel service, perché dipende dal contenuto della richiesta e non dalla rotta.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import {
  aggiornaBolla, aggiungiAllegato, annullaBolla, chiudiBolla, creaBolla, eliminaAllegato,
  eliminaBozza, emettiBolla, getAllegato, getBolla, listArticoliDisponibili, listBolle,
  listMovimenti, registraRientro, riepilogoPressoLavoranti,
} from './service.js'

const causale = z.enum(['conto_lavorazione', 'conto_visione', 'riparazione', 'campionatura', 'reso_a_fornitore', 'altro'])
const stato = z.enum(['bozza', 'emessa', 'parzialmente_rientrata', 'chiusa', 'annullata'])
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato atteso AAAA-MM-GG')

const rigaSchema = z.object({
  tipo: z.enum(['materiale', 'accessorio', 'variante']),
  articoloId: z.string().uuid(),
  quantita: z.number().positive(),
  provenienza: z.enum(['magazzino', 'scampoli']).optional(),
  lotto: z.string().max(80).optional(),
  colore: z.string().max(80).optional(),
  variante: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
})

const creaSchema = z.object({
  supplierId: z.string().uuid(),
  data: dataIso,
  causale: causale.optional(),
  productId: z.string().uuid().optional(),
  technicalSheetId: z.string().uuid().optional(),
  commessa: z.string().max(120).optional(),
  orderId: z.string().uuid().optional(),
  quantitaAttesa: z.number().int().nonnegative().optional(),
  note: z.string().max(2000).optional(),
  righe: z.array(rigaSchema).min(1, 'serve almeno una riga di materiale'),
})

// In modifica ogni campo è facoltativo; `righe`, se presente, sostituisce l'elenco intero.
// Un campo assente resta com'è, una stringa vuota lo azzera (lo traduce il service).
const patchSchema = creaSchema.partial()

const rientroSchema = z.object({
  data: dataIso,
  numeroDocumentoLavorante: z.string().max(80).optional(),
  note: z.string().max(2000).optional(),
  // Facoltativo: un rientro può portare solo capi finiti, senza toccare le righe di
  // materiale (il materiale resta fuori finché non arriva il rientro successivo).
  righe: z
    .array(
      z.object({
        rigaId: z.string().uuid(),
        utilizzata: z.number().nonnegative().optional(),
        restituita: z.number().nonnegative().optional(),
        scartoRecuperato: z.number().nonnegative().optional(),
        scartoPerso: z.number().nonnegative().optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .optional(),
  capi: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantita: z.number().int().positive(),
        note: z.string().max(500).optional(),
      }),
    )
    .optional(),
  allegato: z.object({ nome: z.string().min(1).max(200), dataUrl: z.string().min(1) }).optional(),
})

const chiusuraSchema = z.object({
  forzaDifferenza: z.boolean().optional(),
  note: z.string().max(2000).optional(),
})

const annullaSchema = z.object({ motivo: z.string().max(500).optional() })

const allegatoSchema = z.object({
  nome: z.string().min(1).max(200),
  // Limite allineato al bodyLimit di app.ts (30 MB), con margine per l'overhead base64.
  dataUrl: z.string().min(1).max(20 * 1024 * 1024),
  rientroId: z.string().uuid().optional(),
})

const listQuerySchema = z.object({
  supplierId: z.string().uuid().optional(),
  stato: stato.optional(),
  numero: z.string().max(60).optional(),
  dataDa: dataIso.optional(),
  dataA: dataIso.optional(),
  productId: z.string().uuid().optional(),
})

const articoliQuerySchema = z.object({
  q: z.string().max(120).optional(),
  tipo: z.enum(['materiale', 'accessorio', 'variante']).optional(),
})

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function lavorazioniRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('lavorazioni')] }
  const write = { preHandler: [authenticate, requireModule('lavorazioni'), requireEdit] }

  // --- Elenco e dettaglio ---

  app.get('/lavorazioni/bolle', read, async (req) => listBolle(parse(listQuerySchema, req.query)))

  app.get('/lavorazioni/bolle/:id', read, async (req) => {
    const { id } = req.params as { id: string }
    return getBolla(id)
  })

  app.get('/lavorazioni/bolle/:id/movimenti', read, async (req) => {
    const { id } = req.params as { id: string }
    return listMovimenti(id)
  })

  /** Articoli reali dell'inventario con la disponibilità vera: alimenta il selettore di riga. */
  app.get('/lavorazioni/articoli', read, async (req) => listArticoliDisponibili(parse(articoliQuerySchema, req.query)))

  /** Quanto materiale è fuori adesso e presso chi. */
  app.get('/lavorazioni/presso-lavoranti', read, async () => riepilogoPressoLavoranti())

  // --- Ciclo del documento ---

  app.post('/lavorazioni/bolle', write, async (req, reply) => {
    const creata = await creaBolla(parse(creaSchema, req.body), req.user!.id)
    reply.code(201)
    return creata
  })

  app.patch('/lavorazioni/bolle/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    return aggiornaBolla(id, parse(patchSchema, req.body), req.user!.id)
  })

  app.delete('/lavorazioni/bolle/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    return eliminaBozza(id, req.user!.id)
  })

  /** Emissione: qui il materiale esce dal magazzino. Ripetere la chiamata non raddoppia nulla. */
  app.post('/lavorazioni/bolle/:id/emetti', write, async (req) => {
    const { id } = req.params as { id: string }
    return emettiBolla(id, req.user!.id)
  })

  app.post('/lavorazioni/bolle/:id/rientri', write, async (req, reply) => {
    const { id } = req.params as { id: string }
    const aggiornata = await registraRientro(id, parse(rientroSchema, req.body), req.user!.id)
    reply.code(201)
    return aggiornata
  })

  app.post('/lavorazioni/bolle/:id/chiudi', write, async (req) => {
    const { id } = req.params as { id: string }
    return chiudiBolla(id, parse(chiusuraSchema, req.body ?? {}), { id: req.user!.id, role: req.user!.role })
  })

  app.post('/lavorazioni/bolle/:id/annulla', write, async (req) => {
    const { id } = req.params as { id: string }
    return annullaBolla(id, parse(annullaSchema, req.body ?? {}).motivo, req.user!.id)
  })

  // --- Allegati ---
  // Il contenuto (data URL, anche di parecchi MB) sta su una rotta a sé: l'elenco delle
  // bolle deve restare leggero e non trascinarsi dietro le scansioni dei DDT.

  app.post('/lavorazioni/bolle/:id/allegati', write, async (req, reply) => {
    const { id } = req.params as { id: string }
    const creato = await aggiungiAllegato(id, parse(allegatoSchema, req.body), req.user!.id)
    reply.code(201)
    return creato
  })

  app.get('/lavorazioni/allegati/:id', read, async (req) => {
    const { id } = req.params as { id: string }
    return getAllegato(id)
  })

  app.delete('/lavorazioni/allegati/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    return eliminaAllegato(id, req.user!.id)
  })
}
