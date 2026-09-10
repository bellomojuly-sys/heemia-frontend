/**
 * Il prezzo di un capo non si scrive più: si calcola.
 *
 * **La regola** (Giulia, 2026-09-10). Il costo del capo sta nella scheda tecnica; il prezzo
 * di listino è quello che su quel costo lascia il margine obiettivo dell'azienda; lo
 * showroom è il listino meno il dieci per cento. Nessuno dei tre numeri va più digitato.
 *
 * **Su quale costo: solo il costo del capo** — materiali, accessori, lavorazioni, quota di
 * sviluppo. La quota di costi fissi per capo (DEC-022) **non entra nel prezzo**.
 *
 * Decisione di Giulia, 2026-09-10, presa guardando i numeri veri. La quota fissi vale oggi
 * 88,36 € a capo (39.056,99 €/anno ÷ 442 capi): calcolando il 35% sul costo pieno, un capo
 * con 21 € di costo diretto uscirebbe a 205 € contro i 60 € di listino attuale. **I prezzi
 * non si possono alzare**, quindi la base del calcolo è il solo costo del capo.
 *
 * ⚠️ **Conseguenza da conoscere, perché è visibile a schermo.** Il modulo Costi e margini
 * misura il margine come `(netto − costo diretto − quota fissi) / netto`: un capo prezzato
 * al 35% sul solo costo diretto risulterà lì **sotto soglia**, perché la quota fissi c'è e
 * il prezzo non la copre. Non è un errore di calcolo né una contraddizione da sanare
 * cambiando questa formula: è l'informazione vera, ed è la ragione per cui la quota resta
 * calcolata e continua a comparire **in Costi e margini** — l'unico posto dove serve. Nella
 * scheda del capo non si mostra: lì l'unica domanda è a quanto si vende il capo.
 *
 * **Quale margine.** Lo stesso `soglia_margine_percent` delle impostazioni, così il numero
 * obiettivo resta uno solo e cambiarlo da Impostazioni sposta insieme soglia e prezzi
 * consigliati.
 *
 * **Cosa NON fa questo modulo.** Non riscrive da solo il prezzo di un capo che ne ha già uno.
 * I 93 capi del censimento hanno prezzi decisi dall'azienda, e un ricalcolo silenzioso al
 * primo salvataggio di una scheda li cancellerebbe. Il prezzo calcolato si vede sempre, si
 * applica con un gesto esplicito (`applicaPrezziCalcolati`), e si applica da solo **solo** a
 * un capo che di prezzo non ne ha ancora — cioè al capo appena creato, che è il caso da cui
 * è nata la richiesta.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import { MARGINE_OBIETTIVO_DEFAULT, calcolaPrezzi, type PrezziCalcolati } from '../../core/prezzi.js'
import {
  SELECT_COSTO_SCHEDA, risolviCostoCapo, schedaDiRiferimento, type CostoCapo,
} from './costoScheda.js'

const r2 = (n: number) => Math.round(n * 100) / 100

export interface PrezzoConsigliato {
  productId: string
  /** Costo del capo dalla scheda tecnica, con la sua scomposizione. **È la base del prezzo.** */
  costo: CostoCapo
  /**
   * Quota di costi fissi attribuita a un capo (DEC-022). **Non entra nel prezzo**: resta qui
   * perché il modulo Costi e margini la usa, ed è lì che va mostrata — non nella scheda del capo.
   */
  quotaCostiFissi: number
  /**
   * Costo pieno = costo del capo + quota costi fissi. Calcolato e conservato, ma **non è la
   * base del prezzo**: serve a Costi e margini per dire se il capo copre anche la struttura.
   */
  costoPieno: number
  marginePercentuale: number
  /** I tre prezzi calcolati. Tutti a 0 quando il costo non è noto. */
  calcolato: PrezziCalcolati
  /** Quello che il capo ha adesso a database, per poter mostrare la differenza. */
  attuale: { prezzoVendita: number; prezzoNettoIva: number; prezzoShowroom: number }
  /** `false` quando manca il costo: senza costo non c'è prezzo, e non si inventa. */
  calcolabile: boolean
  /** Il capo ha già dei prezzi diversi da quelli calcolati: serve a proporre l'allineamento. */
  daAllineare: boolean
  /** Spiegazione pronta da mostrare quando `calcolabile` è falso. */
  motivo?: string
}

async function margineObiettivo(): Promise<number> {
  const soglia = await prisma.appSetting.findUnique({ where: { chiave: 'soglia_margine_percent' } })
  const valore = Number(soglia?.valore)
  return Number.isFinite(valore) && valore > 0 && valore < 100 ? valore : MARGINE_OBIETTIVO_DEFAULT
}

