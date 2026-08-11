import { Truck, UsersRound } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { useDataStore } from '../../context/DataStore'

/** Anagrafica e documenti di conto lavorazione sono due letture dello stesso rapporto. */
export function SupplierWorkPage() {
  const { suppliers } = useDataStore()

  const sections = [
    {
      to: 'anagrafica',
      label: 'Fornitori',
      icon: UsersRound,
      description: `${suppliers.length} ${suppliers.length === 1 ? 'fornitore in anagrafica' : 'fornitori in anagrafica'}`,
    },
    {
      to: 'lavorazioni',
      label: 'Bolle e lavorazioni',
      icon: Truck,
      description: 'DDT, rientri e materiali presso terzisti',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Fornitori e lavorazioni"
        subtitle="Anagrafiche, contatti e materiali affidati ai lavoranti in un'unica vista operativa."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sections.map(({ to, label, icon: Icon, description }) => (
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
              <p className="font-mono-heemia text-xs text-heemia-grey">{description}</p>
            </div>
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  )
}
