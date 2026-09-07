// Ordinamento e raggruppamento del catalogo. Logica pura: nessun React, nessuna chiamata
// all'API — riceve i capi e le varianti che il DataStore ha già preso dal server e
// restituisce l'ordine in cui vanno letti.
//
// Sta in un file a sé perché è **una decisione di lettura, non di dati**: il catalogo non
// cambia, cambia il modo di consultarlo. Tenerla dentro la pagina avrebbe legato una cosa
// che si prova e si cambia spesso a un componente di trecento righe.

import type { Product, ProductVariant } from '../types'
import { stageLabel } from './production'

export type Ordinamento = 'alfabetico' | 'alfabetico-inverso' | 'fase' | 'prezzo-alto' | 'prezzo-basso' | 'codice'
export type Raggruppamento = 'nessuno' | 'prodotto' | 'categoria' | 'linea' | 'fase'

export const ORDINAMENTI: { id: Ordinamento; label: string }[] = [
  { id: 'alfabetico', label: 'Nome A → Z' },
  { id: 'alfabetico-inverso', label: 'Nome Z → A' },
  { id: 'fase', label: 'Fase nel percorso' },
  { id: 'prezzo-alto', label: 'Prezzo, dal più alto' },
  { id: 'prezzo-basso', label: 'Prezzo, dal più basso' },
  { id: 'codice', label: 'Codice prodotto' },
]

export const RAGGRUPPAMENTI: { id: Raggruppamento; label: string; descrizione: string }[] = [
  { id: 'nessuno', label: 'Elenco piatto', descrizione: 'Un capo per riga, senza intestazioni.' },
  { id: 'prodotto', label: 'Per prodotto', descrizione: 'Ogni capo con le sue varianti taglia/colore sotto.' },
  { id: 'categoria', label: 'Per categoria', descrizione: 'Capi raggruppati per categoria merceologica.' },
  { id: 'linea', label: 'Per linea', descrizione: 'Tessile e maglieria separate.' },
  { id: 'fase', label: 'Per fase', descrizione: 'Dove si trova ogni capo lungo il percorso.' },
]

/**
 * Confronto fra nomi. `localeCompare` con `numeric` perché «Capo 2» deve venire prima di
 * «Capo 10»: l'ordine alfabetico puro li mette al contrario, ed è il tipo di dettaglio che
 * fa sembrare rotto un elenco altrimenti corretto.
 */
const perNome = (a: string, b: string) => a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' })

/** Indice della fase nel percorso: serve a ordinare per avanzamento e non per nome della fase. */
function indiceFase(p: Product, ordine: string[]): number {
  const i = ordine.indexOf(p.stato)
  return i === -1 ? ordine.length : i
}

export function ordinaProdotti(prodotti: Product[], ordinamento: Ordinamento, ordineFasi: string[]): Product[] {
  const righe = [...prodotti]
  switch (ordinamento) {
    case 'alfabetico':
      return righe.sort((a, b) => perNome(a.nome, b.nome))
    case 'alfabetico-inverso':
      return righe.sort((a, b) => perNome(b.nome, a.nome))
    case 'fase':
      // A parità di fase l'ordine è alfabetico: senza, capi nella stessa fase
      // comparirebbero in un ordine che cambia a ogni caricamento.
      return righe.sort((a, b) => indiceFase(a, ordineFasi) - indiceFase(b, ordineFasi) || perNome(a.nome, b.nome))
    case 'prezzo-alto':
      return righe.sort((a, b) => b.prezzoVendita - a.prezzoVendita || perNome(a.nome, b.nome))
    case 'prezzo-basso':
      return righe.sort((a, b) => a.prezzoVendita - b.prezzoVendita || perNome(a.nome, b.nome))
    case 'codice':
      return righe.sort((a, b) => perNome(a.codiceProdotto, b.codiceProdotto))
    default:
      return righe
  }
}

export interface GruppoCatalogo {
  chiave: string
  titolo: string
  /** Riga sotto il titolo del gruppo: quanti capi, e cosa hanno in comune. */
  sottotitolo: string
  prodotti: Product[]
}

/**
 * Raggruppa i capi. `prodotto` è il caso speciale: lì il gruppo È il capo, e quello che
 * sta sotto sono le sue varianti — che è la ragione per cui questa modalità serve, perché
 * il catalogo di 94 capi ha 828 varianti e in un elenco piatto non si vedono.
 */
export function raggruppaProdotti(
  prodotti: Product[],
  raggruppamento: Raggruppamento,
  varianti: ProductVariant[],
): GruppoCatalogo[] {
  if (raggruppamento === 'nessuno' || raggruppamento === 'prodotto') {
    return [{ chiave: 'tutti', titolo: '', sottotitolo: '', prodotti }]
  }

  const chiaveDi = (p: Product): string => {
    if (raggruppamento === 'categoria') return p.categoria?.trim() || 'Senza categoria'
    if (raggruppamento === 'linea') return p.linea === 'tessile' ? 'Tessile' : 'Maglieria'
    return stageLabel(p.stato)
  }

  const gruppi = new Map<string, Product[]>()
  for (const p of prodotti) {
    const k = chiaveDi(p)
    const attuale = gruppi.get(k)
    if (attuale) attuale.push(p)
    else gruppi.set(k, [p])
  }

  const elenco = [...gruppi.entries()].map(([titolo, righe]) => {
    const pezzi = righe.reduce(
      (s, p) => s + varianti.filter((v) => v.productId === p.id).length,
      0,
    )
    return {
      chiave: titolo,
      titolo,
      sottotitolo: `${righe.length} ${righe.length === 1 ? 'capo' : 'capi'} · ${pezzi} ${pezzi === 1 ? 'variante' : 'varianti'}`,
      prodotti: righe,
    }
  })

  // «Senza categoria» in fondo: è un gruppo di scarto, non una categoria vera, e in cima
  // sposterebbe l'attenzione sui capi incompleti invece che sul catalogo.
  return elenco.sort((a, b) =>
    a.titolo === 'Senza categoria' ? 1 : b.titolo === 'Senza categoria' ? -1 : perNome(a.titolo, b.titolo),
  )
}

/** Le varianti di un capo, ordinate in modo leggibile: prima il colore, poi la taglia. */
const ORDINE_TAGLIE = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'TU', 'UNICA']

export function indiceTaglia(taglia: string): number {
  const i = ORDINE_TAGLIE.indexOf(taglia.trim().toUpperCase())
  // Le taglie numeriche (38, 40, 42…) non stanno nella scala delle lettere: si ordinano
  // per valore, dopo quelle a lettera, invece di finire in ordine alfabetico (38, 4, 40).
  if (i !== -1) return i
  const n = Number(taglia.trim())
  return Number.isFinite(n) ? ORDINE_TAGLIE.length + n : ORDINE_TAGLIE.length + 1000
}

export function ordinaVarianti(varianti: ProductVariant[]): ProductVariant[] {
  return [...varianti].sort(
    (a, b) => perNome(a.colore, b.colore) || indiceTaglia(a.taglia) - indiceTaglia(b.taglia),
  )
}
