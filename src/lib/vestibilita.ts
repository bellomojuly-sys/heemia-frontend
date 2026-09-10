/**
 * Vestibilità: elenco chiuso invece di un campo libero.
 *
 * Il campo era un testo da digitare, e un testo da digitare produce «Oversize»,
 * «oversize», «over size» e «OVER» come quattro vestibilità diverse — che è il modo in
 * cui un filtro del catalogo smette di funzionare senza che nessuno se ne accorga. Le
 * voci qui sotto sono quelle già usate dai capi in anagrafica, scritte una volta sola.
 *
 * **Come si aggiunge una vestibilità.** Una riga in questo elenco, e basta: il menu la
 * mostra ovunque, perché tutti i punti dell'app leggono da qui. Non serve toccare né il
 * form né il database — la colonna resta un testo, e resta un testo di proposito: i capi
 * storici del censimento hanno valori fuori elenco e non vanno riscritti.
 */
export const VESTIBILITA: readonly string[] = [
  'Slim',
  'Regular',
  'Comoda',
  'Oversize',
  'Aderente',
  'Morbida',
]

/**
 * Le voci da mostrare nel menu, tenendo dentro il valore che il capo ha già.
 *
 * Serve perché l'elenco è chiuso ma i dati esistenti no: un capo del censimento può avere
 * «Over» o «Ampia», e aprire la modifica non deve cancellargliela in silenzio. Il valore
 * fuori elenco compare in coda, resta selezionato, e chi corregge il capo può sostituirlo
 * con una voce standard quando vuole.
 */
export function opzioniVestibilita(valoreAttuale?: string): string[] {
  const attuale = (valoreAttuale ?? '').trim()
  if (!attuale) return [...VESTIBILITA]
  const giaPresente = VESTIBILITA.some((v) => v.toLowerCase() === attuale.toLowerCase())
  return giaPresente ? [...VESTIBILITA] : [...VESTIBILITA, attuale]
}
