// Backlog "Note" §9 — "Azioni richieste".
//
// Gli alert che arrivano dal server (FR-27) sono righe tecniche: un messaggio unico, un
// modulo e un livello. La nota chiede invece poche categorie e, per ogni riga, quattro
// informazioni distinte: titolo breve, motivo, prodotto coinvolto, azione consigliata.
//
// La traduzione avviene qui, lato client, senza toccare lo schema dati: l'id dell'alert è
// già un identificatore stabile del tipo di segnalazione (`alert-<tipo>-<entità>`), quindi
// basta leggerne il prefisso. Il fallback sul modulo copre eventuali alert nuovi aggiunti
// lato server prima che questa tabella venga aggiornata: finiscono in "Attività urgenti"
// invece di sparire.
import type { AlertItem, Product } from '../types'

export type CategoriaAzione =
  | 'documenti'
  | 'campioni'
  | 'bloccati'
  | 'stock'
  | 'sincronizzazione'
  | 'urgenti'

export const CATEGORIE_AZIONE: { id: CategoriaAzione; label: string; descrizione: string }[] = [
  { id: 'documenti', label: 'Documenti mancanti', descrizione: 'Dati o allegati che mancano per procedere.' },
  { id: 'campioni', label: 'Campioni da approvare', descrizione: 'Capi fermi in attesa del controllo campione.' },
  { id: 'bloccati', label: 'Prodotti bloccati', descrizione: 'Lavorazioni ferme per un blocco esplicito.' },
  { id: 'stock', label: 'Stock basso', descrizione: 'Scorte sotto soglia o esaurite.' },
  { id: 'sincronizzazione', label: 'Errori di sincronizzazione', descrizione: 'Disallineamenti con Shopify.' },
  { id: 'urgenti', label: 'Attività urgenti', descrizione: 'Scadenze, incassi e ordini da prendere in carico.' },
]

interface Regola {
  categoria: CategoriaAzione
  titolo: string
  azione: string
}

// Chiave = prefisso dell'id alert generato da server/src/modules/alerts/service.ts.
// Ordine significativo: si prende la prima chiave che combacia, quindi i prefissi più
// lunghi (alert-inv-scaduta-) vanno prima di quelli più corti (alert-inv-).
const REGOLE: [string, Regola][] = [
  ['alert-nosheet-', { categoria: 'documenti', titolo: 'Scheda tecnica mancante', azione: 'Apri prodotto' }],
  ['alert-incompletecost-', { categoria: 'documenti', titolo: 'Costi della scheda incompleti', azione: 'Apri prodotto' }],
  ['alert-noprice-', { categoria: 'documenti', titolo: 'Prezzo di vendita mancante', azione: 'Apri prodotto' }],
  ['alert-inv-assoc-', { categoria: 'documenti', titolo: 'Fattura da associare', azione: 'Apri fatture' }],
  ['alert-campione-', { categoria: 'campioni', titolo: 'Campione da approvare', azione: 'Apri prodotto' }],
  ['alert-bloccato-', { categoria: 'bloccati', titolo: 'Lavorazione bloccata', azione: 'Apri prodotto' }],
  ['alert-mat-', { categoria: 'stock', titolo: 'Tessuto in esaurimento', azione: 'Apri tessuti' }],
  ['alert-acc-', { categoria: 'stock', titolo: 'Accessorio in esaurimento', azione: 'Apri accessori' }],
  ['alert-lab-soglia-', { categoria: 'stock', titolo: 'Laboratorio da reintegrare', azione: 'Apri inventario' }],
  ['alert-stock-div-', { categoria: 'sincronizzazione', titolo: 'Stock diverso da Shopify', azione: 'Apri inventario' }],
  ['alert-shopify-cost-', { categoria: 'sincronizzazione', titolo: 'Pubblicato senza costi', azione: 'Apri prodotto' }],
  ['alert-inv-scaduta-', { categoria: 'urgenti', titolo: 'Fattura scaduta', azione: 'Apri scadenze' }],
  ['alert-inv-7-', { categoria: 'urgenti', titolo: 'Fattura in scadenza', azione: 'Apri scadenze' }],
  ['alert-inv-30-', { categoria: 'urgenti', titolo: 'Fattura in scadenza', azione: 'Apri scadenze' }],
  ['alert-chiusura-', { categoria: 'urgenti', titolo: 'Chiusura di cassa da registrare', azione: 'Apri fatture' }],
  ['alert-sumisura-', { categoria: 'urgenti', titolo: 'Ordine su misura da lavorare', azione: 'Apri ordini' }],
  ['alert-margin-', { categoria: 'urgenti', titolo: 'Margine sotto soglia', azione: 'Apri prodotto' }],
  ['alert-breakeven-', { categoria: 'urgenti', titolo: 'Prezzo sotto break-even', azione: 'Apri prodotto' }],
]

export interface AzioneRichiesta {
  id: string
  categoria: CategoriaAzione
  livello: AlertItem['livello']
  titolo: string
  /** Il messaggio dell'alert, ripulito dal nome del prodotto già mostrato a parte. */
  motivo: string
  prodotto?: { nome: string; link: string }
  azione: string
  link?: string
}

function regolaPer(alert: AlertItem): Regola {
  const trovata = REGOLE.find(([prefisso]) => alert.id.startsWith(prefisso))
  if (trovata) return trovata[1]
  return { categoria: 'urgenti', titolo: alert.modulo, azione: 'Apri' }
}

/**
 * Traduce gli alert in azioni raggruppabili. `products` serve solo a riconoscere il capo
 * coinvolto: se `entitaId` è un prodotto, il nome esce dal messaggio e diventa un campo a sé
 * (la nota chiede il prodotto come informazione distinta dal motivo).
 */
export function toAzioni(alerts: AlertItem[], products: Product[] = []): AzioneRichiesta[] {
  const perId = new Map(products.map((p) => [p.id, p]))
  return alerts.map((a) => {
    const regola = regolaPer(a)
    const prodotto = a.entitaId ? perId.get(a.entitaId) : undefined
    // I messaggi dei prodotti nascono come "Nome: motivo": tolto il prefisso resta il solo motivo.
    const motivo = prodotto && a.messaggio.startsWith(`${prodotto.nome}: `)
      ? a.messaggio.slice(prodotto.nome.length + 2)
      : a.messaggio
    return {
      id: a.id,
      categoria: regola.categoria,
      livello: a.livello,
      titolo: regola.titolo,
      motivo: motivo.charAt(0).toUpperCase() + motivo.slice(1),
      prodotto: prodotto ? { nome: prodotto.nome, link: `/prodotti/${prodotto.id}` } : undefined,
      azione: regola.azione,
      link: a.link,
    }
  })
}

const RANK_LIVELLO: Record<AlertItem['livello'], number> = { critico: 0, attenzione: 1, info: 2 }

export interface GruppoAzioni {
  id: CategoriaAzione
  label: string
  descrizione: string
  azioni: AzioneRichiesta[]
}

/** Gruppi non vuoti, nell'ordine di CATEGORIE_AZIONE, con i critici in cima a ogni gruppo. */
export function raggruppaAzioni(azioni: AzioneRichiesta[]): GruppoAzioni[] {
  return CATEGORIE_AZIONE.map((c) => ({
    ...c,
    id: c.id,
    azioni: azioni
      .filter((a) => a.categoria === c.id)
      .sort((a, b) => RANK_LIVELLO[a.livello] - RANK_LIVELLO[b.livello]),
  })).filter((g) => g.azioni.length > 0)
}
