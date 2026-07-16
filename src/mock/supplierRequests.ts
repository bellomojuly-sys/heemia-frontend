import type { SupplierRequest } from '../types'

// Flusso approvazione (FR-05, FR-06): bozza generata -> in attesa -> modificata -> approvata -> inviata -> risposta ricevuta -> chiusa.
// Nessun invio automatico: ogni riga rappresenta uno stato reale del flusso, mai "inviata" senza passaggio da "approvata".
export const supplierRequests: SupplierRequest[] = [
  {
    id: 'sr-01', supplierId: 'sup-03', materialId: 'mat-02', productId: 'prod-02',
    oggetto: 'Richiesta disponibilità Felpa Gigiotop: sotto soglia minima',
    testo: 'Buongiorno, la scorta di Felpa Gigiotop (TES-GIG-01) è scesa sotto la soglia minima di 20m. Potete confermare disponibilità, tempi di consegna e costo aggiornato per un riordino di almeno 100m?',
    quantitaRichiesta: 100, quantitaDisponibile: 8, quantitaMancante: 92, urgenza: 'alta',
    deadlineIdeale: '2026-07-21', stato: 'in_attesa_approvazione', creataIl: '2026-07-13',
  },
  {
    id: 'sr-02', supplierId: 'sup-13', accessoryId: 'acc-02', productId: 'prod-02',
    oggetto: 'Riordino Zip #8 Canna Fucile',
    testo: 'Buongiorno, richiediamo riordino di Zip #8 Canna Fucile: scorta sotto soglia. Confermateci quantità minima ordinabile e tempi.',
    quantitaRichiesta: 300, quantitaDisponibile: 32, quantitaMancante: 268, urgenza: 'media',
    deadlineIdeale: '2026-07-28', stato: 'approvata', creataIl: '2026-07-10', approvataDa: 'Giulia',
  },
  {
    id: 'sr-03', supplierId: 'sup-11', accessoryId: 'acc-04', productId: 'prod-01',
    oggetto: 'Riordino urgente cartellini: scorta esaurita',
    testo: 'Buongiorno, la scorta di cartellini versione base è esaurita. Necessario riordino urgente di 3000 pezzi per non bloccare la produzione in corso.',
    quantitaRichiesta: 3000, quantitaDisponibile: 0, quantitaMancante: 3000, urgenza: 'alta',
    deadlineIdeale: '2026-07-18', stato: 'inviata', creataIl: '2026-07-09', approvataDa: 'Giulia',
  },
  {
    id: 'sr-04', supplierId: 'sup-06', materialId: 'mat-07', productId: 'prod-06',
    oggetto: 'Verifica disponibilità Lana vergine per nuova produzione Amalfi Top',
    testo: 'Buongiorno, per la nuova produzione di Amalfi Top serviranno 28kg di Lana vergine. La scorta attuale è sotto soglia: confermate tempi e costo aggiornato?',
    quantitaRichiesta: 28, quantitaDisponibile: 2, quantitaMancante: 26, urgenza: 'media',
    deadlineIdeale: '2026-08-01', stato: 'risposta_ricevuta', creataIl: '2026-06-28', approvataDa: 'CEO',
    rispostaFornitore: 'Disponibile, consegna in 20 giorni lavorativi. Costo invariato a €49/kg.',
  },
  {
    id: 'sr-05', supplierId: 'sup-04', materialId: 'mat-04', productId: 'prod-04',
    oggetto: 'Lycra lucida esaurita',
    testo: 'Bozza da revisionare: la Lycra lucida risulta esaurita. Verificare se il capo Vienna la richiede prima di procedere con la richiesta.',
    quantitaRichiesta: 60, quantitaDisponibile: 0, quantitaMancante: 60, urgenza: 'bassa',
    stato: 'bozza_generata', creataIl: '2026-07-14',
  },
]
