import type { ActivityLogEntry } from '../types'

// Visibili solo ad Admin e CEO (FR-18).
export const activityLogs: ActivityLogEntry[] = [
  { id: 'log-01', utente: 'Giulia', azione: 'Modifica costi', entita: 'technical_sheets', entitaId: 'ts-04', valorePrecedente: 'costo tessuto €14,20', valoreNuovo: 'costo tessuto €16,00', data: '2026-07-12T10:15:00' },
  { id: 'log-02', utente: 'CEO', azione: 'Approvazione bozza email', entita: 'supplier_requests', entitaId: 'sr-02', valoreNuovo: 'stato: approvata', data: '2026-07-13T09:02:00' },
  { id: 'log-03', utente: 'Team interno', azione: 'Cambio fase produzione', entita: 'production', entitaId: 'prs-01', valorePrecedente: 'scelta_accessori', valoreNuovo: 'produzione', data: '2026-07-01T14:40:00' },
  { id: 'log-04', utente: 'Giulia', azione: 'Invio bozza email', entita: 'supplier_requests', entitaId: 'sr-03', valoreNuovo: 'stato: inviata', data: '2026-07-11T16:20:00' },
  { id: 'log-05', utente: 'CEO', azione: 'Modifica permessi utente', entita: 'users', entitaId: 'team-02', valorePrecedente: 'Viewer', valoreNuovo: 'Team interno', data: '2026-06-30T11:00:00' },
  { id: 'log-06', utente: 'Team interno', azione: 'Creazione prodotto', entita: 'products', entitaId: 'prod-03', valoreNuovo: 'stato: idea', data: '2026-06-29T08:45:00' },
]
