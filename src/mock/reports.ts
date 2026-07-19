import type { MonthlyReport } from '../types'

// Valori ricalcolati con la quota costi fissi reale (DEC-022: 442 capi/anno → €88,22/capo,
// review Fase 6 finding R1): margine medio = media dei margini % degli 8 prodotti con margine
// calcolabile; costo medio = costo diretto medio (€59,18) + quota per capo. Ricavi/costi del
// mese restano invariati (derivano da ordini e fatture, non dalla quota).
export const monthlyReports: MonthlyReport[] = [
  { id: 'rep-06-2026', mese: 'Giugno 2026', generatoIl: '2026-07-01', margineMedio: -12.4, costoMedioProdotto: 147.4, ricaviTotali: 18420, costiTotali: 8460, prodottoPiuCostoso: 'Copenaghen', prodottoMenoRedditizio: 'Maiorca Top' },
]
