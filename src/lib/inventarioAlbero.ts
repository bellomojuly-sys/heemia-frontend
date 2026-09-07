// L'inventario dei prodotti finiti letto come un albero invece che come una tabella.
//
// **Il problema.** Le giacenze sono per variante: 828 righe, una per SKU, ciascuna con
// tredici colonne. Ogni riga è corretta e utile quando si lavora su quella variante, ma
// per rispondere alla domanda più comune di tutte — «quanti Amalfi abbiamo, e di che
// colore?» — bisogna scorrere ottocento righe e sommare a mente.
//
// **La forma.** Prodotto → variante/colore → taglia → quantità per ubicazione. È la stessa
// gerarchia con cui i capi stanno fisicamente in magazzino, ed è quella che permette di
// fermarsi al livello che serve: il totale del capo, il totale del colore, oppure la
// singola taglia.
//
// **Cosa NON fa.** Non tocca i dati e non ne perde: ogni foglia dell'albero è esattamente
// un `InventoryRecord`, con tutti i suoi campi (soglia di laboratorio compresa). I totali
// dei livelli superiori sono somme calcolate qui, non valori scritti da qualche parte: se
// una variante cambia, il totale del colore e del capo cambiano con lei.
//
// Logica pura, senza React: riceve i dati che il DataStore ha preso dal server.

import type { InventoryRecord, Product, ProductVariant } from '../types'
import { indiceTaglia } from './catalogo'

/** Una taglia: la foglia dell'albero. Porta con sé il record intero, non una sua copia. */
export interface NodoTaglia {
  taglia: string
  variante: ProductVariant
  record: InventoryRecord
}

export interface NodoColore {
  colore: string
  taglie: NodoTaglia[]
  totali: Totali
}

export interface NodoProdotto {
  prodotto: Product
  colori: NodoColore[]
  totali: Totali
  /** Quante varianti stanno sotto: dice se conviene aprire. */
  varianti: number
}

export interface Totali {
  magazzino: number
  laboratorio: number
  inLavorazione: number
  riservato: number
  venduto: number
  disponibile: number
  /** Varianti esaurite o sotto la soglia minima. */
  daVerificare: number
  /** Varianti con la scorta di laboratorio sotto soglia: è l'alert «Soglia lab». */
  daReintegrare: number
  /** Varianti con la distribuzione iniziale ancora da confermare (FR-49). */
  daDistribuire: number
}

const VUOTI: Totali = {
  magazzino: 0, laboratorio: 0, inLavorazione: 0, riservato: 0, venduto: 0,
  disponibile: 0, daVerificare: 0, daReintegrare: 0, daDistribuire: 0,
}

function sommaRecord(t: Totali, r: InventoryRecord): Totali {
  return {
    magazzino: t.magazzino + r.qtaMagazzino,
    laboratorio: t.laboratorio + r.qtaLaboratorio,
    inLavorazione: t.inLavorazione + r.qtaInProduzione,
    riservato: t.riservato + r.qtaRiservata,
    venduto: t.venduto + r.qtaVenduta,
    disponibile: t.disponibile + r.disponibileTotale,
    daVerificare: t.daVerificare + (r.stato === 'esaurito' || r.stato === 'low_stock' ? 1 : 0),
    daReintegrare: t.daReintegrare + (r.laboratorioSottoSoglia ? 1 : 0),
    daDistribuire: t.daDistribuire + (r.migrazioneCompletata ? 0 : 1),
  }
}

export function sommaTotali(elenco: Totali[]): Totali {
  return elenco.reduce(
    (a, b) => ({
      magazzino: a.magazzino + b.magazzino,
      laboratorio: a.laboratorio + b.laboratorio,
      inLavorazione: a.inLavorazione + b.inLavorazione,
      riservato: a.riservato + b.riservato,
      venduto: a.venduto + b.venduto,
      disponibile: a.disponibile + b.disponibile,
      daVerificare: a.daVerificare + b.daVerificare,
      daReintegrare: a.daReintegrare + b.daReintegrare,
      daDistribuire: a.daDistribuire + b.daDistribuire,
    }),
    VUOTI,
  )
}

const perTesto = (a: string, b: string) => a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' })

/**
 * Costruisce l'albero. I record senza variante o senza prodotto non spariscono: finiscono
 * sotto un capo segnaposto, perché una giacenza orfana è un'anomalia da vedere, non da
 * nascondere.
 */
