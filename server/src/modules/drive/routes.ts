// Lettura delle cartelle Drive con le foto dei capi (FR-16).
// Gating: modulo "prodotti" + permesso di modifica, perché il risultato finisce
// nell'anagrafica del capo. Nessun dato esce da qui se non gli indirizzi dei file.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { elencaImmagini } from './service.js'
import { configurata } from '../../core/integrations.js'

const cartellaSchema = z.object({
  /** Link della cartella Drive, o il solo identificativo. */
  cartellaUrl: z.string().min(1, 'Manca il link della cartella'),
})

export async function driveRoutes(app: FastifyInstance) {
  const write = { preHandler: [authenticate, requireModule('prodotti'), requireEdit] }

  // Stato: permette all'interfaccia di proporre "importa da cartella" solo quando funziona,
  // invece di offrire un pulsante che risponderebbe con un errore.
  app.get('/drive/status', { preHandler: [authenticate, requireModule('prodotti')] }, async () => ({
    configurato: configurata('drive'),
  }))

  app.post('/drive/folder-images', write, async (req) => {
    const parsed = cartellaSchema.safeParse(req.body)
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    }
    const immagini = await elencaImmagini(parsed.data.cartellaUrl)
    return {
      immagini,
      // Le foto private si collegano lo stesso, ma resterebbero un riquadro vuoto: meglio
      // dirlo qui, una volta, che lasciarlo scoprire capo per capo.
      nonPubbliche: immagini.filter((i) => !i.pubblico).length,
    }
  })
}
