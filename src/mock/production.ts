import type { ProductionStep } from '../types'

export const productionSteps: ProductionStep[] = [
  { id: 'prs-01', productId: 'prod-02', fase: 'produzione', responsabile: 'Team interno', dataInizio: '2026-07-01', note: 'Taglio in corso presso NJJ S.r.l.', bloccata: false },
  { id: 'prs-02', productId: 'prod-03', fase: 'scelta_accessori', responsabile: 'CEO', bloccata: true, motivoBlocco: 'Scheda tecnica assente: impossibile avanzare a "Prototipo".' },
  { id: 'prs-03', productId: 'prod-08', fase: 'prototipo', responsabile: 'Team interno', dataInizio: '2026-06-10', note: 'Secondo prototipo, modificate maniche rispetto al primo.', bloccata: false },
  { id: 'prs-04', productId: 'prod-09', fase: 'campionario', responsabile: 'Team interno', dataInizio: '2026-06-25', bloccata: false },
]
