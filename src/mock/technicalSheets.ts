import type { TechnicalSheet } from '../types'

// Scheda tecnica esiste in 3 versioni (FR-14). prod-03 (Berlino) non ha ancora nessuna scheda:
// rappresenta il blocco "scheda tecnica assente prima di Produzione" richiesto da FR-07.
export const technicalSheets: TechnicalSheet[] = [
  {
    id: 'ts-01', productId: 'prod-01', versione: 'finale', tessutoPrincipaleId: 'mat-01', tessutiSecondariId: [],
    accessoriIds: ['acc-01', 'acc-04'], composizioneCompleta: '100% Cotone', pesoCapoGrammi: 520,
    lavorazione: 'Taglio e cucito standard, orlo a costina', trattamenti: 'Nessuno',
    lavaggioConsigliato: 'Lavaggio a 30°, non candeggiare', difficoltaProduttiva: 'bassa', tempiStimatiOre: 1.5,
    costoManodopera: 30, costoTessuto: 16.65, costoAccessori: 1.4, costoPackaging: 0.9, altriCostiDiretti: 1.0,
    altriCostiIndiretti: 0, creataIl: '2026-04-10', archiviata: false,
  },
  {
    id: 'ts-02', productId: 'prod-02', versione: 'piazzamento', tessutoPrincipaleId: 'mat-02', tessutiSecondariId: [],
    accessoriIds: ['acc-02'], composizioneCompleta: '95% Cotone 5% Elastan', pesoCapoGrammi: 480,
    lavorazione: 'Taglio piazzato ottimizzato, coulisse in vita', trattamenti: 'Nessuno',
    lavaggioConsigliato: 'Lavaggio a 30°', difficoltaProduttiva: 'media', tempiStimatiOre: 2,
    costoManodopera: 40, costoTessuto: 13.0, costoAccessori: 5.6, costoPackaging: 0.9, altriCostiDiretti: 1.5,
    altriCostiIndiretti: 0, creataIl: '2026-05-02', archiviata: false,
  },
  {
    id: 'ts-03', productId: 'prod-04', versione: 'preliminare', tessutoPrincipaleId: 'mat-01', tessutiSecondariId: [],
    accessoriIds: [], composizioneCompleta: '100% Cotone twill', pesoCapoGrammi: 650,
    lavorazione: 'Giacca destrutturata, fodera parziale', trattamenti: 'Impermeabilizzante',
    lavaggioConsigliato: 'Lavaggio a secco', difficoltaProduttiva: 'alta', tempiStimatiOre: 4,
    costoManodopera: 80, costoTessuto: 0, costoAccessori: 0, costoPackaging: 1.2, altriCostiDiretti: 0,
    altriCostiIndiretti: 0, creataIl: '2026-03-20', archiviata: false,
  },
  {
    id: 'ts-04', productId: 'prod-05', versione: 'finale', tessutoPrincipaleId: 'mat-08', tessutiSecondariId: [],
    accessoriIds: [], composizioneCompleta: '59% Lana 41% Acrilico', pesoCapoGrammi: 280,
    lavorazione: 'Maglieria a costine', trattamenti: 'Nessuno', lavaggioConsigliato: 'Lavaggio a mano',
    difficoltaProduttiva: 'media', tempiStimatiOre: 2.5, costoManodopera: 50, costoTessuto: 16.0,
    costoAccessori: 0, costoPackaging: 0.9, altriCostiDiretti: 0.5, altriCostiIndiretti: 0,
    creataIl: '2026-02-15', archiviata: false,
  },
  {
    id: 'ts-05', productId: 'prod-06', versione: 'finale', tessutoPrincipaleId: 'mat-07', tessutiSecondariId: ['mat-06'],
    accessoriIds: [], composizioneCompleta: '70% Lana vergine 30% Alpaca', pesoCapoGrammi: 310,
    lavorazione: 'Maglieria fine gauge', trattamenti: 'Nessuno', lavaggioConsigliato: 'Lavaggio a mano',
    difficoltaProduttiva: 'media', tempiStimatiOre: 3, costoManodopera: 55, costoTessuto: 15.5,
    costoAccessori: 0, costoPackaging: 0.9, altriCostiDiretti: 0.5, altriCostiIndiretti: 0,
    creataIl: '2026-02-18', archiviata: false,
  },
  {
    id: 'ts-06', productId: 'prod-07', versione: 'finale', tessutoPrincipaleId: 'mat-06', tessutiSecondariId: [],
    accessoriIds: [], composizioneCompleta: '100% Alpaca', pesoCapoGrammi: 450,
    lavorazione: 'Maglieria girocollo oversize', trattamenti: 'Nessuno', lavaggioConsigliato: 'Lavaggio a mano',
    difficoltaProduttiva: 'media', tempiStimatiOre: 3.5, costoManodopera: 60, costoTessuto: 18.0,
    costoAccessori: 0, costoPackaging: 0.9, altriCostiDiretti: 0.5, altriCostiIndiretti: 0,
    creataIl: '2026-01-30', archiviata: false,
  },
  {
    id: 'ts-07', productId: 'prod-08', versione: 'preliminare', tessutoPrincipaleId: 'mat-01', tessutiSecondariId: [],
    accessoriIds: [], composizioneCompleta: '100% Cotone twill', pesoCapoGrammi: 580,
    lavorazione: 'Abito una manica, chiusura laterale', trattamenti: 'Nessuno', lavaggioConsigliato: 'Lavaggio a secco',
    difficoltaProduttiva: 'alta', tempiStimatiOre: 3.5, costoManodopera: 70, costoTessuto: 20.0,
    costoAccessori: 2.0, costoPackaging: 0.9, altriCostiDiretti: 1.0, altriCostiIndiretti: 0,
    creataIl: '2026-06-05', archiviata: false,
  },
  {
    id: 'ts-08', productId: 'prod-09', versione: 'preliminare', tessutoPrincipaleId: 'mat-03', tessutiSecondariId: [],
    accessoriIds: [], composizioneCompleta: '100% Cotone garzato', pesoCapoGrammi: 390,
    lavorazione: 'Cardigan aperto, tasche a toppa', trattamenti: 'Nessuno', lavaggioConsigliato: 'Lavaggio a mano',
    difficoltaProduttiva: 'media', tempiStimatiOre: 2.5, costoManodopera: 45, costoTessuto: 14.5,
    costoAccessori: 0, costoPackaging: 0.9, altriCostiDiretti: 0.5, altriCostiIndiretti: 0,
    creataIl: '2026-06-20', archiviata: false,
  },
]
