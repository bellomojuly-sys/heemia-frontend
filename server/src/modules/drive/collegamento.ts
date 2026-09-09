// Scrittura degli abbinamenti confermati nell'anagrafica dei capi (FR-16, Fase 21).
//
// Separato da `service.ts` di proposito: lì si parla con Drive, qui si scrive su
// PostgreSQL. Chi conferma l'abbinamento non rilegge Drive — le proposte sono già state
// calcolate e mostrate, e rifarle significherebbe rischiare che il risultato scritto sia
// diverso da quello che l'utente ha visto sullo schermo.
//
// Due scelte che valgono la pena di essere dette:
//
//  - **Si aggiunge, non si sostituisce.** Le foto già collegate a mano restano dove sono e
//    nell'ordine in cui sono: chi ha scelto una copertina non se la vede cambiare sotto.
//    La conseguenza è che le foto abbinate arrivano in fondo; per un capo che non ne aveva
//    la prima proposta diventa comunque la copertina, che è il caso normale.
//  - **Si scrive un capo alla volta, ognuno con la sua riga di registro** (FR-18). Un
//    abbinamento di massa che tocca novanta capi in un'unica riga di log sarebbe
//    illeggibile il giorno in cui bisogna capire da dove è arrivata una foto sbagliata.
import { prisma } from '../../core/prisma.js'
import { logActivity } from '../../core/activityLog.js'

export interface AbbinamentoDaSalvare {
  capoId: string
  /** Link dei file Drive, nell'ordine in cui vanno aggiunti: il primo è la copertina. */
  urls: string[]
}

export interface EsitoCollegamento {
  capiAggiornati: number
  fotoCollegate: number
  /** Capi presenti nella richiesta ma non nel database: segnalati, non fatali. */
  capiNonTrovati: string[]
}

export async function collegaFoto(
  abbinamenti: AbbinamentoDaSalvare[],
  // `null` quando a collegare non è una persona ma uno script di migrazione: il registro
  // dice comunque cosa è cambiato, senza attribuirlo a un utente che non ha premuto niente.
  userId: string | null,
): Promise<EsitoCollegamento> {
  // La UI invia normalmente una sola riga per capo, ma l'endpoint e gli script accettano
  // un array generico. Raggruppare qui evita che due righe per lo stesso capo partano
  // entrambe dalla vecchia lista e che la seconda finisca per cancellare le foto appena
  // aggiunte dalla prima.
  const raggruppati = new Map<string, string[]>()
  for (const abbinamento of abbinamenti) {
    const urls = raggruppati.get(abbinamento.capoId) ?? []
    for (const url of abbinamento.urls) {
      if (!urls.includes(url)) urls.push(url)
    }
    raggruppati.set(abbinamento.capoId, urls)
  }

  const ids = [...raggruppati.keys()]
  const capi = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true, immaginiUrl: true },
  })
  const perId = new Map(capi.map((c) => [c.id, c]))

  let capiAggiornati = 0
  let fotoCollegate = 0
  const capiNonTrovati: string[] = []

  for (const [capoId, urls] of raggruppati) {
    const capo = perId.get(capoId)
    if (!capo) {
      capiNonTrovati.push(capoId)
      continue
    }
    const esistenti = capo.immaginiUrl ?? []
    const nuove = urls.filter((u) => !esistenti.includes(u))
    if (nuove.length === 0) continue

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: capo.id },
        data: { immaginiUrl: [...esistenti, ...nuove] },
      })
      await logActivity(tx, {
        userId,
        azione: 'update',
        entita: 'product',
        entitaId: capo.id,
        valorePrecedente: `${esistenti.length} foto`,
        valoreNuovo: `${esistenti.length + nuove.length} foto (abbinamento da Drive)`,
      })
    })
    capiAggiornati += 1
    fotoCollegate += nuove.length
  }

  return { capiAggiornati, fotoCollegate, capiNonTrovati }
}
