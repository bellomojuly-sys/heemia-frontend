import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'

// Backlog "Note" §10-11 — dati da Google Analytics 4, sempre passando dal backend
// (le credenziali del service account non escono mai dal server).
//
// Tre esiti distinti, che l'interfaccia deve saper mostrare in modo diverso:
//   - dati ok;
//   - integrazione non ancora collegata (503 GA_NOT_CONFIGURED) → si spiega cosa manca;
//   - errore vero di Google (502) → si mostra il messaggio tradotto dal server.

export type RangeAnalytics = 'today' | '7d' | '30d' | 'month' | 'custom'

export interface TotaliAnalytics {
  utenti: number
  sessioni: number
  nuoviUtenti: number
  visualizzazioniProdotto: number
  aggiunteCarrello: number
  checkoutAvviati: number
  articoliAcquistati: number
  acquisti: number
  ricavi: number
  tassoConversione: number
}

export interface ProdottoAnalytics {
  nome: string
  visualizzazioni: number
  aggiunteCarrello: number
  acquisti: number
}

export interface AnalyticsSummary {
  periodo: { startDate: string; endDate: string }
  periodoPrecedente: { startDate: string; endDate: string }
  totali: TotaliAnalytics
  totaliPrecedenti: TotaliAnalytics
  canali: { canale: string; sessioni: number; utenti: number }[]
  piuVisti: ProdottoAnalytics[]
  piuAggiunti: ProdottoAnalytics[]
  piuAcquistati: ProdottoAnalytics[]
}

export interface AnalyticsWidget {
  visualizzazioniProdotto: number
  aggiunteCarrello: number
  checkoutAvviati: number
  acquisti: number
  tassoConversione: number
  variazioneAggiunteCarrello: number | null
}

export interface StatoAnalytics<T> {
  dati: T | null
  caricamento: boolean
  /** true quando mancano property id o credenziali: non è un guasto, è da configurare. */
  daCollegare: boolean
  errore: string | null
}

function useEndpoint<T>(path: string, attivo = true): StatoAnalytics<T> & { ricarica: () => void } {
  const [stato, setStato] = useState<StatoAnalytics<T>>({ dati: null, caricamento: attivo, daCollegare: false, errore: null })
  const [tentativo, setTentativo] = useState(0)
  const ricarica = useCallback(() => setTentativo((n) => n + 1), [])

  useEffect(() => {
    if (!attivo) {
      setStato({ dati: null, caricamento: false, daCollegare: false, errore: null })
      return
    }
    let annullato = false
    setStato((s) => ({ ...s, caricamento: true }))
    api
      .get<T>(path)
      .then((d) => { if (!annullato) setStato({ dati: d, caricamento: false, daCollegare: false, errore: null }) })
      .catch((e) => {
        if (annullato) return
        if (e instanceof ApiError && e.code === 'GA_NOT_CONFIGURED') {
          setStato({ dati: null, caricamento: false, daCollegare: true, errore: e.message })
          return
        }
        // 401/403: il ruolo non vede il modulo. Nessun messaggio d'errore: la pagina è
        // comunque irraggiungibile dal menu, e il riquadro in dashboard semplicemente non c'è.
        if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) {
          setStato({ dati: null, caricamento: false, daCollegare: false, errore: null })
          return
        }
        setStato({ dati: null, caricamento: false, daCollegare: false, errore: e instanceof Error ? e.message : 'Errore sconosciuto' })
      })
    return () => { annullato = true }
  }, [path, attivo, tentativo])

  return { ...stato, ricarica }
}

export function useAnalyticsSummary(range: RangeAnalytics, from?: string, to?: string) {
  const query = new URLSearchParams({ range })
  if (range === 'custom' && from && to) { query.set('from', from); query.set('to', to) }
  // Con l'intervallo personalizzato incompleto non si chiama il server: risponderebbe 400.
  const attivo = range !== 'custom' || Boolean(from && to)
  return useEndpoint<AnalyticsSummary>(`/analytics/summary?${query.toString()}`, attivo)
}

export function useAnalyticsWidget(attivo: boolean) {
  return useEndpoint<AnalyticsWidget>('/analytics/widget', attivo)
}
