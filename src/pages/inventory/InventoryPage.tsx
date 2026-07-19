import { NavLink, Outlet } from 'react-router-dom'
import { Layers, Puzzle, PackageCheck } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { useMockStore } from '../../context/MockStore'

// FR-36: pagina unica Inventario, schede interne cliccabili invece di tre voci di menu
// separate (Decision_Log 2026-07-15). Le tre viste restano route annidate sotto /inventario
// (deep-link e link dashboard esistenti restano validi), ma la sidebar mostra una sola voce.
// I conteggi leggono dal MockStore: i record creati in sessione aggiornano anche le schede.
export function InventoryPage() {
  const { materials, accessories, inventoryRecords } = useMockStore()

  const SECTIONS = [
    {
      to: 'tessuti',
      label: 'Tessuti',
      icon: Layers,
      count: materials.length,
      alert: materials.filter((m) => m.stato === 'sotto_soglia' || m.stato === 'esaurito').length,
    },
    {
      to: 'accessori',
      label: 'Accessori',
      icon: Puzzle,
      count: accessories.length,
      alert: accessories.filter((a) => a.stato === 'sotto_soglia' || a.stato === 'esaurito').length,
    },
    {
      to: 'prodotti-finiti',
      label: 'Prodotti finiti',
      icon: PackageCheck,
      count: inventoryRecords.length,
      alert: inventoryRecords.filter((r) => r.stato === 'esaurito' || r.stato === 'low_stock').length,
    },
  ]

  return (
    <div>
      <PageHeader title="Inventario" subtitle="Tessuti, accessori e prodotti finiti in un'unica vista." />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SECTIONS.map(({ to, label, icon: Icon, count, alert }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-[3px] border bg-white px-4 py-3.5 transition-colors ${
                isActive ? 'border-heemia-black' : 'border-heemia-border hover:border-heemia-border-strong'
              }`
            }
          >
            <Icon aria-hidden className="h-5 w-5 shrink-0 text-heemia-grey" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-heemia-black">{label}</p>
              <p className="font-mono-heemia text-xs text-heemia-grey">
                {count} totali
                {alert > 0 && <span className="text-heemia-carmine"> · {alert} da verificare</span>}
              </p>
            </div>
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  )
}
