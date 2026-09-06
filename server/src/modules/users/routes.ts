// Utenti del gestionale (Fase 15.2). Modulo RBAC "utenti": **solo admin**.
//
// Il CEO ne è fuori di proposito: dare e togliere accessi è amministrazione del sistema, non
// direzione dell'azienda, e finora la matrice non aveva mai dovuto dirlo perché la funzione
// non esisteva. Se un giorno serve aprirlo, la riga da cambiare è una sola, in
// core/permissions.ts (e la gemella in src/lib/permissions.ts).
//
// Il cambio della propria password sta invece sotto /auth: non richiede il modulo "utenti",
// perché chiunque abbia un accesso deve poter cambiare la propria password — viewer compreso.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import {
  RUOLI_INTERNI, changeOwnPassword, createUser, listUsers, resetPassword, updateUser,
} from './service.js'

const ruoloSchema = z.enum(RUOLI_INTERNI)

const createSchema = z.object({
  nome: z.string().min(1, 'Il nome è obbligatorio').max(120),
  email: z.string().email('Indirizzo email non valido'),
  role: ruoloSchema,
  password: z.string().min(1, 'La password è obbligatoria').max(200),
})

const updateSchema = z.object({
  nome: z.string().min(1).max(120).optional(),
  role: ruoloSchema.optional(),
  attivo: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Nessuna modifica indicata' })

const resetSchema = z.object({
  password: z.string().min(1, 'La password è obbligatoria').max(200),
})

const changeSchema = z.object({
  passwordAttuale: z.string().min(1, 'Serve la password attuale').max(200),
  passwordNuova: z.string().min(1, 'Serve la nuova password').max(200),
})

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body)
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export async function userRoutes(app: FastifyInstance) {
  const admin = { preHandler: [authenticate, requireModule('utenti')] }

  app.get('/users', admin, async () => listUsers())

  app.post('/users', admin, async (req, reply) => {
    const creato = await createUser(parse(createSchema, req.body), req.user!.id)
    reply.code(201)
    return creato
  })

  app.patch('/users/:id', admin, async (req) => {
    const { id } = req.params as { id: string }
    return updateUser(id, parse(updateSchema, req.body), req.user!.id)
  })

  // Reimpostazione da amministratore: non chiede la password attuale (chi la reimposta è
  // proprio chi non la conosce) e chiude tutte le sessioni dell'utente.
  app.post('/users/:id/password', admin, async (req) => {
    const { id } = req.params as { id: string }
    return resetPassword(id, parse(resetSchema, req.body).password, req.user!.id)
  })

  // Cambio della propria password: qualunque ruolo, sessione valida, password attuale.
  app.post('/auth/change-password', { preHandler: authenticate }, async (req) => {
    return changeOwnPassword(req.user!.id, req.user!.sessionId, parse(changeSchema, req.body))
  })
}
