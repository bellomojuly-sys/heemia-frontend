// Le quattro aree dell'app, e i colori che le rappresentano.
//
// **Perché i colori significano qualcosa.** Nella dashboard le card erano tutte bianche
// con il numero nero: sette rettangoli identici, e per capire quale fosse quale bisognava
// leggere l'etichetta di ciascuno. Colorarle a caso non avrebbe aiutato — sarebbe stato
// più rumore, non più informazione.
//
// Il colore qui dice **dove porta la card**, e riprende la divisione che la barra laterale
// usa già: Prodotto, Inventario, Economico, Relazioni. Chi impara che il blu è il prodotto
// e il verde il magazzino non ha più bisogno di leggere: riconosce il gruppo a colpo
// d'occhio e legge solo la card che gli serve. È la stessa ragione per cui gli scaffali di
// un magazzino hanno le corsie contrassegnate.
//
// I toni sono quelli desaturati del sistema (UI_Design_System.md): il colore serve a
// raggruppare, non a gridare. Il carminio resta fuori da questa scala perché non è
// un'area, è uno stato — «questa cosa è critica» — e deve poter comparire su qualunque
// card senza che il suo significato dipenda da dove sta.

export type Area = 'prodotto' | 'inventario' | 'economico' | 'relazioni'

export interface StileArea {
  etichetta: string
  /** Barra verticale a sinistra della card: è il segno che si vede per primo. */
  barra: string
  /** Colore del numero grande. */
  valore: string
  /** Icona di categoria in alto a destra. */
  icona: string
  /** Fondo tenue, per le intestazioni di sezione. */
  fondo: string
  /** Bordo colorato tenue, per le card di sezione. */
  bordo: string
}

export const AREE: Record<Area, StileArea> = {
  prodotto: {
    etichetta: 'Prodotto',
    barra: 'bg-heemia-blue',
    valore: 'text-heemia-blue',
    icona: 'text-heemia-blue',
    fondo: 'bg-heemia-blue-light',
    bordo: 'border-heemia-blue/25',
  },
  inventario: {
    etichetta: 'Inventario',
    barra: 'bg-heemia-green',
    valore: 'text-heemia-green',
    icona: 'text-heemia-green',
    fondo: 'bg-heemia-green-light',
    bordo: 'border-heemia-green/25',
  },
  economico: {
    etichetta: 'Economico',
    barra: 'bg-heemia-orange',
    valore: 'text-heemia-orange',
    icona: 'text-heemia-orange',
    fondo: 'bg-heemia-orange-light',
    bordo: 'border-heemia-orange/25',
  },
  relazioni: {
    etichetta: 'Relazioni e sistema',
    barra: 'bg-heemia-plum',
    valore: 'text-heemia-plum',
    icona: 'text-heemia-plum',
    fondo: 'bg-heemia-plum-light',
    bordo: 'border-heemia-plum/25',
  },
}

/**
 * Stato critico: vince sempre sull'area.
 *
 * Il colore dell'area risponde a «di cosa parla questa card», il carminio a «qui c'è un
 * problema». Se una card critica prendesse il colore della sua area, la seconda domanda
 * non avrebbe risposta — ed è quella per cui si apre la dashboard al mattino.
 */
export const STILE_CRITICO = {
  barra: 'bg-heemia-carmine',
  valore: 'text-heemia-carmine',
  icona: 'text-heemia-carmine',
  fondo: 'bg-heemia-carmine-light',
  bordo: 'border-heemia-carmine/30',
}
