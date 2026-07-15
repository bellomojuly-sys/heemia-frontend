import type { Margin } from '../types'

// Soglia margine configurabile (FR-10). Valore demo: 35%.
export const MARGIN_THRESHOLD_PERCENT = 35
// Quota costi fissi per capo — valore target configurabile (Business_Analysis §3.4 / §6.2).
export const FIXED_COST_PER_ITEM = 17.3

export const margins: Margin[] = [
  { productId: 'prod-01', prezzoVendita: 129.0, prezzoNettoIva: 105.74, costoDiretto: 16.65, costoIndirettoAllocato: 17.3, costoTotale: 33.95, margineLordo: 89.09, margineNettoStimato: 71.79, marginePercentuale: 67.9, breakEvenPrice: 33.95, prezzoMinimoConsigliato: 39.04, tipoDato: 'reale', sottoSoglia: false },
  { productId: 'prod-02', prezzoVendita: 149.0, prezzoNettoIva: 122.13, costoDiretto: 57.65, costoIndirettoAllocato: 17.3, costoTotale: 74.95, margineLordo: 64.48, margineNettoStimato: 47.18, marginePercentuale: 38.6, breakEvenPrice: 74.95, prezzoMinimoConsigliato: 86.19, tipoDato: 'stimato', sottoSoglia: false },
  { productId: 'prod-05', prezzoVendita: 89.0, prezzoNettoIva: 72.95, costoDiretto: 53.54, costoIndirettoAllocato: 17.3, costoTotale: 70.84, margineLordo: 19.41, margineNettoStimato: 2.11, marginePercentuale: 2.9, breakEvenPrice: 70.84, prezzoMinimoConsigliato: 81.47, tipoDato: 'reale', sottoSoglia: true },
  { productId: 'prod-06', prezzoVendita: 99.0, prezzoNettoIva: 81.15, costoDiretto: 57.21, costoIndirettoAllocato: 17.3, costoTotale: 74.51, margineLordo: 23.94, margineNettoStimato: 6.64, marginePercentuale: 8.2, breakEvenPrice: 74.51, prezzoMinimoConsigliato: 85.69, tipoDato: 'reale', sottoSoglia: true },
  { productId: 'prod-07', prezzoVendita: 260.0, prezzoNettoIva: 213.11, costoDiretto: 39.21, costoIndirettoAllocato: 17.3, costoTotale: 56.51, margineLordo: 173.9, margineNettoStimato: 156.6, marginePercentuale: 73.5, breakEvenPrice: 56.51, prezzoMinimoConsigliato: 64.99, tipoDato: 'reale', sottoSoglia: false },
  { productId: 'prod-08', prezzoVendita: 220.0, prezzoNettoIva: 180.33, costoDiretto: 72.13, costoIndirettoAllocato: 17.3, costoTotale: 89.43, margineLordo: 108.2, margineNettoStimato: 90.9, marginePercentuale: 50.4, breakEvenPrice: 89.43, prezzoMinimoConsigliato: 102.84, tipoDato: 'stimato', sottoSoglia: false },
  { productId: 'prod-09', prezzoVendita: 180.0, prezzoNettoIva: 147.54, costoDiretto: 66.39, costoIndirettoAllocato: 17.3, costoTotale: 83.69, margineLordo: 81.15, margineNettoStimato: 63.85, marginePercentuale: 43.3, breakEvenPrice: 83.69, prezzoMinimoConsigliato: 96.24, tipoDato: 'stimato', sottoSoglia: false },
  { productId: 'prod-10', prezzoVendita: 450.0, prezzoNettoIva: 368.85, costoDiretto: 110.66, costoIndirettoAllocato: 17.3, costoTotale: 127.96, margineLordo: 258.19, margineNettoStimato: 240.89, marginePercentuale: 65.3, breakEvenPrice: 127.96, prezzoMinimoConsigliato: 147.15, tipoDato: 'reale', sottoSoglia: false },
]
