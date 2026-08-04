// FR-04 — endpoint inventario materie prime. Modulo RBAC: "inventario" (tutti i ruoli interni
// in lettura, scrittura solo admin/ceo/team come da User_Roles_Permissions).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import {
  consumeAccessory, consumeMaterial, createAccessory, createMaterial, getAccessory, getMaterial,
  listAccessories, listMaterials, listStockAlerts, updateAccessory, updateMaterial,
} from './service.js'

const statoEnum = z.enum(['disponibile', 'sotto_soglia', 'esaurito', 'da_verificare'])

const materialCreate = z.object({
  nome: z.string().min(1),
  codice: z.string().min(1),
  supplierId: z.string().uuid().optional(),
  composizione: z.string().optional(),
  colore: z.string().optional(),
  altezzaCm: z.number().nonnegative().optional(),
  prezzoAlMetro: z.number().nonnegative().optional(),
  metriAcquistati: z.number().nonnegative().optional(),
  metriUtilizzati: z.number().nonnegative().optional(),
  dataAcquisto: z.string().date().optional(),
  stagione: z.string().optional(),
  consigliLavaggio: z.string().optional(),
  noteTecniche: z.string().optional(),
  sogliaMinima: z.number().nonnegative().optional(),
  stato: statoEnum.optional(),
  unitaMisura: z.enum(['m', 'kg']).optional(),
  fatturaId: z.string().uuid().optional(),
})
const materialUpdate = materialCreate.partial().omit({ codice: true })

const accessoryCreate = z.object({
  nome: z.string().min(1),
  codice: z.string().min(1),
  categoria: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  quantitaAcquistata: z.number().nonnegative().optional(),
  quantitaUtilizzata: z.number().nonnegative().optional(),
  costoUnitario: z.number().nonnegative().optional(),
  sogliaMinima: z.number().nonnegative().optional(),
  stato: statoEnum.optional(),
  unitaMisura: z.enum(['cad', 'm']).optional(),
  fatturaId: z.string().uuid().optional(),
})
const accessoryUpdate = accessoryCreate.partial().omit({ codice: true })

const consumeSchema = z.object({ quantita: z.number().positive() })

// Query param delle liste validati: stato fuori enum o supplierId non-uuid -> 400 (non 500 da Prisma).
const listQuerySchema = z.object({
  stato: statoEnum.optional(),
  supplierId: z.string().uuid().optional(),
  q: z.string().optional(),
})

const dec = (v?: number) => (v === undefined ? undefined : new Prisma.Decimal(v))
const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function materialRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('inventario')] }
  const write = { preHandler: [authenticate, requireModule('inventario'), requireEdit] }

  // --- Tessuti ---
  app.get('/materials', read, async (req) => {
    return listMaterials(parse(listQuerySchema, req.query))
  })

  app.get('/materials/:id', read, async (req) => {
    const { id } = req.params as { id: string }
    return getMaterial(id)
  })

  app.post('/materials', write, async (req, reply) => {
    const d = parse(materialCreate, req.body)
    const { supplierId, fatturaId, dataAcquisto, ...rest } = d
    const data: Prisma.MaterialCreateInput = {
      ...rest,
      altezzaCm: dec(d.altezzaCm),
      prezzoAlMetro: dec(d.prezzoAlMetro),
      metriAcquistati: dec(d.metriAcquistati),
      metriUtilizzati: dec(d.metriUtilizzati),
      sogliaMinima: dec(d.sogliaMinima),
      dataAcquisto: dataAcquisto ? new Date(dataAcquisto) : undefined,
      supplier: supplierId ? { connect: { id: supplierId } } : undefined,
      fattura: fatturaId ? { connect: { id: fatturaId } } : undefined,
    }
    const created = await createMaterial(data, req.user!.id)
    reply.code(201)
    return created
  })

  app.patch('/materials/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    const d = parse(materialUpdate, req.body)
    const { supplierId, fatturaId, dataAcquisto, ...rest } = d
    const data: Prisma.MaterialUpdateInput = {
      ...rest,
      altezzaCm: dec(d.altezzaCm),
      prezzoAlMetro: dec(d.prezzoAlMetro),
      metriAcquistati: dec(d.metriAcquistati),
      metriUtilizzati: dec(d.metriUtilizzati),
      sogliaMinima: dec(d.sogliaMinima),
      dataAcquisto: dataAcquisto ? new Date(dataAcquisto) : undefined,
      supplier: supplierId ? { connect: { id: supplierId } } : undefined,
      fattura: fatturaId ? { connect: { id: fatturaId } } : undefined,
    }
    return updateMaterial(id, data, req.user!.id)
  })

  app.post('/materials/:id/consume', write, async (req) => {
    const { id } = req.params as { id: string }
    const { quantita } = parse(consumeSchema, req.body)
    return consumeMaterial(id, quantita, req.user!.id)
  })

  // --- Accessori ---
  app.get('/accessories', read, async (req) => {
    return listAccessories(parse(listQuerySchema, req.query))
  })

  app.get('/accessories/:id', read, async (req) => {
    const { id } = req.params as { id: string }
    return getAccessory(id)
  })

  app.post('/accessories', write, async (req, reply) => {
    const d = parse(accessoryCreate, req.body)
    const { supplierId, fatturaId, ...rest } = d
    const data: Prisma.AccessoryCreateInput = {
      ...rest,
      quantitaAcquistata: dec(d.quantitaAcquistata),
      quantitaUtilizzata: dec(d.quantitaUtilizzata),
      costoUnitario: dec(d.costoUnitario),
      sogliaMinima: dec(d.sogliaMinima),
      supplier: supplierId ? { connect: { id: supplierId } } : undefined,
      fattura: fatturaId ? { connect: { id: fatturaId } } : undefined,
    }
    const created = await createAccessory(data, req.user!.id)
    reply.code(201)
    return created
  })

  app.patch('/accessories/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    const d = parse(accessoryUpdate, req.body)
    const { supplierId, fatturaId, ...rest } = d
    const data: Prisma.AccessoryUpdateInput = {
      ...rest,
      quantitaAcquistata: dec(d.quantitaAcquistata),
      quantitaUtilizzata: dec(d.quantitaUtilizzata),
      costoUnitario: dec(d.costoUnitario),
      sogliaMinima: dec(d.sogliaMinima),
      supplier: supplierId ? { connect: { id: supplierId } } : undefined,
      fattura: fatturaId ? { connect: { id: fatturaId } } : undefined,
    }
    return updateAccessory(id, data, req.user!.id)
  })

  app.post('/accessories/:id/consume', write, async (req) => {
    const { id } = req.params as { id: string }
    const { quantita } = parse(consumeSchema, req.body)
    return consumeAccessory(id, quantita, req.user!.id)
  })

  // --- Alert scorte (FR-05) ---
  app.get('/stock-alerts', { preHandler: [authenticate, requireModule('alert')] }, async () => listStockAlerts())
}
