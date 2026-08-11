import { MessageSquareText, ShoppingBag, Store } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { useDataStore } from '../../context/DataStore'
import { useRole } from '../../context/RoleContext'
import { useServerShowroomRequests } from '../../hooks/useServerShowroomRequests'
import { canAccessModule, type ModuleKey } from '../../lib/permissions'
import type { SalesChannelsOutlet } from './salesChannelsOutlet'

/**
 * Vista unica del flusso commerciale interno: una richiesta showroom confermata diventa
 * un ordine, mentre Shopify è il canale esterno da cui possono arrivare altri ordini.
 * Le schede restano route distinte per conservare deep-link e permessi separati.
 */
export function SalesChannelsPage() {
  const { role } = useRole()
  const { orders, products, inventoryRecords } = useDataStore()
  const showroom = useServerShowroomRequests()

  const ordiniAperti = orders.filter((o) => o.stato !== 'consegnato' && o.stato !== 'annullato').length
  const prioritaAlte = orders.filter((o) => o.priorita === 'alta' && o.stato !== 'consegnato' && o.stato !== 'annullato').length
  const richiesteAperte = showroom.richieste.filter((r) => r.stato !== 'consegnato' && r.stato !== 'annullato').length
  const richiesteNuove = showroom.richieste.filter((r) => r.stato === 'nuova_richiesta').length
  const prodottiPubblicati = products.filter((p) => p.statoPubblicazioneShopify === 'pubblicato').length
  const divergenzeShopify = inventoryRecords.filter((r) => r.divergenzaShopify).length

  const sections: {
    to: string
    label: string
    icon: typeof ShoppingBag
    count: string
    alert: string
    moduleKey: ModuleKey
  }[] = [
    {
      to: 'elenco',
      label: 'Ordini',
      icon: ShoppingBag,
      count: `${orders.length} ${orders.length === 1 ? 'ordine' : 'ordini'} · ${ordiniAperti} aperti`,
      alert: prioritaAlte > 0 ? `${prioritaAlte} ad alta priorità` : '',
      moduleKey: 'ordini',
    },
    {
      to: 'showroom',
      label: 'Richieste showroom',
      icon: MessageSquareText,
      count: `${showroom.richieste.length} ricevute · ${richiesteAperte} aperte`,
      alert: richiesteNuove > 0 ? `${richiesteNuove} nuove` : '',
      moduleKey: 'richieste-showroom',
    },
    {
      to: 'shopify',
      label: 'Shopify',
      icon: Store,
      count: `${prodottiPubblicati} ${prodottiPubblicati === 1 ? 'prodotto pubblicato' : 'prodotti pubblicati'}`,
      alert: divergenzeShopify > 0 ? `${divergenzeShopify} divergenze stock` : '',
      moduleKey: 'shopify',
    },
  ]

  const visibleSections = sections.filter((section) => canAccessModule(role, section.moduleKey))

  return (
    <div>
      <PageHeader
        title="Ordini e canali di vendita"
        subtitle="Ordini operativi, richieste arrivate dallo showroom e stato del canale Shopify in un'unica vista."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibleSections.map(({ to, label, icon: Icon, count, alert }) => (
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

      <Outlet context={{ showroom } satisfies SalesChannelsOutlet} />
    </div>
  )
}
