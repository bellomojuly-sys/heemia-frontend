import type { Invoice, Deadline, CostAllocation } from '../types'

// Date relative a "oggi" 2026-07-14 per coprire scadenze imminenti, a 30gg e in ritardo (FR-24).
export const invoices: Invoice[] = [
  { id: 'inv-01', numero: 'FT-2026-0312', data: '2026-03-12', fornitoreId: 'sup-02', paese: 'IT', valuta: 'EUR', imponibile: 2400.0, iva: 528.0, totale: 2928.0, categoriaCosto: 'tessuto', metodoPagamento: 'Bonifico 30gg', statoPagamento: 'pagata', prodottiCollegatiIds: ['prod-01'], materialiCollegatiIds: ['mat-01'], associata: true },
  { id: 'inv-02', numero: 'FT-2026-0198', data: '2026-02-20', fornitoreId: 'sup-03', paese: 'IT', valuta: 'EUR', imponibile: 1365.0, iva: 300.3, totale: 1665.3, categoriaCosto: 'tessuto', metodoPagamento: 'Bonifico 60gg', statoPagamento: 'pagata', prodottiCollegatiIds: ['prod-02'], materialiCollegatiIds: ['mat-02'], associata: true },
  { id: 'inv-03', numero: 'FT-2026-0405', data: '2026-04-02', fornitoreId: 'sup-03', paese: 'IT', valuta: 'EUR', imponibile: 1044.0, iva: 229.68, totale: 1273.68, categoriaCosto: 'tessuto', metodoPagamento: 'Bonifico 60gg', statoPagamento: 'da_pagare', dataScadenza: '2026-07-17', prodottiCollegatiIds: [], materialiCollegatiIds: ['mat-03'], associata: true },
  { id: 'inv-04', numero: 'FT-2026-0089', data: '2026-01-28', fornitoreId: 'sup-06', paese: 'IT', valuta: 'EUR', imponibile: 1800.0, iva: 396.0, totale: 2196.0, categoriaCosto: 'tessuto', metodoPagamento: 'Bonifico 30gg', statoPagamento: 'scaduta', dataScadenza: '2026-07-05', prodottiCollegatiIds: ['prod-05', 'prod-06'], materialiCollegatiIds: ['mat-06'], associata: true },
  { id: 'inv-05', numero: 'FT-2026-0512', data: '2026-05-18', fornitoreId: 'sup-09', paese: 'IT', valuta: 'EUR', imponibile: 990.0, iva: 217.8, totale: 1207.8, categoriaCosto: 'accessori', metodoPagamento: 'Bonifico 30gg', statoPagamento: 'da_pagare', dataScadenza: '2026-08-03', prodottiCollegatiIds: ['prod-01'], materialiCollegatiIds: [], associata: true },
  { id: 'inv-06', numero: 'FT-2026-0620', data: '2026-06-10', paese: 'IT', valuta: 'EUR', imponibile: 320.0, iva: 70.4, totale: 390.4, categoriaCosto: 'servizi', metodoPagamento: 'Bonifico', statoPagamento: 'da_pagare', dataScadenza: '2026-07-20', prodottiCollegatiIds: [], materialiCollegatiIds: [], noteAmministrative: 'Fattura Verisure: da categorizzare', associata: false },
  { id: 'inv-07', numero: 'INV-2026-4471', data: '2026-06-01', fornitoreId: 'sup-06', paese: 'Extra-EU', valuta: 'CHF', tassoCambio: 1.02, imponibile: 950.0, iva: 0, totale: 950.0, categoriaCosto: 'tessuto', metodoPagamento: 'Bonifico SWIFT', statoPagamento: 'pagata', prodottiCollegatiIds: [], materialiCollegatiIds: [], reverseCharge: true, associata: true },
  { id: 'inv-08', numero: 'FT-2026-0701', data: '2026-07-01', fornitoreId: 'sup-27', paese: 'IT', valuta: 'EUR', imponibile: 200.0, iva: 44.0, totale: 244.0, categoriaCosto: 'costi_generali', metodoPagamento: 'Bonifico', statoPagamento: 'da_pagare', dataScadenza: '2026-07-16', prodottiCollegatiIds: [], materialiCollegatiIds: [], associata: true },
]

export const costAllocations: CostAllocation[] = [
  { id: 'ca-01', invoiceId: 'inv-01', modalita: 'diretto_prodotto', targetId: 'prod-01' },
  { id: 'ca-02', invoiceId: 'inv-06', modalita: 'non_allocabile', note: 'Costo aziendale generale, in attesa di categorizzazione' },
  { id: 'ca-03', invoiceId: 'inv-08', modalita: 'per_mese', note: 'Ripartita su tutti i prodotti attivi a luglio 2026' },
]

export const deadlines: Deadline[] = [
  { id: 'dl-01', tipo: 'fattura_da_pagare', descrizione: 'Marrone Textile: fattura tessuto', data: '2026-07-17', importo: 1273.68, stato: 'in_arrivo', collegatoA: 'inv-03' },
  { id: 'dl-02', tipo: 'fattura_da_pagare', descrizione: 'Pettinatura Lagopolane: fattura filati', data: '2026-07-05', importo: 2196.0, stato: 'in_ritardo', collegatoA: 'inv-04' },
  { id: 'dl-03', tipo: 'commercialista', descrizione: 'Studio Malavasi Testi: parcella trimestrale', data: '2026-07-16', importo: 600.0, stato: 'in_arrivo' },
  { id: 'dl-04', tipo: 'iva', descrizione: 'Liquidazione IVA trimestrale', data: '2026-07-20', importo: 3150.0, stato: 'in_arrivo' },
  { id: 'dl-05', tipo: 'fattura_da_pagare', descrizione: 'W.A.A.M.: fattura accessori', data: '2026-08-03', importo: 1207.8, stato: 'in_arrivo', collegatoA: 'inv-05' },
  { id: 'dl-06', tipo: 'abbonamento', descrizione: 'Rinnovo piattaforma e-commerce', data: '2026-08-10', importo: 80.0, stato: 'in_arrivo' },
  { id: 'dl-07', tipo: 'contributi', descrizione: 'Contributi INPS collaboratori', data: '2026-07-25', importo: 900.0, stato: 'in_arrivo' },
]
