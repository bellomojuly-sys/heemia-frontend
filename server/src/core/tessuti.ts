// Tessuti, composizioni e consigli di cura — tabella approvata dall'azienda.
//
// Fonte: la pagina Notion **CONSIGLI DEL TEAM** (HEEMIA / prodotti e collezioni), letta il
// 2026-09-07. Su Notion la stessa cosa vive come formula di database; qui è una tabella,
// perché una formula non si può leggere dall'API e soprattutto perché questa regola deve
// valere anche per i capi che nascono nell'app, non solo per quelli che arrivano da Notion.
//
// **Come funziona.** Il tessuto è la chiave: scelto quello, composizione e consigli di cura
// si compilano da soli. Restano modificabili — un capo foderato o particolare può avere una
// composizione sua — ma il caso normale non richiede di riscrivere quattro righe di testo a
// mano, che è il modo in cui due capi con lo stesso tessuto finiscono con istruzioni diverse.
//
// ⚠️ **I testi non si riscrivono.** Sono istruzioni di lavaggio che finiscono addosso al
// capo di un cliente: se un consiglio va cambiato, si cambia sulla pagina Notion e poi qui,
// non si "migliora" passando. L'unico intervento fatto sul testo originale è tipografico:
// su Notion le frasi erano righe separate di una cella e arrivano attaccate
// ("delicato.Asciugare"), quindi sono state rimesse su righe distinte.
import { stessaComposizione } from './composizione.js'

export interface Tessuto {
  /** Nome commerciale, come lo usa l'azienda e come sta nel censimento. */
  nome: string
  composizione: string
  consigliCura: string
}

