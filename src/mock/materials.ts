import type { Material, Accessory } from '../types'

// Tessuti — costi da 01_Business/Business_Analysis.md §5.1
export const materials: Material[] = [
  {
    id: 'mat-01', tipo: 'tessuto', nome: 'Felpa Piqué', codice: 'TES-PIQ-01', supplierId: 'sup-02',
    composizione: '100% Cotone', colore: 'Grigio melange', altezzaCm: 150, prezzoAlMetro: 7.5,
    metriAcquistati: 320, metriUtilizzati: 298, fatturaId: 'inv-01', dataAcquisto: '2026-03-12', stagione: 'FW26',
    prodottiCollegatiIds: ['prod-01'], consigliLavaggio: 'Lavaggio a 30°, non candeggiare', sogliaMinima: 30,
    stato: 'disponibile', unitaMisura: 'm',
  },
  {
    id: 'mat-02', tipo: 'tessuto', nome: 'Felpa Gigiotop', codice: 'TES-GIG-01', supplierId: 'sup-03',
    composizione: '95% Cotone 5% Elastan', colore: 'Nero', altezzaCm: 155, prezzoAlMetro: 6.5,
    metriAcquistati: 210, metriUtilizzati: 202, fatturaId: 'inv-02', dataAcquisto: '2026-02-20', stagione: 'FW26',
    prodottiCollegatiIds: ['prod-02'], sogliaMinima: 20, stato: 'sotto_soglia', unitaMisura: 'm',
    noteTecniche: 'Tende a infeltrire se lavato a caldo, verificare campione prima di taglio serie',
  },
  {
    id: 'mat-03', tipo: 'tessuto', nome: 'Felpa Louis', codice: 'TES-LOU-01', supplierId: 'sup-03',
    composizione: '100% Cotone garzato', colore: 'Crema', altezzaCm: 150, prezzoAlMetro: 5.8,
    metriAcquistati: 180, metriUtilizzati: 95, fatturaId: 'inv-03', dataAcquisto: '2026-04-02', stagione: 'FW26',
    prodottiCollegatiIds: [], sogliaMinima: 25, stato: 'disponibile', unitaMisura: 'm',
  },
  {
    id: 'mat-04', tipo: 'tessuto', nome: 'Lycra lucida', codice: 'TES-LYC-01', supplierId: 'sup-04',
    composizione: '85% Poliammide 15% Elastan', colore: 'Nero', altezzaCm: 140, prezzoAlMetro: 7.0,
    metriAcquistati: 60, metriUtilizzati: 58, dataAcquisto: '2026-01-15', stagione: 'FW26',
    prodottiCollegatiIds: [], sogliaMinima: 15, stato: 'esaurito', unitaMisura: 'm',
  },
  {
    id: 'mat-05', tipo: 'tessuto', nome: 'Jersey', codice: 'TES-JER-01', supplierId: 'sup-02',
    composizione: '100% Cotone', colore: 'Bianco', altezzaCm: 160, prezzoAlMetro: 10.0,
    metriAcquistati: 90, metriUtilizzati: 40, dataAcquisto: '2026-05-01', stagione: 'FW26',
    prodottiCollegatiIds: [], sogliaMinima: 20, stato: 'disponibile', unitaMisura: 'kg',
  },
  {
    id: 'mat-06', tipo: 'tessuto', nome: 'Alpaca', codice: 'FIL-ALP-01', supplierId: 'sup-06',
    composizione: '70% Alpaca 30% Lana vergine', colore: 'Cammello', prezzoAlMetro: 40.0,
    metriAcquistati: 45, metriUtilizzati: 43, fatturaId: 'inv-04', dataAcquisto: '2026-01-28', stagione: 'FW26',
    prodottiCollegatiIds: ['prod-05', 'prod-06'], sogliaMinima: 10, stato: 'disponibile', unitaMisura: 'kg',
    consigliLavaggio: 'Lavaggio a mano, non candeggiare, asciugare in piano',
    noteTecniche: 'Partita tinta unica: riordini successivi possono avere lieve scarto colore',
  },
  {
    id: 'mat-07', tipo: 'tessuto', nome: 'Lana vergine', codice: 'FIL-LAN-01', supplierId: 'sup-06',
    composizione: '100% Lana vergine', colore: 'Blu navy', prezzoAlMetro: 49.0,
    metriAcquistati: 30, metriUtilizzati: 28, dataAcquisto: '2026-02-10', stagione: 'FW26',
    prodottiCollegatiIds: ['prod-06'], sogliaMinima: 8, stato: 'sotto_soglia', unitaMisura: 'kg',
  },
  {
    id: 'mat-08', tipo: 'tessuto', nome: 'Filato misto lana 0,59', codice: 'FIL-MIS-01', supplierId: 'sup-07',
    composizione: '59% Lana 41% Acrilico', colore: 'Grigio', prezzoAlMetro: 12.8,
    metriAcquistati: 55, metriUtilizzati: 20, dataAcquisto: '2026-03-05', stagione: 'FW26',
    prodottiCollegatiIds: ['prod-05'], sogliaMinima: 10, stato: 'disponibile', unitaMisura: 'kg',
  },
  {
    id: 'mat-09', tipo: 'tessuto', nome: 'Caldo cotone', codice: 'FIL-CAL-01', supplierId: 'sup-05',
    composizione: '80% Cotone 20% Poliestere', colore: 'Bordeaux', prezzoAlMetro: 39.25,
    metriAcquistati: 25, metriUtilizzati: 24, dataAcquisto: '2026-01-08', stagione: 'FW26',
    prodottiCollegatiIds: [], sogliaMinima: 8, stato: 'da_verificare', unitaMisura: 'kg',
    noteTecniche: 'Lotto da verificare con il fornitore: peso al kg dichiarato incoerente con la bolla',
  },
]

