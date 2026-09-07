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
    // Sulla tabella questa riga è indicata come «filato cremoso». Nel censimento e nel
    // database Notion il tessuto si chiama «viscosa», ed è lo stesso: la descrizione di
    // Cali («Pantalone cargo unisex in cremoso») ha il tessuto «viscosa». Da confermare
    // con Giulia se un giorno i due nomi dovessero separarsi.
    nome: 'viscosa',
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
 * Composizione e consigli per un tessuto. Restituisce `null` per un tessuto che la tabella
 * non conosce — e sono due i casi noti:
 *
 *   - **`fodera`**: nella tabella non c'è, perché non è mai il tessuto principale di un capo
 *     ma un accompagnamento (i capi foderati nel censimento hanno «gigiotto+fodera»).
 *   - **combinazioni** come `gigiotto+fodera`: la composizione di un capo foderato non è
 *     quella del solo tessuto esterno, e nessun documento dice come scriverla. Restano da
 *     compilare a mano: meglio vuoto che un'etichetta di lavaggio inventata.
 */
export function tessutoConosciuto(nome: string | null | undefined): Tessuto | null {
  return PER_NOME.get((nome ?? '').trim().toLowerCase()) ?? null
}
