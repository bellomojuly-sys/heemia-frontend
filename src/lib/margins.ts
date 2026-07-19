import type { FixedCostItem, Margin } from '../types'

// Quota costi fissi per capo (Business_Analysis §6.2): totale costi fissi annui diviso i capi
// prodotti nell'anno. Configurabile, non più un valore hardcoded.
export function computeQuotaPerCapo(fixedCostItems: FixedCostItem[], capiProdottiAnnui: number): number {
  if (capiProdottiAnnui <= 0) return 0
  const totale = fixedCostItems.reduce((sum, item) => sum + item.importoAnnuo, 0)
  return Math.round((totale / capiProdottiAnnui) * 100) / 100
}

// FR-10 §18: numero di unità da vendere per coprire i costi fissi allocati — costi fissi
// annui totali diviso il margine lordo unitario (prezzo netto − costo diretto).
export function computeUnitsToBreakEven(totaleCostiFissi: number, margin: Margin): number | null {
  const margineLordoUnitario = margin.prezzoNettoIva - margin.costoDiretto
  if (margineLordoUnitario <= 0) return null
  return Math.ceil(totaleCostiFissi / margineLordoUnitario)
}

// FR-10 §18: margine residuo per fascia di prezzo (prezzo pieno e sconti tipici) con
// segnalazione automatica se lo sconto porta il prodotto sotto break-even.
export interface PriceBand {
  label: string
  prezzoNetto: number
  margine: number
  sottoBreakEven: boolean
}

export function computePriceBands(margin: Margin, sconti: number[] = [0, 10, 20, 30]): PriceBand[] {
  return sconti.map((sconto) => {
    const prezzoNetto = Math.round(margin.prezzoNettoIva * (1 - sconto / 100) * 100) / 100
    const margine = Math.round((prezzoNetto - margin.costoTotale) * 100) / 100
    return {
      label: sconto === 0 ? 'Prezzo pieno' : `-${sconto}%`,
      prezzoNetto,
      margine,
      sottoBreakEven: prezzoNetto < margin.breakEvenPrice,
    }
  })
}

// Ricalcola un margine con una nuova quota di costi indiretti allocati, mantenendo invariati
// prezzo e costo diretto (dati per prodotto). Formule verificate sui dati mock esistenti:
// costoTotale = costoDiretto + quota; margineLordo = prezzoNettoIva - costoDiretto;
// margineNettoStimato = prezzoNettoIva - costoTotale; prezzoMinimoConsigliato = costoTotale × 1.15.
export function recomputeMargin(base: Margin, quotaPerCapo: number, thresholdPercent: number): Margin {
  const costoTotale = Math.round((base.costoDiretto + quotaPerCapo) * 100) / 100
  const margineLordo = Math.round((base.prezzoNettoIva - base.costoDiretto) * 100) / 100
  const margineNettoStimato = Math.round((base.prezzoNettoIva - costoTotale) * 100) / 100
  const marginePercentuale =
    base.prezzoNettoIva > 0 ? Math.round((margineNettoStimato / base.prezzoNettoIva) * 1000) / 10 : 0

  return {
    ...base,
    costoIndirettoAllocato: quotaPerCapo,
    costoTotale,
    margineLordo,
    margineNettoStimato,
    marginePercentuale,
    breakEvenPrice: costoTotale,
    prezzoMinimoConsigliato: Math.round(costoTotale * 1.15 * 100) / 100,
    sottoSoglia: marginePercentuale < thresholdPercent,
  }
}
