import { useEffect, useState } from 'react'
import { useMockStore } from '../context/MockStore'
import { api, ApiError } from '../lib/api'

// Fase 13: i KPI della dashboard li calcola il server (GET /dashboard) sugli stessi criteri
// di lib/dashboard.ts. Il server nasconde alla fonte i KPI economici ai ruoli senza il
// modulo costi-margini, quindi alcuni campi possono mancare: la pagina li tratta come 0.
export interface DashboardKpis {
  prodottiTotali: number
  prodottiAttivi: number
  prodottiInSviluppo: number
  prodottiInProduzione: number
  prodottiProntiEcommerce: number
  prodottiPubblicati: number
  margineSottoTarget: number
  sottoBreakEven: number
  tessutiSottoSoglia: number
  accessoriSottoSoglia: number
  fattureNonAssociate: number
  prodottiSenzaSchedaTecnica: number
  prodottiSenzaPrezzo: number
  fabricLibraryCount: number
  capiInLaboratorio: number
  capiInMagazzino: number
  collezioniCount: number
  scadenze7gg: number
  scadenze30gg: number
  reportPronti: number
}

const VUOTI: DashboardKpis = {
  prodottiTotali: 0, prodottiAttivi: 0, prodottiInSviluppo: 0, prodottiInProduzione: 0,
  prodottiProntiEcommerce: 0, prodottiPubblicati: 0, margineSottoTarget: 0, sottoBreakEven: 0,
  tessutiSottoSoglia: 0, accessoriSottoSoglia: 0, fattureNonAssociate: 0,
  prodottiSenzaSchedaTecnica: 0, prodottiSenzaPrezzo: 0, fabricLibraryCount: 0,
  capiInLaboratorio: 0, capiInMagazzino: 0,
  collezioniCount: 0, scadenze7gg: 0, scadenze30gg: 0, reportPronti: 0,
}

export function useServerDashboard(): DashboardKpis {
  const { products, materials, accessories, invoices } = useMockStore()
  const [kpis, setKpis] = useState<DashboardKpis>(VUOTI)

  useEffect(() => {
    let annullato = false
    api
      .get<{ kpis: DashboardKpis }>('/dashboard')
      .then((d) => { if (!annullato) setKpis({ ...VUOTI, ...d.kpis }) })
      .catch((e) => {
        if (annullato) return
        if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) setKpis(VUOTI)
      })
    return () => { annullato = true }
  }, [products, materials, accessories, invoices])

  return kpis
}