/** Quota costi fissi per capo: totale annuo diviso i capi prodotti in un anno (DEC-022). */
async function quotaCostiFissi(): Promise<number> {
  const [items, setting] = await Promise.all([
    prisma.fixedCostItem.findMany({ select: { importoAnnuo: true } }),
    prisma.appSetting.findUnique({ where: { chiave: 'capi_prodotti_annui' } }),
  ])
  const capiAnnui = Number(setting?.valore ?? 0)
  if (!(capiAnnui > 0)) return 0
  const totale = items.reduce((s, i) => s + Number(i.importoAnnuo), 0)
  return r2(totale / capiAnnui)
}

/** Il prezzo consigliato di un capo, senza salvarlo. */
export async function prezzoConsigliato(productId: string): Promise<PrezzoConsigliato> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      prezzoVendita: true,
      prezzoNettoIva: true,
      prezzoShowroom: true,
      costoDirettoRiferimento: true,
      technicalSheets: { where: { archiviata: false }, select: { versione: true, ...SELECT_COSTO_SCHEDA } },
    },
  })
  if (!product) throw notFound('Prodotto non trovato')

  const [margine, quota] = await Promise.all([margineObiettivo(), quotaCostiFissi()])
  const costo = risolviCostoCapo(schedaDiRiferimento(product.technicalSheets), product.costoDirettoRiferimento)
  // Il prezzo nasce dal **solo costo del capo**: la quota fissi è calcolata qui accanto ma
  // non entra: vedi la nota in cima al file.
  //
  // ⚠️ Senza il costo del capo **non si calcola niente**, nemmeno un numero da mostrare a
  // parte: «zero» e «non lo so» non sono la stessa risposta (DEC-066).
  const costoPieno = costo.costoNoto ? r2(costo.costoDiretto + quota) : 0
  const calcolato = costo.costoNoto
    ? calcolaPrezzi(costo.costoDiretto, margine)
    : { costoTotale: 0, marginePercentuale: margine, prezzoNettoIva: 0, prezzoVendita: 0, prezzoShowroom: 0 }

  const attuale = {
    prezzoVendita: Number(product.prezzoVendita),
    prezzoNettoIva: Number(product.prezzoNettoIva),
    prezzoShowroom: Number(product.prezzoShowroom),
  }
  const calcolabile = costo.costoNoto && calcolato.prezzoVendita > 0

  return {
    productId: product.id,
    costo,
    quotaCostiFissi: quota,
    costoPieno,
    marginePercentuale: margine,
    calcolato,
    attuale,
    calcolabile,
    daAllineare:
      calcolabile &&
      (attuale.prezzoVendita !== calcolato.prezzoVendita || attuale.prezzoShowroom !== calcolato.prezzoShowroom),
    motivo: calcolabile
      ? undefined
      : costo.costoNoto
        ? 'Il costo del capo è zero: senza costo non c’è un prezzo da calcolare.'
        : 'Il costo del capo non è ancora noto. Compila i materiali e le voci di costo nella scheda tecnica, oppure il costo di riferimento.',
  }
}

/**
 * Scrive sul capo i prezzi calcolati. È un gesto esplicito, per la ragione scritta in cima
 * al file: un capo che un prezzo ce l'ha già non se lo vede cambiare da solo.
 *
 * `soloSeMancante` è la sola eccezione, e serve al capo appena creato: applica il calcolo
 * unicamente se il capo non ha ancora nessun prezzo. Un capo con un prezzo resta com'è.
 */
export async function applicaPrezziCalcolati(
  productId: string,
  userId: string,
  opzioni: { soloSeMancante?: boolean } = {},
): Promise<PrezzoConsigliato & { applicato: boolean }> {
  const consigliato = await prezzoConsigliato(productId)
  if (!consigliato.calcolabile) return { ...consigliato, applicato: false }
  if (opzioni.soloSeMancante && consigliato.attuale.prezzoVendita > 0) {
    return { ...consigliato, applicato: false }
  }
  if (!consigliato.daAllineare) return { ...consigliato, applicato: false }

  const { prezzoVendita, prezzoNettoIva, prezzoShowroom } = consigliato.calcolato
  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: {
        prezzoVendita: new Prisma.Decimal(prezzoVendita),
        prezzoNettoIva: new Prisma.Decimal(prezzoNettoIva),
        prezzoShowroom: new Prisma.Decimal(prezzoShowroom),
        // Il «consigliato» è il listino: da quando il prezzo si calcola, non c'è più un
        // secondo numero suggerito a parte da quello che si applica davvero.
        prezzoConsigliato: new Prisma.Decimal(prezzoVendita),
      },
    })
    await logActivity(tx, {
      userId,
      azione: 'prezzo_calcolato',
      entita: 'product',
      entitaId: productId,
      valorePrecedente: `${consigliato.attuale.prezzoVendita.toFixed(2)} €`,
      valoreNuovo: `${prezzoVendita.toFixed(2)} € (costo capo ${consigliato.costo.costoDiretto.toFixed(2)} €, margine ${consigliato.marginePercentuale}%)`,
    })
  })

  return {
    ...consigliato,
    attuale: { prezzoVendita, prezzoNettoIva, prezzoShowroom },
    daAllineare: false,
    applicato: true,
  }
}
