import { NavLink } from 'react-router-dom'
import { useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import { useRole } from '../../context/RoleContext'
import { canAccessModule } from '../../lib/permissions'
import { NAV_GROUPS } from './nav'
import { computeAlerts } from '../../lib/alerts'
import { canSeeAlertModulo } from '../../lib/permissions'
import { useLiveMargins } from '../../hooks/useLiveMargins'
import { useMockStore } from '../../context/MockStore'

export function Sidebar() {
  const { role } = useRole()
  const liveMargins = useLiveMargins()
  const { products, materials, accessories, invoices, inventoryRecords, productVariants, orders, cashClosures } = useMockStore()

  const criticalAlertCount = useMemo(
    () =>
      computeAlerts({ products, materials, accessories, invoices, inventoryRecords, productVariants, orders, cashClosures, margins: liveMargins }).filter(
        (a) => a.livello === 'critico' && canSeeAlertModulo(role, a.modulo),
      ).length,
    [products, materials, accessories, invoices, inventoryRecords, productVariants, orders, cashClosures, liveMargins, role],
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

      <nav className="flex-1 overflow-y-auto px-4 pb-6">
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
      </nav>

      {/* Vista cliente showroom (FR-29) con un click: si apre in una scheda separata, così il
          gestionale non resta nella cronologia del dispositivo mostrato al cliente. */}
      <div className="border-t border-white/10 px-4 py-4">
        <a
          href="/showroom"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 border-l-2 border-transparent px-2.5 py-1.5 text-sm text-white/60 transition-colors hover:border-white/25 hover:text-white"
        >
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          Apri vista showroom
        </a>
      </div>
    </aside>
  )
}
