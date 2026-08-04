import { NavLink } from 'react-router-dom'
import { useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import { useRole } from '../../context/RoleContext'
import { canAccessModule } from '../../lib/permissions'
import { NAV_GROUPS } from './nav'
import { useServerAlerts } from '../../hooks/useServerAlerts'

export function Sidebar() {
  const { role } = useRole()

  // Gli alert (già filtrati per ruolo dal server) alimentano il contatore dei critici.
  const alertsServer = useServerAlerts()
  const criticalAlertCount = useMemo(
    () => alertsServer.filter((a) => a.livello === 'critico').length,
    [alertsServer],
  )

  // Solo voci di pagina, senza titoli di sezione: richiesta esplicita della founder
  // (review 2026-07-16). I gruppi in nav.ts restano come organizzazione logica.
  const items = NAV_GROUPS.flatMap((group) => group.items).filter((item) => canAccessModule(role, item.moduleKey))

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-heemia-black text-white">
      <div className="px-6 py-7">
        <p className="font-display text-2xl italic tracking-tight text-white">Heemia</p>
        <p className="font-mono-heemia mt-1 text-[10px] uppercase tracking-[0.14em] text-white/40">
          Gestionale interno
        </p>
      </div>

      <nav className="scroll-smooth-y flex-1 px-4 pb-6">
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  // Fase 14: la voce attiva è una pillola piena, non solo un bordino;
                  // le altre scivolano di 2px verso destra al passaggio del mouse —
                  // basta quello per far sentire il menu "vivo" senza distrarre.
                  `flex items-center justify-between rounded-heemia-sm border-l-2 px-2.5 py-1.5 text-sm transition-all duration-200 ease-heemia ${
                    isActive
                      ? 'border-heemia-carmine bg-white/10 text-white'
                      : 'border-transparent text-white/60 hover:translate-x-0.5 hover:border-white/25 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <span>{item.label}</span>
                {item.moduleKey === 'alert' && criticalAlertCount > 0 && (
                  <span className="font-mono-heemia rounded-full bg-heemia-carmine px-1.5 py-0.5 text-[10px] font-medium leading-none text-white shadow-heemia-xs">
                    {criticalAlertCount}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Vista cliente showroom (FR-29) con un click: si apre in una scheda separata, così il
          gestionale non resta nella cronologia del dispositivo mostrato al cliente. */}
      <div className="border-t border-white/10 px-4 py-4">
        <a
          href="/showroom"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-heemia-sm border-l-2 border-transparent px-2.5 py-1.5 text-sm text-white/60 transition-all duration-200 ease-heemia hover:translate-x-0.5 hover:border-white/25 hover:bg-white/5 hover:text-white"
        >
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          Apri vista showroom
        </a>
      </div>
    </aside>
  )
}
