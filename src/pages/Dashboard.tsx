import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardHeader } from '../components/ui/Card'
import { KpiTile } from '../components/dashboard/KpiTile'
import { TopProductsBarList } from '../components/dashboard/TopProductsBarList'
import { AlertList } from '../components/alerts/AlertList'
import { LoadingState } from '../components/ui/States'
import { StatusBadge } from '../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../lib/format'
import { useMockLoading } from '../hooks/useMockLoading'
import { useRole } from '../context/RoleContext'
import { useMockStore } from '../context/MockStore'
import { canAccessModule, canSeeAlertModulo } from '../lib/permissions'
import { computeAlerts } from '../lib/alerts'
import { getDashboardKpis, getTopSellingProducts, getRecentOrders, getActiveProduction, getStockOverview, getPendingEmailDrafts } from '../lib/dashboard'
import { products } from '../mock'

export function Dashboard() {
  const { role } = useRole()
  const { productionSteps, supplierRequests } = useMockStore()
  const loading = useMockLoading(700)

  const kpis = useMemo(() => getDashboardKpis(), [])
  const topProducts = useMemo(() => getTopSellingProducts(5), [])
  const recentOrders = useMemo(() => getRecentOrders(5), [])
  const activeProduction = useMemo(() => getActiveProduction(productionSteps), [productionSteps])
  const pendingDrafts = useMemo(() => getPendingEmailDrafts(supplierRequests), [supplierRequests])
  const stock = useMemo(() => getStockOverview(), [])
  const alerts = useMemo(
    () => computeAlerts().filter((a) => canSeeAlertModulo(role, a.modulo)),
    [role],
  )
  const canSeeEconomics = canAccessModule(role, 'costi-margini')
  const canSeeInvoices = canAccessModule(role, 'fatture')
  const canSeeDeadlines = canAccessModule(role, 'scadenze')
  const canSeeReports = canAccessModule(role, 'report')

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Stato operativo Heemia" />
        <LoadingState rows={6} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Stato operativo complessivo — tutto ciò che richiede attenzione oggi." />

      <div className="mb-8 flex flex-wrap divide-x divide-heemia-border rounded-[3px] border border-heemia-border bg-white">
        <KpiTile label="Prodotti attivi" value={kpis.prodottiAttivi} tooltip="Prodotti non in fase idea né archiviati." />
        <KpiTile label="In sviluppo" value={kpis.prodottiInSviluppo} tooltip="Prodotti tra concept e campionario, non ancora in produzione." />
        <KpiTile label="Pubblicati su Shopify" value={kpis.prodottiPubblicati} tooltip="Prodotti con stato pubblicazione Shopify = pubblicato." />
        <KpiTile label="Tessuti sotto soglia" value={kpis.tessutiSottoSoglia} tooltip="Tessuti con scorta sotto la soglia minima o esauriti." critical={kpis.tessutiSottoSoglia > 0} />
        <KpiTile label="Accessori sotto soglia" value={kpis.accessoriSottoSoglia} tooltip="Accessori con scorta sotto la soglia minima o esauriti." critical={kpis.accessoriSottoSoglia > 0} />

        {canSeeEconomics && (
          <>
            <KpiTile label="Margine sotto target" value={kpis.margineSottoTarget} tooltip="Prodotti con margine percentuale sotto la soglia configurata." critical={kpis.margineSottoTarget > 0} />
            <KpiTile label="Sotto break-even" value={kpis.sottoBreakEven} tooltip="Prodotti venduti a un prezzo pari o inferiore al break-even." critical={kpis.sottoBreakEven > 0} />
          </>
        )}
        {canSeeInvoices && (
          <KpiTile label="Fatture non associate" value={kpis.fattureNonAssociate} tooltip="Fatture caricate ma non ancora collegate a prodotti o materiali." critical={kpis.fattureNonAssociate > 0} />
        )}
        {canSeeDeadlines && (
          <>
            <KpiTile label="Scadenze entro 7gg" value={kpis.scadenze7gg} tooltip="Scadenze economiche/amministrative nei prossimi 7 giorni." critical={kpis.scadenze7gg > 0} />
            <KpiTile label="Scadenze entro 30gg" value={kpis.scadenze30gg} tooltip="Scadenze economiche/amministrative nei prossimi 30 giorni." />
          </>
        )}
        {canSeeReports && (
          <KpiTile label="Report pronti" value={kpis.reportPronti} tooltip="Report mensili generati e disponibili per la consultazione." />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Alert operativi" subtitle="Prioritizzati: critici prima, poi attenzione e info." />
          <div className="p-4">
            <AlertList alerts={alerts} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Capi più venduti" />
          <div className="p-5">
            {topProducts.length > 0 ? (
              <TopProductsBarList data={topProducts} />
            ) : (
              <p className="text-sm text-heemia-grey">Nessuna vendita registrata.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Stock overview" subtitle="Prodotti finiti" />
          <div className="grid grid-cols-2 gap-3 p-5 text-sm">
            <div>
              <p className="text-xs text-heemia-grey">Disponibile</p>
              <p className="text-lg font-semibold text-heemia-black">{stock.disponibile}</p>
            </div>
            <div>
              <p className="text-xs text-heemia-grey">Riservato</p>
              <p className="text-lg font-semibold text-heemia-black">{stock.riservato}</p>
            </div>
            <div>
              <p className="text-xs text-heemia-grey">Low stock</p>
              <p className="text-lg font-semibold text-heemia-black">{stock.lowStock}</p>
            </div>
            <div>
              <p className="text-xs text-heemia-grey">Esaurito</p>
              <p className="text-lg font-semibold text-heemia-carmine">{stock.esaurito}</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Bozze email in attesa" subtitle="Richieste fornitore non ancora inviate" />
          <ul className="divide-y divide-heemia-border">
            {pendingDrafts.length === 0 && <li className="p-4 text-sm text-heemia-grey">Nessuna bozza in attesa.</li>}
            {pendingDrafts.map((r) => (
              <li key={r.id} className="px-4 py-2.5 text-sm">
                <Link to="/fornitori" className="text-heemia-black hover:underline">{r.oggetto}</Link>
                <p className="text-xs text-heemia-grey">{r.urgenza === 'alta' ? 'Urgente' : 'Normale'}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Produzione in corso" />
          <ul className="divide-y divide-heemia-border">
            {activeProduction.length === 0 && <li className="p-4 text-sm text-heemia-grey">Nessuna produzione attiva.</li>}
            {activeProduction.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <Link to={`/prodotti/${s.productId}`} className="font-display italic text-heemia-black hover:underline">
                  {products.find((p) => p.id === s.productId)?.nome ?? s.productId}
                </Link>
                <span className="text-xs text-heemia-grey">{s.responsabile}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Lista vendite recenti" />
          <ul className="divide-y divide-heemia-border">
            {recentOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <p className="text-heemia-black">{o.numero}</p>
                  <p className="text-xs text-heemia-grey">{formatDateIt(o.data)} · {o.canale === 'shopify' ? 'Shopify' : 'Punto vendita'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-heemia-black">{formatCurrency(o.totale)}</span>
                  <StatusBadge status={o.stato} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
