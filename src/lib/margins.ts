import type { FixedCostItem, Margin } from '../types'

// Quota costi fissi per capo (Business_Analysis §6.2): totale costi fissi annui diviso i capi
// prodotti nell'anno. Configurabile, non più un valore hardcoded.
export function computeQuotaPerCapo(fixedCostItems: FixedCostItem[], capiProdottiAnnui: number): number {
  if (capiProdottiAnnui <= 0) return 0
  const totale = fixedCostItems.reduce((sum, item) => sum + item.importoAnnuo, 0)
  return Math.round((totale / capiProdottiAnnui) * 100) / 100
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
