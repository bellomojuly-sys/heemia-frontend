/**
 * Regole di prezzo.
 *
 * ---------------------------------------------------------------------------------------
 * Storia, perché la regola è cambiata e la vecchia va riconosciuta quando si rilegge il codice.
 *
 * **Fino al 2026-09-10.** L'azienda aveva un solo prezzo deciso a mano — quello di showroom
 * — e il prezzo del sito era showroom +10%, calcolato invece che salvato.
 *
 * **Da oggi.** Nessuno dei due si decide a mano. Il prezzo nasce dal **costo del capo** che
 * sta nella scheda tecnica e dal margine che l'azienda vuole tenere; lo showroom è il prezzo
 * di listino meno il dieci per cento. La direzione del calcolo si è quindi invertita: prima
 * il listino nasceva dallo showroom, adesso lo showroom nasce dal listino.
 * ---------------------------------------------------------------------------------------
 *
 * Le stesse formule esistono sul server (`server/src/core/prezzi.ts`), che è l'autorità: qui
 * servono a mostrare il numero mentre si compila, non a decidere cosa viene salvato.
 */

/** Margine obiettivo predefinito. La soglia vera arriva dal server, che la legge dalle impostazioni. */
export const MARGINE_OBIETTIVO_DEFAULT = 35

/** Lo showroom costa il dieci per cento in meno del prezzo di listino. */
export const SCONTO_SHOWROOM = 0.1

/** IVA ordinaria italiana: i prezzi mostrati al cliente la comprendono, i margini no. */
export const IVA = 0.22

function arrotonda(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Prezzo netto che lascia il margine voluto sul costo del capo.
 *
 * **Margine, non ricarico.** Il margine è la quota del *prezzo* che resta dopo il costo:
 * `margine% = (prezzo − costo) / prezzo`. Girata, dà `prezzo = costo / (1 − margine)`.
 * Il conto sbagliato — e quello che viene in mente per primo — è `costo × 1,35`: su un capo
 * da 65 € darebbe 87,75 €, che lascia un margine del 25,9%, non del 35%. La formula giusta
 * dà 100 €. Su una collezione intera la differenza è il conto economico dell'anno.
 */
export function prezzoDaMargine(costoTotale: number, marginePercentuale: number): number {
  if (!Number.isFinite(costoTotale) || costoTotale <= 0) return 0
  const margine = marginePercentuale / 100
  // Un margine del 100% vorrebbe un prezzo infinito: si rifiuta invece di restituire Infinity.
  if (!Number.isFinite(margine) || margine <= 0 || margine >= 1) return 0
  return arrotonda(costoTotale / (1 - margine))
}

/** Dal netto al prezzo esposto, IVA compresa. */
export function conIva(prezzoNetto: number): number {
  if (!Number.isFinite(prezzoNetto) || prezzoNetto <= 0) return 0
  return arrotonda(prezzoNetto * (1 + IVA))
}

/** Dal prezzo esposto al netto su cui si misura il margine. */
export function senzaIva(prezzoConIva: number): number {
  if (!Number.isFinite(prezzoConIva) || prezzoConIva <= 0) return 0
  return arrotonda(prezzoConIva / (1 + IVA))
}

/**
 * Prezzo di showroom: il listino meno il dieci per cento.
 * Senza listino non c'è showroom — si restituisce 0, che le viste mostrano come «–» invece
 * di inventare un numero.
 */
export function prezzoShowroomDa(prezzoListino: number): number {
  if (!Number.isFinite(prezzoListino) || prezzoListino <= 0) return 0
  return arrotonda(prezzoListino * (1 - SCONTO_SHOWROOM))
}

export interface PrezziCalcolati {
  /** Costo unitario completo del capo su cui è stato fatto il conto. */
  costoTotale: number
  marginePercentuale: number
  /** Netto IVA: è il numero su cui il modulo Costi e margini misura il margine. */
  prezzoNettoIva: number
  /** Prezzo di listino, IVA compresa. È il prezzo «standard» del capo. */
  prezzoVendita: number
  /** Listino −10%. */
  prezzoShowroom: number
}

/** Tutti e tre i prezzi da costo e margine, in un colpo solo. */
export function calcolaPrezzi(costoTotale: number, marginePercentuale: number): PrezziCalcolati {
  const prezzoNettoIva = prezzoDaMargine(costoTotale, marginePercentuale)
  const prezzoVendita = conIva(prezzoNettoIva)
  return {
    costoTotale: arrotonda(costoTotale),
    marginePercentuale,
    prezzoNettoIva,
    prezzoVendita,
    prezzoShowroom: prezzoShowroomDa(prezzoVendita),
  }
}
