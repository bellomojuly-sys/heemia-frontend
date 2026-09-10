/**
 * Costo unitario di un capo, letto dalla sua scheda tecnica — **sul server**.
 *
 * Perché esiste. Il conto c'era già, ma solo nel browser (`src/lib/sheetCost.ts`): la scheda
 * tecnica salva le righe dei materiali e le voci di costo, e il totale lo ricavava la pagina
 * mentre la si guardava. Finché serviva a disegnare una tabella andava bene; dal momento in
 * cui da quel numero **nasce il prezzo di vendita**, non può più stare solo lì. Un prezzo
 * deciso dal browser è un prezzo che due browser diversi possono calcolare in modo diverso,
 * e che l'API non è in grado di verificare.
 *
 * Le formule sono le stesse, riga per riga, di `src/lib/sheetCost.ts` (spec §3-§5):
 *
 *   - materiale:            quantità × costo unitario × (1 + scarto%)
 *                           quantità = quella confermata a mano, o quella suggerita
 *   - costo diretto:        l'importo per intero
 *   - costo ammortizzato:   importo ÷ capi previsti
 *   - il packaging non è un accessorio: la velina e la scatola stanno *intorno* al capo, e
 *     lo dice la colonna `destinazione` dell'accessorio.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../../core/prisma.js'

const r2 = (n: number) => Math.round(n * 100) / 100

/** Da dove viene il costo: serve a dire in interfaccia quanto ci si può fidare del numero. */
export type FonteCostoCapo = 'scheda_righe' | 'scheda_voci' | 'censimento' | 'sconosciuto'

export interface CostoCapo {
  /** Somma delle voci dirette del capo (materiali, accessori, lavorazioni, quota sviluppo, altri). */
  costoDiretto: number
  costoMateriali: number
  costoAccessori: number
  costoLavorazioni: number
  quotaSviluppo: number
  altriCosti: number
  fonte: FonteCostoCapo
  /** `false` quando nessuna fonte sa dirlo: i numeri qui sopra non vanno mostrati come risultato. */
  costoNoto: boolean
}

const VUOTO: CostoCapo = {
  costoDiretto: 0, costoMateriali: 0, costoAccessori: 0, costoLavorazioni: 0,
  quotaSviluppo: 0, altriCosti: 0, fonte: 'sconosciuto', costoNoto: false,
}

/** A quale bucket del riepilogo appartiene ogni voce di costo (gemello di VOCE_GRUPPO nel client). */
const GRUPPO_VOCE: Record<string, 'accessori' | 'lavorazioni' | 'altri'> = {
  accessori: 'accessori',
  lavorazioni: 'lavorazioni',
  taglio: 'lavorazioni',
  confezione: 'lavorazioni',
  ricamo_stampa: 'lavorazioni',
  logistica: 'altri',
  altro: 'altri',
  sviluppo_modello: 'altri',
  disegno: 'altri',
  scheda_tecnica: 'altri',
  prototipazione: 'altri',
}

type RigaMateriale = {
  quantitaSuggerita: Prisma.Decimal
  quantitaConfermata: Prisma.Decimal | null
  percentualeScarto: Prisma.Decimal
  costoUnitario: Prisma.Decimal
  accessoryId: string | null
  accessory: { destinazione: string } | null
}

type RigaCosto = {
  voce: string
  importo: Prisma.Decimal
  kind: string
  ammortizzabile: boolean
  quantitaPrevista: number | null
}

type SchedaPerCosto = {
  quantitaPrevistaProduzione: number | null
  costoTessuto: Prisma.Decimal
  costoAccessori: Prisma.Decimal
  costoManodopera: Prisma.Decimal
  costoPackaging: Prisma.Decimal
  altriCostiDiretti: Prisma.Decimal
  righeMateriali: RigaMateriale[]
  righeCosti: RigaCosto[]
}

/** Cosa serve leggere da `technical_sheets` per calcolare il costo. Esportato per riusarlo nelle query. */
export const SELECT_COSTO_SCHEDA = {
  quantitaPrevistaProduzione: true,
  costoTessuto: true,
  costoAccessori: true,
  costoManodopera: true,
  costoPackaging: true,
  altriCostiDiretti: true,
  righeMateriali: {
    select: {
      quantitaSuggerita: true,
      quantitaConfermata: true,
      percentualeScarto: true,
      costoUnitario: true,
      accessoryId: true,
      accessory: { select: { destinazione: true } },
    },
  },
  righeCosti: {
    select: { voce: true, importo: true, kind: true, ammortizzabile: true, quantitaPrevista: true },
  },
} satisfies Prisma.TechnicalSheetSelect

/**
 * Costo dalle righe strutturate della scheda. Restituisce `null` quando la scheda non ne ha:
 * una scheda senza righe non costa zero, semplicemente non lo dice — e la differenza fra
 * «zero» e «non lo so» è tutta la ragione per cui questo modulo esiste (DEC-066).
 */
