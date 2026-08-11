import { useEffect, useState } from 'react'
import { useDataStore } from '../context/DataStore'
import { api, ApiError, num } from '../lib/api'

// Fase 13: i report mensili arrivano da GET /reports. Non esiste una tabella `reports`:
// come da Database_Schema il report è **generato al momento** dalle query su ordini,
// fatture e margini — quindi riflette sempre i dati correnti, non una fotografia salvata.
export interface MonthlyReportView {
  mese: string
  meseLabel: string
  generatoIl: string
  margineMedio: number
  costoMedioProdotto: number
  ricaviTotali: number
  costiTotali: number
  prodottoPiuCostoso: string | null
  prodottoMenoRedditizio: string | null
}

export function useServerReports(): MonthlyReportView[] {
  const { invoices, orders } = useDataStore()
  const [reports, setReports] = useState<MonthlyReportView[]>([])

  useEffect(() => {
    let annullato = false
    api
      .get<Record<string, unknown>[]>('/reports')
      .then((rows) => {
        if (annullato) return
        setReports(
          rows.map((r) => ({
            mese: String(r.mese),
            meseLabel: String(r.meseLabel),
            generatoIl: String(r.generatoIl),
            margineMedio: num(r.margineMedio),
            costoMedioProdotto: num(r.costoMedioProdotto),
            ricaviTotali: num(r.ricaviTotali),
            costiTotali: num(r.costiTotali),
            prodottoPiuCostoso: r.prodottoPiuCostoso ? String(r.prodottoPiuCostoso) : null,
            prodottoMenoRedditizio: r.prodottoMenoRedditizio ? String(r.prodottoMenoRedditizio) : null,
          })),
        )
      })
      .catch((e) => {
        if (annullato) return
        if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) setReports([])
      })
    return () => { annullato = true }
  }, [invoices, orders])

  return reports
}
