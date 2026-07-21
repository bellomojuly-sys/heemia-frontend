import type { CashClosure } from '../types'

// Chiusure di cassa mensili già registrate (FR-41). Giugno 2026 è volutamente assente:
// con "oggi" fissato al 14/07/2026 (lib/alerts.ts) fa scattare il promemoria di chiusura
// del mese precedente non ancora registrata.
export const cashClosures: CashClosure[] = [
  {
    id: 'cc-2026-05',
    mese: '2026-05',
    totaleIncassato: 4230.5,
    numeroScontrini: 38,
    fileNome: 'billy_scontrini_2026-05.csv',
    importatoIl: '2026-06-03',
    riepilogoAI:
      'A maggio 2026 sono entrati €4.230,50 con 38 scontrini (media €111,33 a scontrino). Incasso in linea con aprile; picco nella terza settimana.',
  },
  {
    id: 'cc-2026-04',
    mese: '2026-04',
    totaleIncassato: 3180.0,
    numeroScontrini: 29,
    fileNome: 'billy_scontrini_2026-04.csv',
    importatoIl: '2026-05-04',
    riepilogoAI:
      'Ad aprile 2026 sono entrati €3.180,00 con 29 scontrini (media €109,66 a scontrino). Primo mese pieno di stagione.',
  },
]
