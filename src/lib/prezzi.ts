/**
 * Regole di prezzo (decisione di Giulia, 2026-08-13).
 *
 * L'azienda ha **un solo prezzo deciso a mano**: quello di showroom, che è il prezzo
 * ufficiale del capo. Il prezzo dell'e-commerce non si inserisce e non si censisce: è
 * sempre lo showroom più il dieci per cento.
 *
 * Perché calcolarlo invece di salvarlo. Un secondo numero a database sarebbe una copia,
 * e le copie divergono: basta ritoccare lo showroom e dimenticare l'altro campo perché
 * il sito resti al prezzo vecchio senza che nessuno se ne accorga. Calcolandolo, la
 * regola vale sempre e cambiare il prezzo di listino aggiorna il sito da sé.
 */

/** Maggiorazione dell'e-commerce sul prezzo di showroom. */
export const MAGGIORAZIONE_SITO = 0.1

/**
 * Prezzo del sito a partire da quello di showroom, arrotondato al centesimo.
 * Senza prezzo di showroom non c'è prezzo sito: si restituisce 0, che le viste
 * mostrano come «–» invece di inventare un numero.
 */
export function prezzoSito(prezzoShowroom: number): number {
  if (!Number.isFinite(prezzoShowroom) || prezzoShowroom <= 0) return 0
  return Math.round(prezzoShowroom * (1 + MAGGIORAZIONE_SITO) * 100) / 100
}
