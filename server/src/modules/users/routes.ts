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
import { authenticate, requireEdit, requireModule, requirePermesso } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import {
  RUOLI_INTERNI, changeOwnPassword, checkUserDeletion, createUser, deleteUser, listUsers,
  resetPassword, updateUser,
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
  // Lettura dell'elenco; le scritture aggiungono `requireEdit`, che dal 2026-09-07
  // controlla il permesso puntuale (creare / modificare / eliminare) sul modulo dichiarato
  // da `requireModule`, non più un generico «il ruolo può scrivere».
  const admin = { preHandler: [authenticate, requireModule('utenti')] }
  const scrivi = { preHandler: [authenticate, requireModule('utenti'), requireEdit] }

  app.get('/users', admin, async () => listUsers())

  app.post('/users', scrivi, async (req, reply) => {
    const creato = await createUser(parse(createSchema, req.body), req.user!.id)
    reply.code(201)
    return creato
  })

  app.patch('/users/:id', scrivi, async (req) => {
    const { id } = req.params as { id: string }
    return updateUser(id, parse(updateSchema, req.body), req.user!.id)
  })

  // Cosa si perde eliminando: la conferma a schermo deve poterlo dire prima. Sta sotto il
  // permesso «eliminare» e non sotto la sola lettura, perché è la domanda che si fa solo
  // chi sta per cancellare.
  const elimina = { preHandler: [authenticate, requireModule('utenti'), requirePermesso('eliminare')] }

  app.get('/users/:id/deletion-check', elimina, async (req) => {
    const { id } = req.params as { id: string }
    return checkUserDeletion(id, req.user!.id)
  })

  // `?conferma=storico` è il secondo sì, richiesto quando l'account ha firmato qualcosa.
  // Le protezioni che NON si possono aggirare con un parametro — il proprio account e
  // l'ultimo amministratore attivo — stanno nel servizio e rispondono 409.
  app.delete('/users/:id', elimina, async (req) => {
    const { id } = req.params as { id: string }
    const { conferma } = req.query as { conferma?: string }
    return deleteUser(id, req.user!.id, { confermaStorico: conferma === 'storico' })
  })

  // Reimpostazione da amministratore: non chiede la password attuale (chi la reimposta è
  // proprio chi non la conosce) e chiude tutte le sessioni dell'utente.
  app.post('/users/:id/password', scrivi, async (req) => {
    const { id } = req.params as { id: string }
    return resetPassword(id, parse(resetSchema, req.body).password, req.user!.id)
  })

  // Cambio della propria password: qualunque ruolo, sessione valida, password attuale.
  app.post('/auth/change-password', { preHandler: authenticate }, async (req) => {
    return changeOwnPassword(req.user!.id, req.user!.sessionId, parse(changeSchema, req.body))
  })
}