function dalleRighe(sheet: SchedaPerCosto): CostoCapo | null {
  if (sheet.righeMateriali.length === 0 && sheet.righeCosti.length === 0) return null

  let materiali = 0
  let accessori = 0
  let lavorazioni = 0
  let sviluppo = 0
  let altri = 0

  for (const m of sheet.righeMateriali) {
    const qta = Number(m.quantitaConfermata ?? m.quantitaSuggerita)
    const scarto = Math.max(0, Number(m.percentualeScarto))
    const costo = r2(qta * Number(m.costoUnitario) * (1 + scarto / 100))
    if (!m.accessoryId) materiali += costo
    else if (m.accessory?.destinazione === 'packaging') altri += costo
    else accessori += costo
  }

  for (const c of sheet.righeCosti) {
    const ammortizzato = c.ammortizzabile || c.kind === 'sviluppo_ammortizzato'
    const divisore = ammortizzato
      ? Math.max(1, c.quantitaPrevista ?? sheet.quantitaPrevistaProduzione ?? 1)
      : 1
    const costo = r2(Number(c.importo) / divisore)
    if (ammortizzato) sviluppo += costo
    else if (GRUPPO_VOCE[c.voce] === 'accessori') accessori += costo
    else if (GRUPPO_VOCE[c.voce] === 'lavorazioni') lavorazioni += costo
    else altri += costo
  }

  const costoDiretto = r2(materiali + accessori + lavorazioni + sviluppo + altri)
  // Righe che sommano a zero (costi non ancora valorizzati) non sono un costo noto.
  if (costoDiretto <= 0) return null

  return {
    costoDiretto,
    costoMateriali: r2(materiali),
    costoAccessori: r2(accessori),
    costoLavorazioni: r2(lavorazioni),
    quotaSviluppo: r2(sviluppo),
    altriCosti: r2(altri),
    fonte: 'scheda_righe',
    costoNoto: true,
  }
}

/** Costo dai cinque campi «piatti» della scheda, com'era prima delle righe strutturate. */
function dalleVociPiatte(sheet: SchedaPerCosto): CostoCapo | null {
  const materiali = Number(sheet.costoTessuto)
  const accessori = Number(sheet.costoAccessori)
  const lavorazioni = Number(sheet.costoManodopera)
  const altri = Number(sheet.costoPackaging) + Number(sheet.altriCostiDiretti)
  const costoDiretto = r2(materiali + accessori + lavorazioni + altri)
  if (costoDiretto <= 0) return null
  return {
    costoDiretto,
    costoMateriali: r2(materiali),
    costoAccessori: r2(accessori),
    costoLavorazioni: r2(lavorazioni),
    quotaSviluppo: 0,
    altriCosti: r2(altri),
    fonte: 'scheda_voci',
    costoNoto: true,
  }
}

/**
 * Il costo diretto di un capo, scegliendo fra le fonti possibili in ordine di precisione.
 *
 *   1. **Le righe della scheda** — hanno la scomposizione e la tracciabilità: sono il dato migliore.
 *   2. **Le cinque voci piatte** della scheda, per le schede scritte prima delle righe.
 *   3. **Il costo di riferimento del censimento** — un numero unico senza scomposizione, ma vero.
 *   4. Altrimenti **non lo sappiamo**, e va detto (DEC-066).
 *
 * Il passaggio da una fonte all'altra avviene da sé: appena qualcuno compila le righe, la
 * loro somma supera zero e vincono loro. Nessun interruttore da ricordarsi.
 */
export function risolviCostoCapo(
  sheet: SchedaPerCosto | undefined,
  costoDirettoRiferimento: Prisma.Decimal | null,
): CostoCapo {
  if (sheet) {
    const righe = dalleRighe(sheet)
    if (righe) return righe
    const piatte = dalleVociPiatte(sheet)
    if (piatte) return piatte
  }
  if (costoDirettoRiferimento !== null) {
    const costo = r2(Number(costoDirettoRiferimento))
    return { ...VUOTO, costoDiretto: costo, fonte: 'censimento', costoNoto: true }
  }
  return VUOTO
}

/** La scheda da cui leggere il costo: la «finale» se c'è, altrimenti la prima non archiviata. */
export function schedaDiRiferimento<T extends { versione: string }>(schede: T[]): T | undefined {
  return schede.find((s) => s.versione === 'finale') ?? schede[0]
}

/** Costo di un capo, letto direttamente dal database. */
export async function costoCapo(productId: string): Promise<CostoCapo> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      costoDirettoRiferimento: true,
      technicalSheets: { where: { archiviata: false }, select: { versione: true, ...SELECT_COSTO_SCHEDA } },
    },
  })
  if (!product) return VUOTO
  return risolviCostoCapo(schedaDiRiferimento(product.technicalSheets), product.costoDirettoRiferimento)
}
