import { NavLink, Outlet } from 'react-router-dom'
import { Calculator, LineChart } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { useLiveMargins } from '../../hooks/useLiveMargins'
import { useServerReports } from '../../hooks/useServerReports'
import type { EconomicsOutlet } from './economicsOutlet'

/**
 * Vista unica "Costi, margini e report" (2026-08-10): una voce di menu, due schede.
 * Stesso schema di FR-36 per l'Inventario. I report economici sono la lettura mensile
 * degli stessi margini che si calcolano nella prima scheda: separarli in due pagine
 * faceva sembrare due numeri diversi quello che è lo stesso numero.
 *
 * Il gating non cambia: `costi-margini` e `report` sono entrambi Admin/CEO.
 *
 * Margini e report si caricano una volta sola qui e scendono alle schede via outlet
 * context — prima ogni pagina rifaceva la sua chiamata a /margins.
 */
export function EconomicsPage() {
  const margins = useLiveMargins()
  const reports = useServerReports()

  const sottoSoglia = margins.filter((m) => m.sottoSoglia).length

  const SECTIONS = [
    {
      to: 'costi',
      label: 'Costi e margini',
      icon: Calculator,
      count: `${margins.length} ${margins.length === 1 ? 'prodotto calcolato' : 'prodotti calcolati'}`,
      alert: sottoSoglia > 0 ? `${sottoSoglia} sotto soglia` : '',
    },
    {
      to: 'report',
      label: 'Report economici',
      icon: LineChart,
      count:
        reports.length > 0
          ? `${reports.length} ${reports.length === 1 ? 'mese disponibile' : 'mesi disponibili'}`
          : 'nessun mese ancora',
      alert: '',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Costi, margini e report"
        subtitle="Costi fissi, margine per capo e lettura mensile dell'andamento economico in un'unica vista."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SECTIONS.map(({ to, label, icon: Icon, count, alert }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `surface-interactive flex items-center gap-3 rounded-heemia-lg border bg-white px-4 py-3.5 shadow-heemia-sm ${
                isActive ? 'border-heemia-black shadow-heemia-md' : 'border-heemia-border'
              }`
            }
          >
            <Icon aria-hidden className="h-5 w-5 shrink-0 text-heemia-grey" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-heemia-black">{label}</p>
              <p className="font-mono-heemia text-xs text-heemia-grey">
                {count}
                {alert && <span className="text-heemia-carmine"> · {alert}</span>}
              </p>
            </div>
          </NavLink>
        ))}
      </div>

      <Outlet context={{ margins, reports } satisfies EconomicsOutlet} />
    </div>
  )
}
