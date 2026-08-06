// Tipi e chiamate della vista cliente (spec 2026-08-06 §4-7). Vivono qui e non in
// src/types o src/lib/api.ts perché la sub-app cliente è uno scope a parte
// (System_Architecture A5): parla solo con /api/showroom e non conosce il gestionale.
import { api, ApiError, num } from '../../lib/api'

/** Un capo come lo vede il cliente: solo i campi autorizzati dalla whitelist del server. */
export interface CatalogItem {
  id: string
  nome: string
  categoria?: string | null
  collezione?: string | null
  descrizioneBreve?: string | null
  descrizioneEcommerce?: string | null
  immaginiUrl: string[]
  prezzoShowroom: number
  taglieDisponibili: string[]
  coloriDisponibili: string[]
  visibileShowroom: boolean
  personalizzabileSuMisura: boolean
  tempiRealizzazione?: string | null
  variants: { taglia: string; colore: string }[]
}

export interface VisitaCliente {
  visitId: string
  nome: string
  cognome: string
  email: string
  preferiti: string[]
}

/** L'accesso resta valido finché la scheda è aperta: chiudere il browser sul tablet dello
 *  showroom deve bastare a chiudere la sessione del cliente precedente. */
const CHIAVE_VISITA = 'heemia:showroom:visita:v1'

export function leggiVisita(): VisitaCliente | null {
  try {
    const raw = sessionStorage.getItem(CHIAVE_VISITA)
    if (!raw) return null
    const v = JSON.parse(raw) as VisitaCliente
    return v?.visitId ? v : null
  } catch {
    return null
  }
}

export function salvaVisita(v: VisitaCliente | null) {
  try {
    if (v) sessionStorage.setItem(CHIAVE_VISITA, JSON.stringify(v))
    else sessionStorage.removeItem(CHIAVE_VISITA)
  } catch {
    // Storage non disponibile (navigazione privata): la visita resta solo in memoria.
  }
}

export async function caricaCatalogo(): Promise<CatalogItem[]> {
  const righe = await api.showroom.get<CatalogItem[]>('/catalog')
  // I Decimal Prisma arrivano come stringhe: qui il prezzo torna numero (come in adapters.ts).
  return righe.map((r) => ({ ...r, prezzoShowroom: num(r.prezzoShowroom) }))
}

export function apriVisita(input: {
  nome: string
  cognome: string
  email: string
  consensoPrivacy: true
  consensoMarketing: boolean
}) {
  return api.showroom.post<VisitaCliente>('/visits', input)
}

/** Traccia la scheda aperta (spec §4). Non blocca l'interfaccia: se fallisce, pazienza. */
export function tracciaVista(visitId: string, productId: string) {
  api.showroom.post(`/visits/${visitId}/views`, { productId }).catch(() => {})
}

export function aggiungiPreferito(visitId: string, productId: string) {
  return api.showroom.post(`/visits/${visitId}/favorites`, { productId })
}

export function togliPreferito(visitId: string, productId: string) {
  return api.showroom.del(`/visits/${visitId}/favorites/${productId}`)
}

/**
 * L'accesso non è più valido (visita cancellata, database ripulito, tablet rimasto aperto
 * da una sessione vecchia): il server risponde 404. Senza questo controllo il cliente
 * resterebbe davanti a un errore che non può risolvere — invece si torna all'accesso.
 */
export function sessioneNonValida(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404 && e.message.toLowerCase().includes('sessione')
}

export interface RichiestaInput {
  visitId: string
  tipo: 'personalizzazione' | 'informazioni'
  productId: string
  tagliaBase?: string
  coloreDesiderato?: string
  lunghezza?: string
  modifiche?: string
  note?: string
  misure?: Record<string, string>
  dataDesiderata?: string
  immagini?: { nome: string; dataUrl: string }[]
}

export function inviaRichiesta(input: RichiestaInput) {
  return api.showroom.post<{ numero: string; prodotto: string }>('/requests', input)
}

/** Le due etichette che la specifica §3 chiede di mostrare al cliente. */
export function etichetteDisponibilita(p: CatalogItem): string[] {
  const badge: string[] = []
  if (p.visibileShowroom) badge.push('Presente in showroom')
  if (p.personalizzabileSuMisura) badge.push('Personalizzabile su misura')
  return badge
}

/** Frase di disponibilità: un capo non appeso ma su misura si ordina, non "manca". */
export function fraseDisponibilita(p: CatalogItem): string {
  if (p.visibileShowroom && p.personalizzabileSuMisura) {
    return 'Esposto in showroom e personalizzabile su misura.'
  }
  if (p.visibileShowroom) return 'Capo esposto in showroom, disponibile da provare.'
  return 'Disponibile su ordinazione e personalizzabile su misura.'
}
