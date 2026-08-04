import type { Accessory, CostSource, Invoice, Material, Product, TechnicalSheet } from '../types'

// Motore costo unitario e stima consumo materiali (spec §2 e §3).
// Nessun dato di listino esterno: si parte dalle fatture collegate al materiale e, in
// mancanza, dal prezzo di anagrafica. Il criterio è dichiarato in chiaro nell'interfaccia
// tramite `fonte`, così ogni valore resta tracciabile alla sua origine (spec §6).

export interface UnitCostResult {
  costoUnitario: number
  fonte: CostSource
  fatturaId?: string
  aggiornatoIl: string
  /** Spiegazione breve del criterio usato, mostrata come tooltip/nota di tracciabilità. */
  criterio: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Costo unitario di un materiale (tessuto o accessorio) come MEDIA PONDERATA sulle fatture
 * collegate, con ripiego sul prezzo di anagrafica.
 *
 * Dati disponibili nel prototipo: le fatture non hanno righe per-materiale, quindi una fattura
 * è "attribuibile" a un materiale solo se collega quel singolo materiale (materialiCollegatiIds
 * di lunghezza 1). In quel caso il costo unitario implicito è imponibile / quantità acquistata.
 * Con più fatture attribuibili si fa la media ponderata sull'imponibile (proxy della quantità
 * acquistata), con la fattura più recente a fornire data e id di riferimento.
 */
export function weightedAverageUnitCost(
  item: { kind: 'material'; material: Material } | { kind: 'accessory'; accessory: Accessory },
  invoices: Invoice[],
): UnitCostResult {
  const isMaterial = item.kind === 'material'
  const id = isMaterial ? item.material.id : item.accessory.id
  const quantitaAcquistata = isMaterial ? item.material.metriAcquistati : item.accessory.quantitaAcquistata
  const prezzoAnagrafica = isMaterial ? item.material.prezzoAlMetro : item.accessory.costoUnitario
  const dataAnagrafica = isMaterial ? item.material.dataAcquisto : ''

  // Fatture collegate e attribuibili a questo singolo materiale.
  const attribuibili = invoices.filter(
    (inv) =>
      inv.materialiCollegatiIds.includes(id) &&
      inv.materialiCollegatiIds.length === 1 &&
      inv.imponibile > 0 &&
      quantitaAcquistata > 0,
  )

  if (attribuibili.length > 0) {
    // Media ponderata sull'imponibile (proxy della quantità acquistata).
    const pesoTotale = attribuibili.reduce((s, inv) => s + inv.imponibile, 0)
    const numeratore = attribuibili.reduce((s, inv) => {
      const unit = inv.imponibile / quantitaAcquistata
      return s + unit * inv.imponibile
    }, 0)
    const costoUnitario = round2(numeratore / pesoTotale)
    const piuRecente = [...attribuibili].sort((a, b) => b.data.localeCompare(a.data))[0]
    return {
      costoUnitario,
      fonte: 'fattura',
      fatturaId: piuRecente.id,
      aggiornatoIl: piuRecente.data,
      criterio:
        attribuibili.length === 1
          ? `Da fattura ${piuRecente.numero}: imponibile ÷ quantità acquistata.`
          : `Media ponderata di ${attribuibili.length} fatture collegate (peso = imponibile).`,
    }
  }

  // Ripiego: prezzo di anagrafica del materiale/accessorio.
  return {
    costoUnitario: round2(prezzoAnagrafica),
    fonte: 'materiale',
    aggiornatoIl: dataAnagrafica,
    criterio: 'Prezzo di anagrafica del materiale (nessuna fattura attribuibile collegata).',
  }
}

// --- Stima consumo (spec §2) -------------------------------------------------

// Consumo base per categoria di prodotto, in metri di tessuto principale per un capo taglia M.
// Valori indicativi da sartoria; l'utente li corregge sempre a mano. La chiave è confrontata
// in minuscolo per sotto-stringhe (es. "Felpa oversize" → felpa).
const CONSUMO_BASE_METRI: { match: string; metri: number }[] = [
  { match: 'felpa', metri: 1.7 },
  { match: 'giacc', metri: 2.3 },
  { match: 'cappott', metri: 2.8 },
  { match: 'abito', metri: 2.2 },
  { match: 'vestito', metri: 2.2 },
  { match: 'pantalon', metri: 1.5 },
  { match: 'gonna', metri: 1.3 },
  { match: 'camic', metri: 1.6 },
  { match: 'maglia', metri: 1.2 },
  { match: 'cardigan', metri: 1.4 },
  { match: 't-shirt', metri: 1.1 },
  { match: 'top', metri: 0.9 },
]

const CONSUMO_DEFAULT_METRI = 1.5

// Fattore per taglia rispetto alla M (base 1.0).
const FATTORE_TAGLIA: Record<string, number> = {
  XXS: 0.85, XS: 0.9, S: 0.95, M: 1.0, L: 1.06, XL: 1.12, XXL: 1.2, XXXL: 1.28,
}

function consumoBaseCategoria(categoria: string): number {
  const c = categoria.toLowerCase()
  const hit = CONSUMO_BASE_METRI.find((r) => c.includes(r.match))
  return hit ? hit.metri : CONSUMO_DEFAULT_METRI
}

export interface ConsumoStimaResult {
  quantitaSuggerita: number
  criterio: string
}

/**
 * Stima il consumo NETTO di tessuto principale per un capo (spec §2), combinando:
 * categoria prodotto, taglia e consumo storico di schede simili (stessa categoria).
 * Lo scarto NON è incluso qui: come da spec §3 si applica al costo
 * (quantità × costo unitario, poi maggiorazione per scarto), altrimenti verrebbe contato due volte.
 * Restituisce la quantità suggerita: l'utente può sempre sovrascriverla, e in tal caso
 * l'app conserva entrambi i valori.
 */
export function estimateConsumption(
  product: Pick<Product, 'categoria'>,
  taglia: string,
  historicalSheets: TechnicalSheet[] = [],
): ConsumoStimaResult {
  const fattoreTaglia = FATTORE_TAGLIA[(taglia || 'M').toUpperCase()] ?? 1.0

  // Consumo confermato in schede storiche della stessa categoria (media), se presente.
  const storiciConfermati = historicalSheets
    .filter((s) => (s.categoria ?? '').toLowerCase() === product.categoria.toLowerCase())
    .flatMap((s) => s.materiali ?? [])
    .filter((m) => m.materialId && m.quantitaConfermata != null)
    .map((m) => m.quantitaConfermata as number)

  let baseM: number
  let criterioBase: string
  if (storiciConfermati.length > 0) {
    baseM = storiciConfermati.reduce((a, b) => a + b, 0) / storiciConfermati.length
    criterioBase = `media storica confermata (${storiciConfermati.length} capi simili)`
  } else {
    baseM = consumoBaseCategoria(product.categoria)
    criterioBase = `stima da categoria "${product.categoria || 'generica'}"`
  }

  const quantitaSuggerita = Math.round(baseM * fattoreTaglia * 100) / 100

  return {
    quantitaSuggerita,
    criterio: `${criterioBase}, taglia ${taglia || 'M'} (×${fattoreTaglia}). Lo scarto si applica al costo.`,
  }
}
