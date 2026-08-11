import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Factory, Store, Layers, PenTool, Warehouse, Scissors } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardHeader } from '../components/ui/Card'
import { KpiTile } from '../components/dashboard/KpiTile'
import { TopProductsBarList } from '../components/dashboard/TopProductsBarList'
import { AzioniRichieste } from '../components/alerts/AzioniRichieste'
import { AnalyticsWidget } from '../components/dashboard/AnalyticsWidget'
import { LoadingState } from '../components/ui/States'
import { StatusBadge } from '../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../lib/format'
import { useDataStore } from '../context/DataStore'
import { useRole } from '../context/RoleContext'
import { canAccessModule } from '../lib/permissions'
import { useServerAlerts } from '../hooks/useServerAlerts'
import { useServerDashboard } from '../hooks/useServerDashboard'
import { useLiveMargins } from '../hooks/useLiveMargins'
import { toAzioni } from '../lib/azioni'
import {
  getTopSellingProducts,
  getRecentOrders,
  getActiveProduction,
  getPendingEmailDrafts,
} from '../lib/dashboard'

// Backlog "Note" §7 e §8: dashboard orientata alle decisioni. Sopra i sette KPI richiesti,
// tutti cliccabili verso la pagina già filtrata; sotto, una sola sezione "Azioni richieste"
// che sostituisce le tre liste di alert separate (attenzione richiesta, alert materiali,
// alert operativi) che prima ripetevano le stesse informazioni in forme diverse.
// Tolti di proposito: prodotti totali, margine sotto target, scadenze, report pronti,
// collezioni, pronti per e-commerce, stock overview e i conteggi per categoria/stagione —
// numeri senza una domanda operativa dietro. Il campo `stagione` resta nel modello dati
// (serve alla storicizzazione della quota costi fissi, FR-40): sparisce solo il riquadro.
export function Dashboard() {
  const { role } = useRole()
  const { products, materials, accessories, invoices, orders, productVariants, productionSteps, supplierRequests, inventoryRecords, caricamento } = useDataStore()
  const liveMargins = useLiveMargins()
  const vedeAnalytics = canAccessModule(role, 'analytics')

  const src = useMemo(
    () => ({ products, materials, accessories, invoices, orders, productVariants, inventoryRecords, margins: liveMargins }),
    [products, materials, accessories, invoices, orders, productVariants, inventoryRecords, liveMargins],
  )

  const kpis = useServerDashboard()
  const alerts = useServerAlerts()
  const azioni = useMemo(() => toAzioni(alerts, products), [alerts, products])
  const topProducts = useMemo(() => getTopSellingProducts(5, src), [src])
  const recentOrders = useMemo(() => getRecentOrders(5, orders), [orders])
  const activeProduction = useMemo(() => getActiveProduction(productionSteps), [productionSteps])
  const pendingDrafts = useMemo(() => getPendingEmailDrafts(supplierRequests), [supplierRequests])

  if (caricamento) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Stato operativo Heemia" />
        <LoadingState rows={6} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Cosa richiede attenzione oggi, e dove sono i capi." />

      {/* I sette KPI del backlog "Note" §7. Ognuno apre la lista corrispondente già filtrata. */}
      <div className="mb-8 flex flex-wrap gap-3">
        <KpiTile
          label="Prodotti attivi"
          value={kpis.prodottiAttivi}
          tooltip="Capi in uso: in sviluppo, in produzione o già online. Esclusi idee e archivio."
          tone="positive"
          icon={<TrendingUp />}
          to="/prodotti?vista=attivi"
        />
        <KpiTile
          label="In sviluppo"
          value={kpis.prodottiInSviluppo}
          tooltip="Fase tecnica: modellistica, piazzamento, taglio e campione non ancora approvato."
          tone="informational"
          icon={<PenTool />}
          to="/prodotti?vista=sviluppo"
        />
        <KpiTile
          label="In produzione"
          value={kpis.prodottiInProduzione}
          tooltip="Capi con campione approvato e produzione avviata."
          tone="informational"
          icon={<Factory />}
          to="/prodotti?vista=produzione"
        />
        <KpiTile
          label="Online su Shopify"
          value={kpis.prodottiPubblicati}
          tooltip="Capi pubblicati e attivi sullo store."
          tone="positive"
          icon={<Store />}
          to="/prodotti?vista=shopify"
        />
        <KpiTile
          label="Riservati al laboratorio"
          value={kpis.capiInLaboratorio}
          tooltip="Pezzi assegnati o trasferiti al laboratorio, in tutte le varianti."
          icon={<Scissors />}
          to="/inventario/prodotti-finiti?vista=laboratorio"
        />
        <KpiTile
          label="In magazzino"
          value={kpis.capiInMagazzino}
          tooltip="Pezzi fisicamente presenti in magazzino, in tutte le varianti."
          icon={<Warehouse />}
          to="/inventario/prodotti-finiti?vista=magazzino"
        />
        <KpiTile
          label="Fabric Library"
          value={kpis.fabricLibraryCount}
          tooltip="Tessuti a catalogo nella libreria materiali."
          icon={<Layers />}
          to="/inventario/tessuti"
        />
      </div>

      {/* Sezione unica "Azioni richieste" (backlog "Note" §9): categorie, non conteggi. */}
      <Card className="mb-4">
        <CardHeader
          title="Azioni richieste"
          subtitle="Raggruppate per tipo, critiche per prime. Ogni riga dice cosa fare e dove."
          action={
            <Link to="/alert" className="text-xs font-medium text-heemia-grey hover:text-heemia-black hover:underline">
              Vedi tutte →
            </Link>
          }
        />
        <div className="p-4">
          <AzioniRichieste azioni={azioni} />
        </div>
      </Card>

      {/* Riquadro Analytics (nota §11): compare solo se GA è collegato e il ruolo lo vede
          — altrimenti non lascia neanche lo spazio vuoto (il margine è dentro il riquadro). */}
      <AnalyticsWidget attivo={vedeAnalytics} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Produzione in corso" subtitle="Capi attualmente in lavorazione." />
          <ul className="divide-y divide-heemia-border">
            {activeProduction.length === 0 && <li className="p-4 text-sm text-heemia-grey">Nessuna produzione attiva.</li>}
            {activeProduction.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <Link to={`/prodotti/${s.productId}`} className="font-display text-heemia-black hover:underline">
                  {products.find((p) => p.id === s.productId)?.nome ?? s.productId}
                </Link>
                <span className="text-xs text-heemia-grey">{s.responsabile}</span>
              </li>
            ))}
          </ul>
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

        <Card className="lg:col-span-2">
          <CardHeader title="Vendite recenti" />
          <ul className="divide-y divide-heemia-border">
            {recentOrders.length === 0 && <li className="p-4 text-sm text-heemia-grey">Nessuna vendita registrata.</li>}
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
      </div>
    </div>
  )
}
