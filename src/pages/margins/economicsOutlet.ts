import { useOutletContext } from 'react-router-dom'
import type { MonthlyReportView } from '../../hooks/useServerReports'
import type { Margin } from '../../types'

/** Dati condivisi dalle schede della pagina unificata Costi, margini e report. */
export interface EconomicsOutlet {
  margins: Margin[]
  reports: MonthlyReportView[]
}

export function useEconomicsOutlet(): EconomicsOutlet {
  return useOutletContext<EconomicsOutlet>()
}
