import { ScrollText, Settings2 } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { useMockStore } from '../../context/MockStore'
import { useRole } from '../../context/RoleContext'
import { canAccessModule, type ModuleKey } from '../../lib/permissions'

/** Preferenze operative e audit condividono lo stesso luogo, senza confonderne i permessi. */
export function SettingsHubPage() {
  const { role } = useRole()
  const { activityLogs } = useMockStore()

  const sections: {
    to: string
    label: string
    icon: typeof Settings2
    description: string
    moduleKey: ModuleKey
  }[] = [
    {
      to: 'generali',
      label: 'Preferenze e permessi',
      icon: Settings2,
      description: 'Ruolo, avvisi, soglia margine e matrice accessi',
      moduleKey: 'impostazioni',
    },
    {
      to: 'log',
      label: 'Activity log',
      icon: ScrollText,
      description: `${activityLogs.length} ${activityLogs.length === 1 ? 'evento registrato' : 'eventi registrati'}`,
      moduleKey: 'activity-log',
    },
  ]

  const visibleSections = sections.filter((section) => canAccessModule(role, section.moduleKey))

  return (
    <div>
      <PageHeader
        title="Impostazioni"
        subtitle="Preferenze del gestionale, permessi dei ruoli e registro delle attività amministrative."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleSections.map(({ to, label, icon: Icon, description }) => (
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
