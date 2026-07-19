import type { Product, ProductVariant, ProductIdea } from '../types'

// Dati finti. Nomi capo e margini di riferimento (Maiorca Top, Amalfi Top) presi da
// 01_Business/Business_Analysis.md §3.3 per rappresentare il caso "margine sotto soglia" richiesto da UI_Design_System.
export const products: Product[] = [
  {
    id: 'prod-01', nome: 'Detroit', codiceProdotto: 'HE-TES-DET-01', categoria: 'Felpa', collezione: 'Urban FW26',
    stagione: 'FW26', linea: 'tessile', stato: 'in_vendita',
    descrizioneBreve: 'Felpa in piquet di cotone con vestibilità oversize.', descrizioneBreveStato: 'approvata',
    descrizioneEcommerce: 'Felpa Detroit: cotone piquet, taglio oversize, dettagli essenziali. Made in Italy.',
    descrizioneTecnica: 'Felpa girocollo, orlo a costina, tasca marsupio.',
    consigliCura: 'Lavaggio a 30°, non candeggiare, non asciugare in asciugatrice.', consigliCuraStato: 'approvata',
    vestibilita: 'Oversize', taglieDisponibili: ['XS', 'S', 'M', 'L', 'XL'], coloriDisponibili: ['Grigio melange', 'Nero'],
    immaginiUrl: [], prezzoVendita: 129.0, prezzoNettoIva: 105.74, prezzoShowroom: 99.0, prezzoConsigliato: 129.0,
    statoPubblicazioneShopify: 'pubblicato', disponibilitaOnline: true, disponibilitaShowroom: true, visibileShowroom: true,
  },
  {
    id: 'prod-02', nome: 'Helsinki', codiceProdotto: 'HE-TES-HEL-01', categoria: 'Pantalone', collezione: 'Urban FW26',
    stagione: 'FW26', linea: 'tessile', stato: 'produzione',
    descrizioneBreve: 'Pantalone in felpa Gigiotop con coulisse.', descrizioneBreveStato: 'bozza',
    consigliCuraStato: 'bozza',
    vestibilita: 'Regular', taglieDisponibili: ['S', 'M', 'L'], coloriDisponibili: ['Nero'],
    immaginiUrl: [], prezzoVendita: 149.0, prezzoNettoIva: 122.13, prezzoShowroom: 119.0, prezzoConsigliato: 149.0,
    statoPubblicazioneShopify: 'non_pubblicato', disponibilitaOnline: false, disponibilitaShowroom: false, visibileShowroom: false,
  },
  {
    id: 'prod-03', nome: 'Berlino', codiceProdotto: 'HE-TES-BER-01', categoria: 'T-shirt', collezione: 'Basic FW26',
    stagione: 'FW26', linea: 'tessile', stato: 'idea',
    descrizioneBreveStato: 'bozza', consigliCuraStato: 'bozza',
    taglieDisponibili: [], coloriDisponibili: [],
    immaginiUrl: [], prezzoVendita: 0, prezzoNettoIva: 0, prezzoShowroom: 0, prezzoConsigliato: 0,
    statoPubblicazioneShopify: 'non_pubblicato', disponibilitaOnline: false, disponibilitaShowroom: false, visibileShowroom: false,
  },
  {
    id: 'prod-04', personalizzabileSuMisura: true, nome: 'Vienna', codiceProdotto: 'HE-TES-VIE-01', categoria: 'Giacca', collezione: 'Core FW26',
    stagione: 'FW26', linea: 'tessile', stato: 'in_vendita',
    descrizioneBreve: 'Giacca destrutturata in twill di cotone.', descrizioneBreveStato: 'approvata',
    consigliCuraStato: 'approvata',
    vestibilita: 'Regular', taglieDisponibili: ['S', 'M', 'L', 'XL'], coloriDisponibili: ['Blu navy'],
    immaginiUrl: [], prezzoVendita: 0, prezzoNettoIva: 0, prezzoShowroom: 240.0, prezzoConsigliato: 260.0,
    statoPubblicazioneShopify: 'pubblicato', disponibilitaOnline: true, disponibilitaShowroom: true, visibileShowroom: true,
  },
  {
    id: 'prod-05', nome: 'Maiorca Top', codiceProdotto: 'HE-MAG-MAI-01', categoria: 'Top', collezione: 'Knit FW26',
    stagione: 'FW26', linea: 'maglieria', stato: 'in_vendita',
    descrizioneBreve: 'Top in filato misto lana a costine.', descrizioneBreveStato: 'approvata',
    consigliCura: 'Lavaggio a mano, non candeggiare, asciugare in piano.', consigliCuraStato: 'approvata',
    vestibilita: 'Slim', taglieDisponibili: ['XS', 'S', 'M'], coloriDisponibili: ['Grigio'],
    immaginiUrl: [], prezzoVendita: 89.0, prezzoNettoIva: 72.95, prezzoShowroom: 75.0, prezzoConsigliato: 95.0,
    statoPubblicazioneShopify: 'pubblicato', disponibilitaOnline: true, disponibilitaShowroom: true, visibileShowroom: true,
  },
  {
    id: 'prod-06', nome: 'Amalfi Top', codiceProdotto: 'HE-MAG-AMA-01', categoria: 'Top', collezione: 'Knit FW26',
    stagione: 'FW26', linea: 'maglieria', stato: 'in_vendita',
    descrizioneBreve: 'Top in lana vergine e alpaca.', descrizioneBreveStato: 'approvata',
    consigliCura: 'Lavaggio a mano, non candeggiare, asciugare in piano.', consigliCuraStato: 'approvata',
    vestibilita: 'Regular', taglieDisponibili: ['S', 'M', 'L'], coloriDisponibili: ['Cammello'],
    immaginiUrl: [], prezzoVendita: 99.0, prezzoNettoIva: 81.15, prezzoShowroom: 85.0, prezzoConsigliato: 105.0,
    statoPubblicazioneShopify: 'pubblicato', disponibilitaOnline: true, disponibilitaShowroom: true, visibileShowroom: true,
  },
  {
    id: 'prod-07', nome: 'Oslo', codiceProdotto: 'HE-MAG-OSL-01', categoria: 'Maglione', collezione: 'Knit FW26',
    stagione: 'FW26', linea: 'maglieria', stato: 'in_vendita',
    descrizioneBreve: 'Maglione in alpaca a girocollo.', descrizioneBreveStato: 'approvata',
    consigliCuraStato: 'approvata',
    vestibilita: 'Oversize', taglieDisponibili: ['S', 'M', 'L', 'XL'], coloriDisponibili: ['Cammello', 'Blu navy'],
    immaginiUrl: [], prezzoVendita: 260.0, prezzoNettoIva: 213.11, prezzoShowroom: 220.0, prezzoConsigliato: 260.0,
    statoPubblicazioneShopify: 'pubblicato', disponibilitaOnline: true, disponibilitaShowroom: true, visibileShowroom: true,
  },
  {
    id: 'prod-08', personalizzabileSuMisura: true, nome: 'Praga', codiceProdotto: 'HE-TES-PRA-01', categoria: 'Abito', collezione: 'Core FW26',
    stagione: 'FW26', linea: 'tessile', stato: 'prototipo',
    descrizioneBreveStato: 'bozza', consigliCuraStato: 'bozza',
    taglieDisponibili: ['S', 'M'], coloriDisponibili: ['Nero'],
    immaginiUrl: [], prezzoVendita: 220.0, prezzoNettoIva: 180.33, prezzoShowroom: 190.0, prezzoConsigliato: 220.0,
    statoPubblicazioneShopify: 'non_pubblicato', disponibilitaOnline: false, disponibilitaShowroom: false, visibileShowroom: false,
  },
  {
    id: 'prod-09', nome: 'Lisbona', codiceProdotto: 'HE-MAG-LIS-01', categoria: 'Cardigan', collezione: 'Knit FW26',
    stagione: 'FW26', linea: 'maglieria', stato: 'campionario',
    descrizioneBreveStato: 'bozza', consigliCuraStato: 'bozza',
    taglieDisponibili: ['S', 'M', 'L'], coloriDisponibili: ['Crema'],
    immaginiUrl: [], prezzoVendita: 180.0, prezzoNettoIva: 147.54, prezzoShowroom: 150.0, prezzoConsigliato: 180.0,
    statoPubblicazioneShopify: 'non_pubblicato', disponibilitaOnline: false, disponibilitaShowroom: false, visibileShowroom: false,
  },
  {
    id: 'prod-10', personalizzabileSuMisura: true, nome: 'Copenaghen', codiceProdotto: 'HE-TES-COP-01', categoria: 'Cappotto', collezione: 'Core FW25',
    stagione: 'FW25', linea: 'tessile', stato: 'archivio',
    descrizioneBreve: 'Cappotto doppiopetto in lana.', descrizioneBreveStato: 'approvata',
    consigliCuraStato: 'approvata',
    vestibilita: 'Regular', taglieDisponibili: ['M', 'L'], coloriDisponibili: ['Blu navy'],
    immaginiUrl: [], prezzoVendita: 450.0, prezzoNettoIva: 368.85, prezzoShowroom: 380.0, prezzoConsigliato: 450.0,
    statoPubblicazioneShopify: 'pubblicato', disponibilitaOnline: false, disponibilitaShowroom: false, visibileShowroom: false,
  },
]

