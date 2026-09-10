/**
 * Regole di prezzo — **l'autorità**. Il gemello nel browser (`src/lib/prezzi.ts`) mostra il
 * numero mentre si compila; quello che finisce a database lo decide questo file.
 *
 * ---------------------------------------------------------------------------------------
 * La regola, e perché è cambiata (2026-09-10).
 *
 * Prima l'azienda decideva a mano il prezzo di showroom e il sito era showroom +10%. Adesso
 * **nessuno dei due si scrive**: il prezzo nasce dal costo del capo che sta nella scheda
 * tecnica e dal margine che l'azienda vuole tenere, e lo showroom è il listino −10%. La
 * direzione del calcolo si è invertita — prima il listino nasceva dallo showroom, ora è lo
 * showroom a nascere dal listino.
 * ---------------------------------------------------------------------------------------
 *
 * ⚠️ **Margine, non ricarico.** Il margine è la quota del *prezzo* che resta dopo il costo:
 *
 *     margine% = (prezzo − costo) / prezzo      →      prezzo = costo / (1 − margine)
 *
 * Il conto che viene in mente per primo — `costo × 1,35` — è un *ricarico* del 35% e lascia
 * un margine del 25,9%. Su un capo da 65 € di costo: la formula giusta dà 100 € di netto,
 * quella sbagliata 87,75 €. Sono 12 € a capo che non tornano più, moltiplicati per la
 * collezione. È lo stesso margine che il modulo Costi e margini misura per dire se un capo
 * è sotto soglia, quindi le due cose devono usare la stessa definizione o l'app si
 * contraddice da sola.
 */

/** Lo showroom costa il dieci per cento in meno del prezzo di listino. */
export const SCONTO_SHOWROOM = 0.1

/** IVA ordinaria italiana: i prezzi esposti la comprendono, i margini si misurano al netto. */
export const IVA = 0.22

/**
 * Margine obiettivo predefinito, in percentuale. È lo stesso 35 della soglia sotto la quale
 * il modulo margini segnala un capo: il valore vero si legge dall'impostazione
 * `soglia_margine_percent`, e questo è solo il ripiego quando l'impostazione non c'è.
 */
export const MARGINE_OBIETTIVO_DEFAULT = 35

const r2 = (n: number) => Math.round(n * 100) / 100

/** Prezzo netto che lascia il margine voluto sul costo. Vedi la nota «margine, non ricarico». */
export function prezzoDaMargine(costoTotale: number, marginePercentuale: number): number {
  if (!Number.isFinite(costoTotale) || costoTotale <= 0) return 0
  const margine = marginePercentuale / 100
  // Un margine del 100% vorrebbe un prezzo infinito, uno negativo un prezzo sotto il costo:
  // in entrambi i casi si restituisce 0, che chi chiama legge come «non calcolabile».
  if (!Number.isFinite(margine) || margine <= 0 || margine >= 1) return 0
  return r2(costoTotale / (1 - margine))
}

export function conIva(prezzoNetto: number): number {
  if (!Number.isFinite(prezzoNetto) || prezzoNetto <= 0) return 0
  return r2(prezzoNetto * (1 + IVA))
}

export function senzaIva(prezzoConIva: number): number {
  if (!Number.isFinite(prezzoConIva) || prezzoConIva <= 0) return 0
  return r2(prezzoConIva / (1 + IVA))
}

/** Prezzo di showroom: il listino meno il dieci per cento. */
export function prezzoShowroomDa(prezzoListino: number): number {
  if (!Number.isFinite(prezzoListino) || prezzoListino <= 0) return 0
  return r2(prezzoListino * (1 - SCONTO_SHOWROOM))
}

export interface PrezziCalcolati {
  costoTotale: number
  marginePercentuale: number
  /** Netto IVA: il numero su cui si misura il margine. */
  prezzoNettoIva: number
  /** Listino IVA compresa — il prezzo «standard» del capo. */
  prezzoVendita: number
  /** Listino −10%. */
  prezzoShowroom: number
}

export function calcolaPrezzi(costoTotale: number, marginePercentuale: number): PrezziCalcolati {
  const prezzoNettoIva = prezzoDaMargine(costoTotale, marginePercentuale)
  const prezzoVendita = conIva(prezzoNettoIva)
  return {
    costoTotale: r2(costoTotale),
    marginePercentuale,
    prezzoNettoIva,
    prezzoVendita,
    prezzoShowroom: prezzoShowroomDa(prezzoVendita),
  }
}
