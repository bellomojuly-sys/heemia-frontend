import { NavLink } from 'react-router-dom'
import { useMemo } from 'react'
import { useRole } from '../../context/RoleContext'
import { canAccessModule } from '../../lib/permissions'
import { NAV_GROUPS } from './nav'
import { computeAlerts } from '../../lib/alerts'
import { canSeeAlertModulo } from '../../lib/permissions'

export function Sidebar() {
  const { role } = useRole()

  const criticalAlertCount = useMemo(
    () => computeAlerts().filter((a) => a.livello === 'critico' && canSeeAlertModulo(role, a.modulo)).length,
    [role],
  )

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-heemia-black text-white">
      <div className="px-6 py-7">
        <p className="font-display text-2xl italic tracking-tight text-white">Heemia</p>
        <p className="font-mono-heemia mt-1 text-[10px] uppercase tracking-[0.14em] text-white/40">
          Gestionale interno
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-6">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => canAccessModule(role, item.moduleKey))
          if (items.length === 0) return null
          return (
            <div key={group.label || 'root'} className="mb-5">
              {group.label && (
                <p className="font-mono-heemia px-2 pb-2 pt-4 text-[10px] uppercase tracking-[0.14em] text-white/35">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        `flex items-center justify-between border-l-2 px-2.5 py-1.5 text-sm transition-colors ${
                          isActive
                            ? 'border-heemia-carmine text-white'
                            : 'border-transparent text-white/60 hover:border-white/25 hover:text-white'
                        }`
                      }
                    >
                      <span>{item.label}</span>
                      {item.moduleKey === 'alert' && criticalAlertCount > 0 && (
                        <span className="font-mono-heemia rounded-[2px] bg-heemia-carmine px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                          {criticalAlertCount}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