export const TESSUTI: Tessuto[] = [
  {
    nome: 'piquè',
    composizione: '80% Cotone - 10% Poliestere - 10% Elastan',
    consigliCura: [
      'Lavare a mano in acqua fredda (max 30°C) con un detersivo delicato.',
      "Asciugare all'aria su una superficie piana, lontano da fonti di calore dirette.",
      'Stirare a bassa temperatura, preferibilmente con il capo rovesciato per proteggere la qualità del tessuto.',
      'Evitare il contatto con superfici dure, poiché lo sfregamento potrebbe causare pilling, danneggiando la superficie del capo.',
    ].join('\n'),
  },
  {
    // ⚠️ Questa riga è del **filato cremoso**, non della viscosa: sono due filati diversi
    // (Giulia, 2026-09-07). Il 2026-09-07 erano stati trattati come lo stesso, perché la
    // descrizione di Cali dice «in cremoso» mentre il suo tessuto è «viscosa» — un errore,
    // corretto lo stesso giorno. La **viscosa non ha una riga**: finché non arriva, i capi
    // in viscosa restano senza composizione e l'app li segnala.
    nome: 'cremoso',
    composizione: '65% Viscosa - 35% Poliammide',
    consigliCura: [
      'Lavare a mano in acqua fredda (max 30°C) con detersivo delicato.',
      "Asciugare all'aria su una superficie piana, lontano da fonti di calore.",
      'Stirare a bassa temperatura, proteggendo il capo con un panno.',
    ].join('\n'),
  },
  {
    nome: 'lycra',
    composizione: '80% Poliestere - 20% Elastan',
    consigliCura: [
      'Lavare a mano in acqua fredda (max 30°C) con un detersivo delicato per preservare la qualità del tessuto.',
      "Asciugare all'aria su una superficie piana, evitando l'esposizione a fonti di calore diretto.",
      'Stirare a bassa temperatura, preferibilmente con il capo rovesciato per proteggere la fibra.',
    ].join('\n'),
  },
  {
    nome: 'costina',
    composizione: '95% Cotone - 5% Elastan',
    consigliCura: [
      'Per i capi colorati, evitare cicli ad alte temperature per mantenere il colore vivo nel tempo.',
      'I capi bianchi possono essere lavati anche fino a 60°C, se necessario.',
      'Utilizzare un detersivo delicato e preferibilmente non aggressivo sui colori.',
      "Stirare a temperatura media, con il capo rovesciato, per proteggere l'elasticità della fibra.",
    ].join('\n'),
  },
  {
    nome: 'gigiotto',
    composizione: '65% Cotone - 35% Poliestere',
    consigliCura: [
      'Primo lavaggio: per evitare che la garzatura interna possa lasciare del pelo sui capi sottostanti, si consiglia di fare un primo lavaggio a freddo (max 30°C) prima di indossarlo.',
      'Lavare con un detersivo delicato per preservare la qualità del tessuto.',
      "Evitare l'uso dell'asciugatrice e lasciare asciugare il capo all'aria su una superficie piana.",
      'Stirare a bassa temperatura, preferibilmente con il capo rovesciato per proteggere la fibra.',
    ].join('\n'),
  },
  {
    nome: 'lana',
    composizione: '100% Lana',
    consigliCura: [
      'Lavare a mano in acqua fredda (max 30°C) con un detergente specifico per lana.',
      'Non utilizzare centrifuga: il movimento meccanico può alterare la fibra.',
      "Asciugare il capo steso in piano, lontano da fonti di calore dirette, per evitare deformazioni dovute al peso dell'acqua.",
      "Stirare a bassa temperatura, preferibilmente con il capo rovesciato e con l'ausilio di un panno protettivo.",
      "L'eventuale formazione di pilling è un fenomeno fisiologico della fibra naturale. Per mantenere la superficie uniforme, utilizzare pettini o spazzole per lana.",
    ].join('\n'),
  },
  {
    nome: 'caldo cotone',
    composizione: '82% Cotone biologico - 16% Poliammide - 2% Elastan',
    consigliCura: [
      'Lavare a mano in acqua fredda (max 30°C) con un detersivo delicato.',
      "Asciugare all'aria su una superficie piana, lontano da fonti di calore dirette.",
      'Stirare a bassa temperatura, preferibilmente con il capo rovesciato per proteggere la fibra.',
    ].join('\n'),
  },
  {
    nome: 'alpaca',
    composizione: '57% Poliammide - 42% Alpaca - 1% Elastan',
    consigliCura: [
      'Lavare in lavatrice con ciclo lana o delicati a freddo utilizzando un detergente specifico per fibre pregiate.',
      'Evitare centrifuga e non utilizzare asciugatrice.',
      'Asciugare il capo steso in piano, lontano da fonti di calore dirette.',
      'Stirare a bassa temperatura, preferibilmente con il capo rovesciato.',
      "Per mantenere l'effetto soffice della garzatura, è sufficiente spazzolare delicatamente il capo con una spazzola per tessuti: il pelo si ravviva e torna alla sua naturale morbidezza.",
    ].join('\n'),
  },
  {
    nome: 'misto lana',
    composizione: '70% Acrilico - 30% Lana',
    consigliCura: [
      'Lavare esclusivamente a freddo, evitando centrifuga.',
      "Durante l'asciugatura, non appendere il capo: il peso dell'acqua potrebbe alterarne la forma. Stenderlo invece in piano su una superficie traspirante.",
      "L'eventuale formazione di pilling è un fenomeno fisiologico legato alla fibra naturale. Per ripristinare la superficie uniforme del filato, si consiglia l'utilizzo di pettini o spazzole per maglieria.",
    ].join('\n'),
  },
  {
    nome: 'luis',
    composizione: '100% Cotone (felpa)',
    consigliCura: [
      'Lavare in lavatrice max 30°C con ciclo delicato e detergente neutro.',
      'Evitare asciugatrice e temperature elevate: il calore può compromettere la morbidezza della garzatura e alterare la brillantezza dei colori.',
      "Asciugare all'aria, preferibilmente in piano o appeso, lontano da fonti di calore dirette.",
      "Stirare a temperatura media, con il capo rovesciato, per preservare sia la fibra che l'intensità cromatica.",
    ].join('\n'),
  },
  {
    nome: 'cotone',
    composizione: '100% Cotone (maglieria)',
    consigliCura: [
      'Lavare in lavatrice max 30°C con ciclo delicato e detergente neutro.',
      'Evitare centrifughe troppo energiche che possano stressare la fibra.',
      'Asciugare il capo steso in piano: la maglieria in cotone, da bagnata, è pesante e se appesa può allungarsi o deformarsi.',
      'Stirare a temperatura media, con il capo rovesciato, per preservare la struttura della maglia.',
    ].join('\n'),
  },
  {
    nome: 'jersey',
    composizione: '100% Cotone (jersey)',
    consigliCura: [
      'Lavare in lavatrice a 30°C (anche temperature superiori se necessario).',
      "Adatto anche all'uso di asciugatrice a temperatura moderata.",
      'Il capo può essere asciugato sia steso che appeso.',
      'Stirare a temperatura medio-alta, preferibilmente con il capo rovesciato per preservare la superficie del tessuto.',
    ].join('\n'),
  },
]

