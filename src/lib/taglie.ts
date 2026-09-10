import { indiceTaglia } from './catalogo'

/**
 * Le taglie di un capo: caselle da toccare, non una riga di testo separata da virgole.
 *
 * Il campo era `"XS, S, M, L"` scritto a mano. Bastava una virgola dimenticata perché due
 * taglie diventassero una sola («S M»), e uno spazio di troppo perché «M » e «M» finissero
 * in due filtri diversi del catalogo cliente. Qui la taglia si sceglie da un elenco, e
 * l'elenco è la scala che l'azienda usa già.
 *
 * **Come si aggiunge una taglia alla scala.** Una riga in `SCALA_LETTERE`. L'ordine con cui
 * le taglie si mostrano e si ordinano resta quello di `indiceTaglia` (lib/catalogo.ts), che
 * è lo stesso usato dalle varianti: una scala sola per tutta l'app.
 */
export const SCALA_LETTERE: readonly string[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']

/**
 * Taglia unica. Il valore salvato è `TU`, che è quello che `indiceTaglia` già conosce e che
 * il censimento usa: scrivere «Taglia unica» per esteso creerebbe una taglia nuova, diversa
 * da quella dei capi già in anagrafica.
 */
export const TAGLIA_UNICA = 'TU'

/** Etichette da mostrare quando il codice salvato non si legge da solo. */
const ETICHETTE: Record<string, string> = { TU: 'Taglia unica', UNICA: 'Taglia unica' }

export function etichettaTaglia(taglia: string): string {
  return ETICHETTE[taglia.trim().toUpperCase()] ?? taglia
}

/**
 * Normalizza una taglia scritta a mano: spazi via, lettere maiuscole.
 *
 * Le maiuscole valgono solo per le taglie a lettera e per i codici brevi: una misura
 * personalizzata come «Su misura Giulia» resterebbe illeggibile urlata, quindi sopra i
 * cinque caratteri il testo si tiene com'è.
 */
export function normalizzaTaglia(valore: string): string {
  const pulito = valore.trim().replace(/\s+/g, ' ')
  if (!pulito) return ''
  return pulito.length <= 5 ? pulito.toUpperCase() : pulito
}

/** Due taglie sono la stessa se lo sono a meno di spazi e maiuscole. */
export function stessaTaglia(a: string, b: string): boolean {
  return normalizzaTaglia(a).toLowerCase() === normalizzaTaglia(b).toLowerCase()
}

export function ordinaTaglie(taglie: string[]): string[] {
  return [...taglie].sort((a, b) => indiceTaglia(a) - indiceTaglia(b))
}

/**
 * Le caselle da mostrare: la scala standard, la taglia unica, e **le taglie che i capi già
 * in anagrafica usano davvero**.
 *
 * L'ultimo pezzo è il motivo per cui questa funzione esiste. Le taglie numeriche (38, 40,
 * 42) e le misure personalizzate non stanno in nessuna scala scritta nel codice: stanno nei
 * capi. Leggerle da lì significa che una misura personalizzata creata su un capo diventa
 * una casella per tutti gli altri — che è esattamente ciò che serve, e senza una tabella
 * nuova da tenere allineata a mano.
 */
export function taglieProposte(
  taglieDeiCapi: string[],
  selezionate: string[] = [],
): string[] {
  const viste = new Map<string, string>()
  const aggiungi = (t: string) => {
    const pulita = normalizzaTaglia(t)
    if (!pulita) return
    const chiave = pulita.toLowerCase()
    if (!viste.has(chiave)) viste.set(chiave, pulita)
  }

  SCALA_LETTERE.forEach(aggiungi)
  aggiungi(TAGLIA_UNICA)
  taglieDeiCapi.forEach(aggiungi)
  // Le taglie del capo aperto ci sono sempre, anche se nessun altro capo le usa: una
  // casella che sparisce mentre la stai guardando è peggio di una casella in più.
  selezionate.forEach(aggiungi)

  return ordinaTaglie([...viste.values()])
}