export function costruisciAlbero(
  records: InventoryRecord[],
  varianti: ProductVariant[],
  prodotti: Product[],
): { albero: NodoProdotto[]; orfani: InventoryRecord[] } {
  const varPerId = new Map(varianti.map((v) => [v.id, v]))
  const prodPerId = new Map(prodotti.map((p) => [p.id, p]))

  const perProdotto = new Map<string, { prodotto: Product; righe: { variante: ProductVariant; record: InventoryRecord }[] }>()
  const orfani: InventoryRecord[] = []

  for (const r of records) {
    const variante = varPerId.get(r.variantId)
    const prodotto = variante ? prodPerId.get(variante.productId) : undefined
    if (!variante || !prodotto) {
      orfani.push(r)
      continue
    }
    const gruppo = perProdotto.get(prodotto.id)
    if (gruppo) gruppo.righe.push({ variante, record: r })
    else perProdotto.set(prodotto.id, { prodotto, righe: [{ variante, record: r }] })
  }

  const albero: NodoProdotto[] = [...perProdotto.values()].map(({ prodotto, righe }) => {
    const perColore = new Map<string, { variante: ProductVariant; record: InventoryRecord }[]>()
    for (const riga of righe) {
      const colore = riga.variante.colore?.trim() || 'Senza colore'
      const attuale = perColore.get(colore)
      if (attuale) attuale.push(riga)
      else perColore.set(colore, [riga])
    }

    const colori: NodoColore[] = [...perColore.entries()]
      .map(([colore, elenco]) => {
        const taglie: NodoTaglia[] = elenco
          .map(({ variante, record }) => ({ taglia: variante.taglia, variante, record }))
          .sort((a, b) => indiceTaglia(a.taglia) - indiceTaglia(b.taglia))
        return {
          colore,
          taglie,
          totali: taglie.reduce((t, n) => sommaRecord(t, n.record), VUOTI),
        }
      })
      .sort((a, b) => perTesto(a.colore, b.colore))

    return {
      prodotto,
      colori,
      totali: sommaTotali(colori.map((c) => c.totali)),
      varianti: righe.length,
    }
  })

  return {
    albero: albero.sort((a, b) => perTesto(a.prodotto.nome, b.prodotto.nome)),
    orfani,
  }
}

export type FiltroAlbero = 'tutti' | 'magazzino' | 'laboratorio' | 'da-verificare' | 'da-reintegrare' | 'da-distribuire'

export const FILTRI_ALBERO: { id: FiltroAlbero; label: string; descrizione: string }[] = [
  { id: 'tutti', label: 'Tutto lo stock', descrizione: 'Tutte le varianti, comprese quelle a zero.' },
  { id: 'magazzino', label: 'Solo in magazzino', descrizione: 'Varianti con almeno un pezzo in magazzino.' },
  { id: 'laboratorio', label: 'Solo in laboratorio', descrizione: 'Varianti con almeno un pezzo in laboratorio.' },
  { id: 'da-verificare', label: 'Esaurite o sotto soglia', descrizione: 'Varianti che non coprono la soglia minima.' },
  { id: 'da-reintegrare', label: 'Sotto soglia lab.', descrizione: 'Il laboratorio è sceso sotto la sua soglia: serve un reintegro.' },
  { id: 'da-distribuire', label: 'Distribuzione da confermare', descrizione: 'Varianti importate, ancora tutte in laboratorio.' },
]

function passa(r: InventoryRecord, filtro: FiltroAlbero): boolean {
  switch (filtro) {
    case 'magazzino': return r.qtaMagazzino > 0
    case 'laboratorio': return r.qtaLaboratorio > 0
    case 'da-verificare': return r.stato === 'esaurito' || r.stato === 'low_stock'
    case 'da-reintegrare': return r.laboratorioSottoSoglia
    case 'da-distribuire': return !r.migrazioneCompletata
    default: return true
  }
}

/**
 * Filtra e cerca **senza rompere la gerarchia**: un capo resta nell'albero se almeno una
 * sua taglia passa, e i totali si ricalcolano su ciò che resta. Filtrare le foglie e
 * lasciare i totali del capo intatti darebbe un albero che si contraddice da solo.
 */
export function filtraAlbero(albero: NodoProdotto[], filtro: FiltroAlbero, ricerca: string): NodoProdotto[] {
  const q = ricerca.trim().toLowerCase()
  const risultato: NodoProdotto[] = []

  for (const nodo of albero) {
    // La ricerca guarda il capo (nome e codice) e le singole varianti (SKU, colore,
    // taglia): cercare «Amalfi» deve dare tutto il capo, cercare uno SKU la sola riga.
    const capoCorrisponde =
      !q || `${nodo.prodotto.nome} ${nodo.prodotto.codiceProdotto} ${nodo.prodotto.categoria ?? ''}`.toLowerCase().includes(q)

    const colori: NodoColore[] = []
    for (const colore of nodo.colori) {
      const taglie = colore.taglie.filter((t) => {
        if (!passa(t.record, filtro)) return false
        if (!q || capoCorrisponde) return true
        return `${t.variante.sku} ${colore.colore} ${t.taglia}`.toLowerCase().includes(q)
      })
      if (taglie.length === 0) continue
      colori.push({ colore: colore.colore, taglie, totali: taglie.reduce((t, n) => sommaRecord(t, n.record), VUOTI) })
    }

    if (colori.length === 0) continue
    risultato.push({
      prodotto: nodo.prodotto,
      colori,
      totali: sommaTotali(colori.map((c) => c.totali)),
      varianti: colori.reduce((s, c) => s + c.taglie.length, 0),
    })
  }

  return risultato
}
