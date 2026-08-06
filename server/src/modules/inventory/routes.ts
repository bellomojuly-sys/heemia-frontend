// Inventario prodotti finiti (/inventario/prodotti-finiti). Modulo RBAC "inventario".
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import {
  chiudiLavorazione, confirmMigration, getLabDetail, listInventory, listStockMovements,
  mandaInProduzione, migrationAdjust, transferStock, updateInventoryRecord,
} from './service.js'

const listQuerySchema = z.object({
  stato: z.enum(['disponibile', 'esaurito', 'low_stock']).optional(),
  divergenza: z.enum(['true', 'false']).optional(),
})

const patchSchema = z.object({
  qtaMagazzino: z.number().int().nonnegative().optional(),
  qtaLaboratorio: z.number().int().nonnegative().optional(),
  qtaRiservata: z.number().int().nonnegative().optional(),
  qtaVenduta: z.number().int().nonnegative().optional(),
  sogliaMinima: z.number().int().nonnegative().optional(),
  sogliaMinimaLaboratorio: z.number().int().nonnegative().optional(),
})

const transferSchema = z.object({
  direzione: z.enum(['to_lab', 'to_warehouse']),
  quantita: z.number().int().positive(),
  motivo: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
})

// Migrazione iniziale: `modalita` è il significato dell'operazione, dichiarato dalla
// persona nella domanda della capretta. Il server non lo deduce (FR-49).
const migrazioneSchema = z.object({
  ubicazione: z.enum(['magazzino', 'laboratorio']),
  quantita: z.number().int().nonnegative(),
  modalita: z.enum(['redistribuisci', 'aggiungi', 'colma']),
  note: z.string().max(500).optional(),
})

const produzioneSchema = z.object({
  quantita: z.number().int().positive(),
  productId: z.string().uuid().optional(),
  stepId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
})

const chiusuraSchema = z.object({
  esito: z.enum(['terminato', 'annullato']),
})

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function inventoryRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('inventario')] }
  const write = { preHandler: [authenticate, requireModule('inventario'), requireEdit] }

  app.get('/inventory', read, async (req) => {
    const q = parse(listQuerySchema, req.query)
    return listInventory({
      stato: q.stato,
      divergenza: q.divergenza === undefined ? undefined : q.divergenza === 'true',
    })
  })

  app.patch('/inventory/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    return updateInventoryRecord(id, parse(patchSchema, req.body), req.user!.id)
  })

  // Trasferimento magazzino <-> laboratorio: il server rifiuta le quantità che
  // porterebbero l'ubicazione di partenza sotto zero.
  app.post('/inventory/:variantId/transfer', write, async (req) => {
    const { variantId } = req.params as { variantId: string }
    const d = parse(transferSchema, req.body)
    return transferStock(variantId, d.direzione, d.quantita, req.user!.id, d.note, d.motivo)
  })

  // Distribuzione iniziale (FR-49): correzione di un'ubicazione con il significato
  // dichiarato — capi già compresi nel totale oppure quantità mai registrata.
  app.post('/inventory/:variantId/migration', write, async (req) => {
    const { variantId } = req.params as { variantId: string }
    return migrationAdjust(variantId, parse(migrazioneSchema, req.body), req.user!.id)
  })

  // Conferma della distribuzione iniziale: rifiutata se la somma delle ubicazioni non
  // coincide col totale registrato.
  app.post('/inventory/:variantId/migration/confirm', write, async (req) => {
    const { variantId } = req.params as { variantId: string }
    return confirmMigration(variantId, req.user!.id)
  })

  app.get('/inventory/:variantId/movements', read, async (req) => {
    const { variantId } = req.params as { variantId: string }
    return listStockMovements(variantId)
  })

  // Dettaglio del laboratorio: giacenza, reintegri, consumi e capi in produzione.
  app.get('/inventory/:variantId/lab', read, async (req) => {
    const { variantId } = req.params as { variantId: string }
    return getLabDetail(variantId)
  })

  // Capi mandati in produzione: restano in laboratorio ma non sono più disponibili.
  app.post('/inventory/:variantId/in-produzione', write, async (req, reply) => {
    const { variantId } = req.params as { variantId: string }
    const creato = await mandaInProduzione(variantId, parse(produzioneSchema, req.body), req.user!.id)
    reply.code(201)
    return creato
  })

  app.patch('/in-produzione/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    const d = parse(chiusuraSchema, req.body)
    return chiudiLavorazione(id, d.esito, req.user!.id)
  })
}