// Accessori e packaging — costi da 01_Business/Business_Analysis.md §5.2-5.4
export const accessories: Accessory[] = [
  { id: 'acc-01', tipo: 'accessorio', nome: 'Bottone automatico', codice: 'ACC-BOT-01', categoria: 'Bottoni', supplierId: 'sup-09', quantitaAcquistata: 2000, quantitaUtilizzata: 1840, costoUnitario: 0.495, fatturaId: 'inv-05', prodottiCollegatiIds: ['prod-01'], sogliaMinima: 200, stato: 'disponibile', unitaMisura: 'cad' },
  { id: 'acc-02', tipo: 'accessorio', nome: 'Zip #8 Canna Fucile', codice: 'ACC-ZIP-08', categoria: 'Zip', supplierId: 'sup-13', quantitaAcquistata: 500, quantitaUtilizzata: 468, costoUnitario: 5.6, prodottiCollegatiIds: ['prod-02'], sogliaMinima: 50, stato: 'sotto_soglia', unitaMisura: 'cad' },
  { id: 'acc-03', tipo: 'accessorio', nome: 'Zip #3 Canna Fucile', codice: 'ACC-ZIP-03', categoria: 'Zip', supplierId: 'sup-13', quantitaAcquistata: 800, quantitaUtilizzata: 210, costoUnitario: 1.0, prodottiCollegatiIds: [], sogliaMinima: 80, stato: 'disponibile', unitaMisura: 'cad' },
  { id: 'acc-04', tipo: 'accessorio', nome: 'Cartellino versione base', codice: 'ACC-CAR-01', categoria: 'Cartellini/Etichette', supplierId: 'sup-11', quantitaAcquistata: 3000, quantitaUtilizzata: 2950, costoUnitario: 0.45, prodottiCollegatiIds: ['prod-01', 'prod-02'], sogliaMinima: 300, stato: 'esaurito', unitaMisura: 'cad' },
  { id: 'acc-05', tipo: 'accessorio', nome: 'Etichetta brand', codice: 'ACC-ETI-01', categoria: 'Cartellini/Etichette', supplierId: 'sup-11', quantitaAcquistata: 4000, quantitaUtilizzata: 1500, costoUnitario: 0.48, prodottiCollegatiIds: [], sogliaMinima: 400, stato: 'disponibile', unitaMisura: 'cad' },
  { id: 'acc-06', tipo: 'accessorio', nome: 'Elastico morbido 35mm nero', codice: 'ACC-ELA-01', categoria: 'Accessori vari', supplierId: 'sup-15', quantitaAcquistata: 600, quantitaUtilizzata: 300, costoUnitario: 0.21, prodottiCollegatiIds: [], sogliaMinima: 60, stato: 'disponibile', unitaMisura: 'm' },
]
