// Matrice ruolo × modulo, leggibile da tutti e modificabile dall'amministratore.
//
// La lettura sta sotto il modulo «impostazioni» perché la pagina la mostra a chiunque veda
// le impostazioni: sapere cosa può fare il proprio ruolo non è un privilegio. La scrittura
// sta sotto «utenti», che è **solo admin**: dare e togliere accessi è la stessa
// responsabilità che crea e disattiva gli account, non una preferenza dell'app.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requirePermesso } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { AZIONI, MODULE_KEYS, RUOLI } from '../../core/permissions.js'
import { getMatrice, ripristinaPredefiniti, salvaMatrice } from './service.js'

const permessiSchema = z.object({
  vedere: z.boolean(),
  creare: z.boolean(),
  modificare: z.boolean(),
  eliminare: z.boolean(),
})

const salvaSchema = z.object({
  voci: z
    .array(
      z.object({
        role: z.enum(RUOLI as [string, ...string[]]),
        moduleKey: z.enum(MODULE_KEYS as [string, ...string[]]),
        permessi: permessiSchema,
      }),
    )
    .min(1, 'Nessuna modifica da salvare')
    // Una matrice completa è 5 ruoli × 20 moduli = 100 voci: il limite lascia margine e
    // chiude la porta a un corpo gonfiato apposta.
    .max(400, 'Troppe voci in una sola richiesta'),
})

export async function permissionRoutes(app: FastifyInstance) {
  const leggi = { preHandler: [authenticate, requireModule('impostazioni')] }
  const scrivi = { preHandler: [authenticate, requireModule('utenti'), requirePermesso('modificare')] }

  app.get('/permissions/matrix', leggi, async () => getMatrice())

  app.put('/permissions/matrix', scrivi, async (req) => {
    const parsed = salvaSchema.safeParse(req.body)
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    }
    return salvaMatrice(parsed.data.voci as Parameters<typeof salvaMatrice>[0], req.user!.id)
  })

  app.post('/permissions/matrix/reset', scrivi, async (req) => ripristinaPredefiniti(req.user!.id))

  // Elenco delle azioni: il client lo usa per disegnare le colonne senza tenerne una copia.
  app.get('/permissions/azioni', leggi, async () => AZIONI)
}
