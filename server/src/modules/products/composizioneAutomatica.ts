/**
 * La composizione di un capo, ricavata dai suoi tessuti.
 *
 * L'informazione esiste già in tre posti dell'app, e il campo del capo era il quarto — da
 * riscrivere a mano ogni volta. Qui si legge dagli altri tre, in ordine di precisione:
 *
 *   1. **I materiali della scheda tecnica.** Sono i tessuti che il capo usa davvero, con la
 *      quantità: il dato più vicino al capo.
 *   2. **I tessuti collegati al capo** in magazzino (DEC-067), quando la scheda non c'è
 *      ancora o non porta materiali.
 *   3. **La tabella dei tessuti approvata** (`core/tessuti.ts`), a partire dal nome del
 *      tessuto scritto sul capo. È già quello che succede alla creazione del capo; qui
 *      diventa anche il ripiego per i capi che un collegamento al magazzino non ce l'hanno.
 *
 * ⚠️ Solo i **tessuti**. Gli accessori (zip, bottoni, etichette) non entrano in una
 * composizione: hanno una riga in scheda come i tessuti, ma la composizione parla della
 * stoffa. Le righe con `accessoryId` restano fuori.
 */
import { prisma } from '../../core/prisma.js'
import { componiComposizione, type ComposizioneCalcolata } from '../../core/composizione.js'
import { tessutoConosciuto } from '../../core/tessuti.js'

/** Da dove è arrivata la composizione: serve a spiegarlo in interfaccia. */
export type FonteComposizione = 'scheda' | 'magazzino' | 'tabella_tessuti' | 'nessuna'

export interface ComposizioneDelCapo extends ComposizioneCalcolata {
  fonte: FonteComposizione
}

const NESSUNA: ComposizioneDelCapo = {
  composizione: '', fonti: [], daConfermare: false, fonte: 'nessuna',
}

export async function composizioneDelCapo(productId: string): Promise<ComposizioneDelCapo> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      tessuto: true,
      materials: { select: { material: { select: { nome: true, composizione: true } } } },
      technicalSheets: {
        where: { archiviata: false },
        select: {
          versione: true,
          righeMateriali: {
            // Gli accessori restano fuori: la composizione parla della stoffa.
            where: { accessoryId: null },
            orderBy: { ordine: 'asc' },
            select: { descrizione: true, material: { select: { nome: true, composizione: true } } },
          },
        },
      },
    },
  })
  if (!product) return NESSUNA

  // 1. I materiali della scheda tecnica.
  const scheda =
    product.technicalSheets.find((s) => s.versione === 'finale') ?? product.technicalSheets[0]
  const dallaScheda = (scheda?.righeMateriali ?? [])
    .filter((r) => r.material?.composizione)
    .map((r) => ({ nome: r.material!.nome || r.descrizione, composizione: r.material!.composizione }))
  if (dallaScheda.length > 0) {
    return { ...componiComposizione(dallaScheda), fonte: 'scheda' }
  }

  // 2. I tessuti collegati al capo in magazzino.
  const dalMagazzino = product.materials
    .filter((m) => m.material.composizione)
    .map((m) => ({ nome: m.material.nome, composizione: m.material.composizione }))
  if (dalMagazzino.length > 0) {
    return { ...componiComposizione(dalMagazzino), fonte: 'magazzino' }
  }

  // 3. La tabella approvata, a partire dal nome del tessuto.
  const tessuto = tessutoConosciuto(product.tessuto)
  if (tessuto) {
    return {
      ...componiComposizione([{ nome: tessuto.nome, composizione: tessuto.composizione }]),
      fonte: 'tabella_tessuti',
    }
  }

  return NESSUNA
}

/**
 * Scrive sul capo la composizione ricavata dai tessuti.
 *
 * **Non sovrascrive un testo scritto da una persona.** Il capo foderato con la composizione
 * scritta a mano resta com'è: si aggiorna solo un campo vuoto, oppure uno che dice già la
 * stessa cosa in una forma diversa (e allora è solo una riscrittura in forma canonica).
 * `forza` serve al gesto esplicito «ricava dalla scheda», che è una richiesta, non un
 * effetto collaterale.
 */
export async function applicaComposizione(
  productId: string,
  opzioni: { forza?: boolean } = {},
): Promise<ComposizioneDelCapo & { applicata: boolean }> {
  const calcolata = await composizioneDelCapo(productId)
  if (!calcolata.composizione) return { ...calcolata, applicata: false }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { composizione: true },
  })
  const attuale = (product?.composizione ?? '').trim()
  if (attuale === calcolata.composizione) return { ...calcolata, applicata: false }

  // Una composizione scritta a mano che dice altro non si tocca, a meno che non ce lo si
  // chieda: è la stessa regola dei consigli di cura.
  const daNonToccare = attuale !== '' && !opzioni.forza
  if (daNonToccare) return { ...calcolata, applicata: false }

  await prisma.product.update({ where: { id: productId }, data: { composizione: calcolata.composizione } })
  return { ...calcolata, applicata: true }
}