const PER_NOME = new Map(TESSUTI.map((t) => [t.nome.toLowerCase(), t]))

/**
 * Riconosce una coppia composizione+consigli **prodotta da questa tabella**. Serve a una
 * cosa sola: quando un tessuto esce dalla tabella — perché la regola era sbagliata, come è
 * successo alla viscosa — i valori che avevamo derivato vanno tolti, mentre un testo scritto
 * a mano da una persona non si tocca. Combaciare su entrambi i campi è un segnale forte che
 * il valore l'abbiamo messo noi.
 *
 * I consigli di cura si confrontano alla lettera: sono paragrafi interi, e due paragrafi
 * identici non capitano per caso. La composizione invece si confronta **normalizzata**
 * (`core/composizione.ts`), perché da quando il campo si compila da solo la stessa
 * composizione può essere scritta «80% Cotone - 20% Elastan» in tabella e «80% Cotone /
 * 20% Elastan» sul capo: sono lo stesso valore, ed è ancora nostro.
 */
export function derivatoDaTabella(composizione: string | null, consigliCura: string | null): boolean {
  if (!composizione || !consigliCura) return false
  return TESSUTI.some((t) => stessaComposizione(t.composizione, composizione) && t.consigliCura === consigliCura)
}

/**
 * Composizione e consigli per un tessuto. Restituisce `null` per un tessuto che la tabella
 * non conosce — e i casi noti sono tre:
 *
 *   - **`viscosa`** (9 capi): la riga «filato cremoso» è di un altro filato. La composizione
 *     della viscosa non è documentata da nessuna parte.
 *   - **`fodera`**: non è mai il tessuto principale di un capo, ma un accompagnamento.
 *   - **combinazioni** come `gigiotto+fodera` (3 capi): la composizione di un capo foderato
 *     non è quella del solo tessuto esterno, e nessun documento dice come scriverla.
 *
 * In tutti e tre i casi il campo resta vuoto e l'app lo segnala fra le azioni richieste:
 * meglio un buco visibile che un'etichetta di lavaggio inventata.
 */
export function tessutoConosciuto(nome: string | null | undefined): Tessuto | null {
  return PER_NOME.get((nome ?? '').trim().toLowerCase()) ?? null
}

/**
 * Da quale riga di magazzino arriva il tessuto di un capo.
 *
 * **Confermata da Giulia il 2026-09-09, nome per nome.** Non è una somiglianza calcolata:
 * i nomi del censimento e quelli del magazzino non coincidono quasi mai, e indovinare qui
 * significa attaccare a un capo il costo di un altro tessuto. Il precedente è [[DEC-065]] —
 * «viscosa» e «cremoso» dati per lo stesso filato, 9 capi con la composizione sbagliata.
 *
 * **Le assenze sono decisioni, non buchi da riempire.** `cotone`, `viscosa`, `alpaca`,
 * `lana` e `misto lana` sono tessuti veri che in magazzino **non esistono** (in particolare
 * `cotone` NON è `caldo cotone`: sono due tessuti diversi, Giulia 2026-09-09). I capi
 * foderati restano aperti di proposito: un capo foderato usa due materiali, e quale fodera
 * sia — Mirtillo o Piuma Perla — non lo dice nessun documento. In entrambi i casi il capo
 * resta senza collegamento e l'app lo segnala fra le azioni richieste.
 */
export const MATERIALE_PER_TESSUTO: Record<string, string> = {
  'piquè': 'MAT-111', // Felpa Piqué
  'gigiotto': 'MAT-110', // Felpa Gigiotto — a magazzino era scritto "Gigiotop": la parola
  // corretta è "gigiotto" (Giulia, 2026-09-09), corretta anche nel censimento.
  'luis': 'MAT-108', // Felpa Louis
  'caldo cotone': 'MAT-101',
  'costina': 'MAT-109',
  'lycra': 'MAT-112', // Lycra lucida
  'jersey': 'MAT-103',
}

/**
 * Il codice della riga di magazzino per un tessuto, o `null` se quel tessuto non ha una
 * riga. `null` è una risposta legittima e frequente: 28 capi su 93 stanno così.
 */
export function codiceMaterialePerTessuto(nome: string | null | undefined): string | null {
  return MATERIALE_PER_TESSUTO[(nome ?? '').trim().toLowerCase()] ?? null
}
