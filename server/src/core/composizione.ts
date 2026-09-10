/**
 * La composizione di un capo si ricava dal tessuto, non si riscrive.
 *
 * L'informazione esiste già in due posti: la tabella dei tessuti approvata dall'azienda
 * (`core/tessuti.ts`) e le righe di magazzino dei materiali, che la composizione ce l'hanno
 * in colonna. Finché il campo del capo era un testo libero, la stessa lana finiva scritta in
 * quattro modi diversi su quattro capi — e quel testo va a finire sull'etichetta di un capo
 * venduto.
 *
 * ⚠️ **Le percentuali non si inventano mai.** Un capo con due tessuti diversi (l'esterno e
 * la fodera) non ha una composizione unica che si possa ricavare sommando: la composizione
 * è in *peso*, e l'app conosce i metri. Moltiplicare metri per percentuali darebbe un numero
 * dall'aria precisa e sbagliato, stampato sull'etichetta di lavaggio di un cliente. Perciò
 * quando i tessuti sono più di uno con composizioni diverse, la funzione **elenca ciascun
 * tessuto con la sua**, e dichiara che il capo va guardato da una persona.
 */

export interface Fibra {
  percentuale: number
  nome: string
}

/** Da come si scrive una composizione a mano alle sue fibre. Tollera «-», «/», «,» e «+». */
export function leggiFibre(composizione: string | null | undefined): Fibra[] {
  if (!composizione) return []
  const fibre: Fibra[] = []
  // «80% Cotone», «80 % cotone», «80%Cotone»: il numero, il segno di percentuale, il nome
  // fino al separatore successivo o alla fine.
  const regex = /(\d+(?:[.,]\d+)?)\s*%\s*([^0-9%]+)/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(composizione)) !== null) {
    const percentuale = Number(m[1].replace(',', '.'))
    const nome = m[2].replace(/[\s\-/,+·]+$/g, '').replace(/^[\s\-/,+·]+/g, '').trim()
    if (!Number.isFinite(percentuale) || percentuale <= 0 || !nome) continue
    fibre.push({ percentuale, nome: nomeFibra(nome) })
  }
  return fibre
}

/** «cotone» → «Cotone». Solo l'iniziale: «Poliestere riciclato» non diventa «Poliestere Riciclato». */
function nomeFibra(nome: string): string {
  const pulito = nome.replace(/\s+/g, ' ').trim()
  return pulito.charAt(0).toUpperCase() + pulito.slice(1)
}

/** La forma canonica: «70% Lana / 30% Cashmere». Percentuali in ordine decrescente. */
export function formattaComposizione(fibre: Fibra[]): string {
  return [...fibre]
    .sort((a, b) => b.percentuale - a.percentuale)
    .map((f) => `${arrotondaPercentuale(f.percentuale)}% ${f.nome}`)
    .join(' / ')
}

function arrotondaPercentuale(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}

/** Riscrive una composizione qualunque nella forma canonica. Testo non riconoscibile: torna com'è. */
export function normalizzaComposizione(composizione: string | null | undefined): string {
  const fibre = leggiFibre(composizione)
  return fibre.length > 0 ? formattaComposizione(fibre) : (composizione ?? '').trim()
}

/** Due composizioni sono la stessa cosa se lo sono una volta normalizzate. */
export function stessaComposizione(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizzaComposizione(a).toLowerCase() === normalizzaComposizione(b).toLowerCase()
}

export interface TessutoDelCapo {
  /** Nome leggibile del tessuto: serve solo quando i tessuti sono più d'uno. */
  nome: string
  composizione: string | null
}

export interface ComposizioneCalcolata {
  /** Il testo pronto da salvare. Vuoto quando nessun tessuto porta una composizione. */
  composizione: string
  /** I tessuti da cui è stata ricavata: serve a spiegarlo in interfaccia. */
  fonti: string[]
  /**
   * `true` quando il capo ha più tessuti con composizioni diverse. Il testo elenca allora
   * un tessuto per volta e va confermato da una persona: l'app non sa quanto pesa ciascuno.
   */
  daConfermare: boolean
}

/**
 * La composizione di un capo dai suoi tessuti.
 *
 *   - un tessuto solo (o più tessuti che dicono la stessa cosa) → la sua composizione,
 *     riscritta nella forma canonica: è il caso normale, e si risolve da sé;
 *   - più tessuti diversi → ciascuno con la propria, separati da «·», e `daConfermare`.
 */
export function componiComposizione(tessuti: TessutoDelCapo[]): ComposizioneCalcolata {
  const conComposizione = tessuti.filter((t) => leggiFibre(t.composizione).length > 0)
  if (conComposizione.length === 0) return { composizione: '', fonti: [], daConfermare: false }

  const distinte = new Map<string, TessutoDelCapo>()
  for (const t of conComposizione) {
    const chiave = normalizzaComposizione(t.composizione).toLowerCase()
    if (!distinte.has(chiave)) distinte.set(chiave, t)
  }

  const fonti = conComposizione.map((t) => t.nome)

  if (distinte.size === 1) {
    const solo = [...distinte.values()][0]
    return { composizione: normalizzaComposizione(solo.composizione), fonti, daConfermare: false }
  }

  const elenco = [...distinte.values()]
    .map((t) => `${t.nome}: ${normalizzaComposizione(t.composizione)}`)
    .join(' · ')
  return { composizione: elenco, fonti, daConfermare: true }
}
