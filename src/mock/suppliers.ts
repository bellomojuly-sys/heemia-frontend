import type { Supplier } from '../types'

// 29 fornitori attivi — da 01_Business/Business_Analysis.md §4
export const suppliers: Supplier[] = [
  // 4.1 Tessuti e filati
  { id: 'sup-01', nome: 'Gruppo Tessile BI-EFFE', categoria: 'Passamaneria', citta: 'Correggio (RE)', email: 'bi-effesnc@newmail.it', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 12, condizioniPagamento: '30gg d.f.' },
  { id: 'sup-02', nome: 'A B STOCK', categoria: 'Tessuti', citta: 'Soliera (MO)', email: 'info@abstock.net', paese: 'IT', materialiIds: ['mat-01'], accessoriIds: [], tempiMediConsegnaGiorni: 10, condizioniPagamento: '30gg d.f.' },
  { id: 'sup-03', nome: 'Captex', categoria: 'Felpa', citta: 'S. Giuseppe V. (NA)', email: 'info@captex.it', paese: 'IT', materialiIds: ['mat-02', 'mat-03'], accessoriIds: [], tempiMediConsegnaGiorni: 15, condizioniPagamento: '60gg d.f.' },
  { id: 'sup-04', nome: 'NEOCAP', categoria: 'Lycra', citta: 'S. Giuseppe V. (NA)', paese: 'IT', materialiIds: ['mat-04'], accessoriIds: [], tempiMediConsegnaGiorni: 14 },
  { id: 'sup-05', nome: 'Millefili', categoria: 'Filati', citta: 'Carpi (MO)', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 20 },
  { id: 'sup-06', nome: 'Pettinatura Lagopolane', categoria: 'Filati', citta: 'Prato (PO)', paese: 'IT', materialiIds: ['mat-07'], accessoriIds: [], tempiMediConsegnaGiorni: 25 },
  { id: 'sup-07', nome: 'Filigea S.r.l.', categoria: 'Filati', citta: 'Carpi (MO)', email: 'filigea@igeayarn.it', paese: 'IT', materialiIds: ['mat-08'], accessoriIds: [], tempiMediConsegnaGiorni: 20 },
  { id: 'sup-08', nome: 'Marrone Textile S.r.l.', categoria: 'Tessuti', citta: 'Mercato S. Severino (SA)', email: 'marronetextilesrl@gmail.com', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 12 },

  // 4.2 Accessori e packaging
  { id: 'sup-09', nome: 'W.A.A.M.', categoria: 'Asole/Bottoni', citta: 'Soliera (MO)', email: 'waamsnc@gmail.com', paese: 'IT', materialiIds: [], accessoriIds: ['acc-01'], tempiMediConsegnaGiorni: 8 },
  { id: 'sup-10', nome: 'FODERCENTER', categoria: 'Fodere', citta: 'Carpi (MO)', email: 'fodercenter.gpt@fodercenter.com', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 10 },
  { id: 'sup-11', nome: 'EVENTEX', categoria: 'Cartellini/Etichette', citta: 'Carpi (MO)', paese: 'IT', materialiIds: [], accessoriIds: ['acc-04', 'acc-05'], tempiMediConsegnaGiorni: 7 },
  { id: 'sup-12', nome: 'ULISSE ACCESSORI MODA', categoria: 'Accessori', citta: 'Carpi (MO)', email: 'info@ulissefashion.com', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 9 },
  { id: 'sup-13', nome: 'ROZA ITALIA', categoria: 'Zip', citta: 'Carpi (MO)', email: 'info.rozaitalia@gmail.com', paese: 'IT', materialiIds: [], accessoriIds: ['acc-02', 'acc-03'], tempiMediConsegnaGiorni: 8 },
  { id: 'sup-14', nome: 'F.A.C.O.M.', categoria: 'Bottoni', citta: 'Carpi (MO)', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 8 },
  { id: 'sup-15', nome: 'Baronet S.r.l.', categoria: 'Accessori vari', citta: 'Carpi (MO)', email: 'info@baronet.it', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 10 },
  { id: 'sup-16', nome: 'Modulo Sei S.r.l.', categoria: 'Biglietti', citta: 'Camposanto (MO)', email: 'modulosei@modulosei.it', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 6 },
  { id: 'sup-17', nome: 'Uniesse Service S.r.l.', categoria: 'Spalline', citta: 'Bergamo (BG)', email: 'amministrazione@uniesseservice.it', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 11 },

  // 4.3 Produzione e lavorazioni
  { id: 'sup-18', nome: 'Progetto Moda H.A.L.E.', categoria: 'Modellistica/Confezione', citta: 'Reggio Emilia (RE)', email: 'info@progettomodahale.it', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 30 },
  { id: 'sup-19', nome: 'Gierre Moda Service', categoria: 'Modellistica', citta: 'Carpi (MO)', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 25 },
  { id: 'sup-20', nome: 'Ricami Monica S.r.l.', categoria: 'Ricami', citta: 'Carpi (MO)', email: 'ricamimonica@gmail.com', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 15 },
  { id: 'sup-21', nome: 'Klamore S.r.l.', categoria: 'Ricami', citta: 'Carpi (MO)', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 15 },
  { id: 'sup-22', nome: 'Fattoria delle Lane', categoria: 'Ricami', citta: 'Carpi (MO)', email: 'info@fattoriadellelane.com', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 15 },
  { id: 'sup-23', nome: 'Lucchini Maglie S.N.C.', categoria: 'Smacchinatore', citta: 'Novellara (RE)', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 20 },
  { id: 'sup-24', nome: 'Nicomar Maglierie', categoria: 'Smacchinatore', citta: 'Gazzo Veronese (VR)', email: 'mauro.nicomar@gmail.com', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 20 },
  { id: 'sup-25', nome: 'D. Savitex S.r.l.', categoria: 'Smacchinatore', citta: 'Carpi (MO)', email: 'info@dsavitex.it', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 18 },
  { id: 'sup-26', nome: 'NJJ S.r.l.', categoria: 'Confezione', citta: 'Reggio Emilia (RE)', paese: 'IT', materialiIds: [], accessoriIds: [], tempiMediConsegnaGiorni: 25 },

  // 4.4 Servizi
  { id: 'sup-27', nome: 'Studio Malavasi Testi', categoria: 'Commercialista', citta: 'Carpi (MO)', email: 'malavasitesti@studiomalavasitesti.com', paese: 'IT', materialiIds: [], accessoriIds: [] },
  { id: 'sup-28', nome: 'Bugnion', categoria: 'Marchi e brevetti', citta: 'Milano (MI)', paese: 'IT', materialiIds: [], accessoriIds: [] },
  { id: 'sup-29', nome: 'Manicardi Berni', categoria: 'Consulenza', citta: 'Carpi (MO)', paese: 'IT', materialiIds: [], accessoriIds: [] },
]
