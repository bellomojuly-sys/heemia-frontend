import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Package, TrendingUp, Factory, ShoppingBag, Store, Layers, Tags, PenTool, AlertTriangle, CalendarClock, FileText } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardHeader } from '../components/ui/Card'
import { KpiTile } from '../components/dashboard/KpiTile'
import { TopProductsBarList } from '../components/dashboard/TopProductsBarList'
import { AlertList } from '../components/alerts/AlertList'
import { Badge } from '../components/ui/Badge'
import { LoadingState } from '../components/ui/States'
import { StatusBadge } from '../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../lib/format'
import { useMockLoading } from '../hooks/useMockLoading'
import { useRole } from '../context/RoleContext'
import { useMockStore } from '../context/MockStore'
import { canAccessModule, canSeeAlertModulo } from '../lib/permissions'
import { computeAlerts } from '../lib/alerts'
import { useLiveMargins } from '../hooks/useLiveMargins'
import {
  getDashboardKpis,
  getTopSellingProducts,
  getRecentOrders,
  getActiveProduction,
  getStockOverview,
  getPendingEmailDrafts,
  getMaterialAlerts,
  getProductsByCategoria,
  getProductsByStagione,
} from '../lib/dashboard'
import { products } from '../mock'

export function Dashboard() {
  const { role } = useRole()
  const { productionSteps, supplierRequests } = useMockStore()
  const loading = useMockLoading(700)
  const liveMargins = useLiveMargins()

  const kpis = useMemo(() => getDashboardKpis(liveMargins), [liveMargins])
  const topProducts = useMemo(() => getTopSellingProducts(5), [])
  const recentOrders = useMemo(() => getRecentOrders(5), [])
  const activeProduction = useMemo(() => getActiveProduction(productionSteps), [productionSteps])
  const pendingDrafts = useMemo(() => getPendingEmailDrafts(supplierRequests), [supplierRequests])
  const stock = useMemo(() => getStockOverview(), [])
  const alerts = useMemo(
    () => computeAlerts(liveMargins).filter((a) => canSeeAlertModulo(role, a.modulo)),
    [liveMargins, role],
  )
  const materialAlerts = useMemo(() => getMaterialAlerts(), [])
  const byCategoria = useMemo(() => getProductsByCategoria(), [])
  const byStagione = useMemo(() => getProductsByStagione(), [])
  const canSeeEconomics = canAccessModule(role, 'costi-margini')
  const canSeeInvoices = canAccessModule(role, 'fatture')
  const canSeeDeadlines = canAccessModule(role, 'scadenze')
  const canSeeReports = canAccessModule(role, 'report')

  // Sezione "Attenzione richiesta" (FR-30 §3): voci aperte (count > 0) vs risolte (count === 0,
  // spunta verde secondaria). Ogni voce rispetta lo stesso gating di modulo già usato altrove.
  const attentionItems = [
    { label: 'Prodotti sotto break-even', count: kpis.sottoBreakEven, link: '/margini', visible: canSeeEconomics },
    { label: 'Fatture non associate', count: kpis.fattureNonAssociate, link: '/fatture', visible: canSeeInvoices },
    { label: 'Scadenze entro 7 giorni', count: kpis.scadenze7gg, link: '/scadenze', visible: canSeeDeadlines },
    { label: 'Prodotti senza scheda tecnica', count: kpis.prodottiSenzaSchedaTecnica, link: '/prodotti', visible: true },
    { label: 'Prodotti senza prezzo', count: kpis.prodottiSenzaPrezzo, link: '/prodotti', visible: true },
  ].filter((item) => item.visible)
  const hasOpenAttention = attentionItems.some((item) => item.count > 0)

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
      <PageHeader title="Dashboard" subtitle="Stato operativo complessivo: tutto ciò che richiede attenzione oggi." />

      {/* KPI primari (FR-30 §1): peso pieno, colore semantico secondo lo stato. */}
      <div className="mb-3 flex flex-wrap gap-3">
        <KpiTile label="Prodotti totali" value={kpis.prodottiTotali} tooltip="Tutti i prodotti in anagrafica, in ogni fase (incluse idea e archivio)." tone="neutral" icon={<Package />} />
        <KpiTile label="Prodotti attivi" value={kpis.prodottiAttivi} tooltip="Prodotti non in fase idea né archiviati." tone="positive" icon={<TrendingUp />} />
        <KpiTile label="In produzione" value={kpis.prodottiInProduzione} tooltip="Prodotti attualmente nella fase di produzione della pipeline." tone="informational" icon={<Factory />} />
        <KpiTile label="Pronti per ecommerce" value={kpis.prodottiProntiEcommerce} tooltip="Prodotti con scheda e-commerce completata, non ancora pubblicati su Shopify." tone="positive" icon={<ShoppingBag />} />
      </div>

      {/* KPI secondari (FR-30 §2): peso ridotto, salvo criticità reale (margine sotto target > 0 → rosso pieno). */}
      <div className="mb-8 flex flex-wrap gap-3">
        <KpiTile label="Online su Shopify" value={kpis.prodottiPubblicati} tooltip="Prodotti con stato pubblicazione Shopify = pubblicato." weight="secondary" icon={<Store />} />
        <KpiTile label="Fabric Library" value={kpis.fabricLibraryCount} tooltip="Numero totale di tessuti a catalogo, sotto soglia o meno." weight="secondary" icon={<Layers />} />
        <KpiTile label="Collezioni" value={kpis.collezioniCount} tooltip="Numero di collezioni distinte in anagrafica prodotti." weight="secondary" icon={<Tags />} />
        <KpiTile label="In sviluppo" value={kpis.prodottiInSviluppo} tooltip="Prodotti tra concept e campionario, non ancora in produzione." weight="secondary" icon={<PenTool />} />
        {canSeeEconomics && (
          <KpiTile
            label="Margine sotto target"
            value={kpis.margineSottoTarget}
            tooltip="Prodotti con margine percentuale sotto la soglia configurata."
            weight="secondary"
            critical={kpis.margineSottoTarget > 0}
            icon={<AlertTriangle />}
          />
        )}
        {canSeeDeadlines && (
          <KpiTile label="Scadenze entro 30gg" value={kpis.scadenze30gg} tooltip="Scadenze economiche/amministrative nei prossimi 30 giorni." weight="secondary" icon={<CalendarClock />} />
        )}
        {canSeeReports && (
          <KpiTile label="Report pronti" value={kpis.reportPronti} tooltip="Report mensili generati e disponibili per la consultazione." weight="secondary" icon={<FileText />} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Attenzione richiesta (FR-30 §3): il contenitore prende accento carminio solo se c'è almeno una voce aperta. */}
        <Card
          className={`lg:col-span-2 ${hasOpenAttention ? 'border-heemia-carmine/40 bg-heemia-carmine-light/40' : ''}`}
        >
          <CardHeader title="Attenzione richiesta" subtitle="Criticità che richiedono un'azione, aggregate per tipo." />
          <ul className="divide-y divide-heemia-border">
            {attentionItems.map((item) =>
              item.count > 0 ? (
                <li key={item.label}>
                  <Link
                    to={item.link}
                    className="flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-white/60"
                  >
                    <span className="text-heemia-black">{item.label}</span>
                    <span className="font-mono-heemia font-semibold text-heemia-carmine">{item.count}</span>
                  </Link>
                </li>
              ) : (
                <li key={item.label} className="flex items-center justify-between px-4 py-2.5 text-sm text-heemia-grey">
                  <span>{item.label}</span>
                  <span className="flex items-center gap-1.5 text-heemia-green">
                    <span aria-hidden>✓</span>
                    <span className="font-mono-heemia text-xs">0</span>
                  </span>
                </li>
              ),
            )}
          </ul>
        </Card>

        {/* Alert materiali (FR-30 §4): esaurito = badge pieno rosso, sotto soglia = badge outline arancione. */}
        <Card>
          <CardHeader title="Alert materiali" subtitle="Tessuti e accessori sotto soglia o esauriti." />
          {materialAlerts.length === 0 ? (
            <p className="p-4 text-sm text-heemia-grey">Nessun materiale sotto soglia.</p>
          ) : (
            <ul className="divide-y divide-heemia-border">
              {materialAlerts.map((m) => (
                <li key={m.id}>
                  <Link to={m.link} className="flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-heemia-cream">
                    <span className="min-w-0 truncate text-heemia-black">{m.nome}</span>
                    <Badge variant={m.stato === 'esaurito' ? 'critical-solid' : 'warning-outline'}>
                      {m.stato === 'esaurito' ? 'Esaurito' : 'Sotto soglia'}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

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

        {/* Per categoria / Per stagione (FR-30 §5): sezioni neutre, nessun colore semantico. */}
        <Card>
          <CardHeader title="Prodotti per categoria e stagione" />
          <div className="grid grid-cols-2 gap-4 p-5 text-sm">
            <div>
              <p className="mb-2 font-mono-heemia text-[10px] uppercase tracking-[0.08em] text-heemia-grey">Per categoria</p>
              <ul className="space-y-1.5">
                {byCategoria.map((c) => (
                  <li key={c.label} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-heemia-black">{c.label}</span>
                    <span className="font-mono-heemia text-heemia-grey">{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 font-mono-heemia text-[10px] uppercase tracking-[0.08em] text-heemia-grey">Per stagione</p>
              <ul className="space-y-1.5">
                {byStagione.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-heemia-black">{s.label}</span>
                    <span className="font-mono-heemia text-heemia-grey">{s.count}</span>
                  </li>
                ))}
              </ul>
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