export const productVariants: ProductVariant[] = [
  { id: 'var-01', productId: 'prod-01', sku: 'HE-TES-DET-01-M-GRI', taglia: 'M', colore: 'Grigio melange', stockDisponibile: 24, stockRiservato: 2, statoDisponibilita: 'disponibile' },
  { id: 'var-02', productId: 'prod-01', sku: 'HE-TES-DET-01-L-NER', taglia: 'L', colore: 'Nero', stockDisponibile: 3, stockRiservato: 0, statoDisponibilita: 'low_stock' },
  { id: 'var-03', productId: 'prod-04', sku: 'HE-TES-VIE-01-M-BLU', taglia: 'M', colore: 'Blu navy', stockDisponibile: 0, stockRiservato: 0, statoDisponibilita: 'esaurito' },
  { id: 'var-04', productId: 'prod-05', sku: 'HE-MAG-MAI-01-S-GRI', taglia: 'S', colore: 'Grigio', stockDisponibile: 12, stockRiservato: 1, statoDisponibilita: 'disponibile' },
  { id: 'var-05', productId: 'prod-06', sku: 'HE-MAG-AMA-01-M-CAM', taglia: 'M', colore: 'Cammello', stockDisponibile: 8, stockRiservato: 0, statoDisponibilita: 'disponibile' },
  { id: 'var-06', productId: 'prod-07', sku: 'HE-MAG-OSL-01-L-CAM', taglia: 'L', colore: 'Cammello', stockDisponibile: 15, stockRiservato: 3, statoDisponibilita: 'disponibile' },
]

export const productIdeas: ProductIdea[] = [
  { id: 'idea-01', nome: 'Kyoto', concept: 'Giacca kimono in misto lino, ispirazione workwear giapponese.', materialiStimati: 'Lino/cotone 55/45', quantitaStimate: 120, stato: 'nuova' },
  { id: 'idea-02', nome: 'Reykjavik', concept: 'Maglione a trecce in lana vergine pesante.', materialiStimati: 'Lana vergine', quantitaStimate: 80, stato: 'in_valutazione', noteCreative: 'Valutare peso capo per fascia Premium.' },
]
