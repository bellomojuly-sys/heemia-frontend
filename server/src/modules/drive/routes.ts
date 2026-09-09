// Lettura delle cartelle Drive con le foto dei capi (FR-16).
// Gating: modulo "prodotti" + permesso di modifica, perché il risultato finisce
// nell'anagrafica del capo. Nessun dato esce da qui se non gli indirizzi dei file.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireModule, requireEdit } from '../../core/guards.js'
import { badRequest } from '../../core/errors.js'
import { elencaImmagini, elencaImmaginiRicorsivo } from './service.js'
import { abbinaFoto } from './abbinamento.js'
import { collegaFoto } from './collegamento.js'
import { prisma } from '../../core/prisma.js'
import { configurata } from '../../core/integrations.js'

const cartellaSchema = z.object({
  /** Link della cartella Drive, o il solo identificativo. */
  cartellaUrl: z.string().min(1, 'Manca il link della cartella'),
})

// Il collegamento definitivo NON rilegge Drive: arrivano gli abbinamenti che l'utente ha
// visto e confermato sullo schermo. Rifare la ricerca qui vorrebbe dire scrivere qualcosa
// di potenzialmente diverso da quello che è stato approvato.
const collegamentoSchema = z.object({
  abbinamenti: z
    .array(
      z.object({
        capoId: z.string().uuid(),
        urls: z.array(z.string().url()).min(1),
      }),
    )
    .min(1, 'Nessun abbinamento da salvare')
    .max(500),
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

  // Abbinamento automatico foto ↔ capi: si legge tutto il sotto-albero della cartella e si
  // riconosce il capo dal NOME DEL FILE. È una lettura sola, senza scritture: il risultato
  // è una proposta da confermare (vedi POST /drive/collega-foto).
  app.post('/drive/abbina-foto', write, async (req) => {
    const parsed = cartellaSchema.safeParse(req.body)
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    }

    const [{ immagini, cartelle, troncato }, capi] = await Promise.all([
      elencaImmaginiRicorsivo(parsed.data.cartellaUrl),
      prisma.product.findMany({
        select: { id: true, nome: true, codiceProdotto: true, immaginiUrl: true },
        orderBy: { codiceProdotto: 'asc' },
      }),
    ])

    const { proposte, nonAbbinati } = abbinaFoto(immagini, capi)
    const giaCollegate = new Map(capi.map((c) => [c.id, new Set(c.immaginiUrl ?? [])]))

    // Le foto già presenti nella scheda restano visibili nella proposta ma segnate: senza
    // questo, rilanciare l'abbinamento sembrerebbe trovare ogni volta le stesse novità.
    const conStato = proposte.map((p) => ({
      ...p,
      foto: p.foto.map((f) => ({ ...f, giaCollegata: giaCollegate.get(p.capoId)?.has(f.url) ?? false })),
    }))

    const conProposta = new Set(conStato.filter((p) => p.foto.some((f) => !f.giaCollegata)).map((p) => p.capoId))

    return {
      cartelle,
      troncato,
      totaleFoto: immagini.length,
      proposte: conStato,
      nonAbbinati,
      // La domanda che conta davvero — «quali capi restano senza anteprima» — non si legge
      // dalle proposte: si legge da chi non ne ha nessuna.
      capiSenzaFoto: capi
        .filter((c) => (c.immaginiUrl ?? []).length === 0 && !conProposta.has(c.id))
        .map((c) => ({ id: c.id, nome: c.nome, codiceProdotto: c.codiceProdotto })),
      nonPubbliche: immagini.filter((i) => !i.pubblico).length,
    }
  })

  // Conferma: scrive nell'anagrafica gli abbinamenti approvati. Aggiunge in coda alle foto
  // già collegate, senza toccarne l'ordine (la prima resta la copertina scelta a mano).
  app.post('/drive/collega-foto', write, async (req) => {
    const parsed = collegamentoSchema.safeParse(req.body)
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    }
    return collegaFoto(parsed.data.abbinamenti, req.user!.id)
  })
}
