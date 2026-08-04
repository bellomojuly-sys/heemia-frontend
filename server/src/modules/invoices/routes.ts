// FR-19/21/22/23 fatture e scadenze + FR-41 chiusura di cassa.
// Moduli RBAC: "fatture" (Admin/CEO) e "scadenze" (Admin/CEO).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { InvoicePaese } from '@prisma/client'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import {
  createInvoice, getInvoice, listCashClosures, listCostAllocations, listDeadlines, listInvoices,
  parseScontriniCsv, updateInvoice, updateInvoiceAssociations, upsertCashClosure,
} from './service.js'

const pagamentoEnum = z.enum(['da_pagare', 'pagata', 'scaduta'])
// Nomi del client Prisma ("Extra_EU"), mappati da Prisma sul valore reale in tabella ("Extra-EU").
const paeseEnum = z.enum(Object.values(InvoicePaese) as [InvoicePaese, ...InvoicePaese[]])
const categoriaEnum = z.enum([
  'tessuto', 'accessori', 'manodopera', 'packaging', 'spedizione',
  'marketing', 'logistica', 'servizi', 'costi_generali',
])

const createSchema = z.object({
  numero: z.string().min(1),
  data: z.string().date(),
  fornitoreId: z.string().uuid().optional(),
  clienteId: z.string().uuid().optional(),
  paese: paeseEnum.optional(),
  valuta: z.string().optional(),
  tassoCambio: z.number().positive().optional(),
  imponibile: z.number().nonnegative(),
  iva: z.number().nonnegative(),
  categoriaCosto: categoriaEnum.optional(),
  metodoPagamento: z.string().optional(),
  statoPagamento: pagamentoEnum.optional(),
  dataScadenza: z.string().date().optional(),
  documentoUrl: z.string().url().optional(),
  noteAmministrative: z.string().optional(),
  reverseCharge: z.boolean().optional(),
  prodottiIds: z.array(z.string().uuid()).optional(),
  materialiIds: z.array(z.string().uuid()).optional(),
})

const updateSchema = z.object({
  statoPagamento: pagamentoEnum.optional(),
  dataScadenza: z.string().date().optional(),
  noteAmministrative: z.string().optional(),
})

const associationsSchema = z.object({
  prodottiIds: z.array(z.string().uuid()),
  materialiIds: z.array(z.string().uuid()),
})

const listQuerySchema = z.object({
  statoPagamento: pagamentoEnum.optional(),
  associata: z.enum(['true', 'false']).optional(),
})

// Il client può mandare il CSV grezzo (csvContent) e lasciar contare al server, oppure
// i totali già calcolati. Almeno uno dei due percorsi deve essere presente.
const cashClosureSchema = z.object({
  mese: z.string().regex(/^\d{4}-\d{2}$/, 'formato atteso YYYY-MM'),
  totaleIncassato: z.number().nonnegative().optional(),
  numeroScontrini: z.number().int().nonnegative().optional(),
  csvContent: z.string().optional(),
  fileNome: z.string().optional(),
  note: z.string().optional(),
}).refine((d) => d.csvContent !== undefined || d.totaleIncassato !== undefined, {
  message: 'Fornire csvContent oppure totaleIncassato',
})

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function invoiceRoutes(app: FastifyInstance) {
  const read = { preHandler: [authenticate, requireModule('fatture')] }
  const write = { preHandler: [authenticate, requireModule('fatture'), requireEdit] }

  app.get('/invoices', read, async (req) => {
    const q = parse(listQuerySchema, req.query)
    return listInvoices({
      statoPagamento: q.statoPagamento,
      associata: q.associata === undefined ? undefined : q.associata === 'true',
    })
  })

  app.get('/invoices/:id', read, async (req) => {
    const { id } = req.params as { id: string }
    return getInvoice(id)
  })

  app.post('/invoices', write, async (req, reply) => {
    const created = await createInvoice(parse(createSchema, req.body), req.user!.id)
    reply.code(201)
    return created
  })

  app.patch('/invoices/:id', write, async (req) => {
    const { id } = req.params as { id: string }
    return updateInvoice(id, parse(updateSchema, req.body), req.user!.id)
  })

  app.put('/invoices/:id/associations', write, async (req) => {
    const { id } = req.params as { id: string }
    const d = parse(associationsSchema, req.body)
    return updateInvoiceAssociations(id, d.prodottiIds, d.materialiIds, req.user!.id)
  })

  // Ripartizione costi indiretti (FR-23), legata alle fatture.
  app.get('/cost-allocations', read, async () => listCostAllocations())

  // Scadenze: modulo RBAC distinto.
  app.get('/deadlines', { preHandler: [authenticate, requireModule('scadenze')] }, async () => listDeadlines())

  // Chiusura di cassa: sezione dentro Fatture (FR-41), stesso modulo RBAC.
  app.get('/cash-closures', read, async () => listCashClosures())

  app.post('/cash-closures', write, async (req, reply) => {
    const d = parse(cashClosureSchema, req.body)
    const parsedCsv = d.csvContent ? parseScontriniCsv(d.csvContent) : null
    const created = await upsertCashClosure(
      {
        mese: d.mese,
        totaleIncassato: d.totaleIncassato ?? parsedCsv?.totale ?? 0,
        numeroScontrini: d.numeroScontrini ?? parsedCsv?.numero ?? 0,
        fileNome: d.fileNome,
        note: d.note,
      },
      req.user!.id,
    )
    reply.code(201)
    return created
  })
}
