import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Factory, Store, Layers, PenTool, Warehouse, Scissors } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { KpiTile } from '../components/dashboard/KpiTile'
import { TopProductsBarList } from '../components/dashboard/TopProductsBarList'
import { AzioniRichieste } from '../components/alerts/AzioniRichieste'
import { AnalyticsWidget } from '../components/dashboard/AnalyticsWidget'
import { LoadingState } from '../components/ui/States'
import { SezioneCard } from '../components/dashboard/SezioneCard'
import { StatusBadge } from '../lib/statusBadge'
import { stageLabel } from '../lib/production'
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
// collezioni, pronti per e-commerce, stock overview e i conteggi per categoria — numeri
// senza una domanda operativa dietro.
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

      {/* I sette KPI del backlog "Note" §7, raggruppati per area e colorati di conseguenza
          (src/lib/aree.ts). Il colore non decora: dice a quale parte dell'app porta la
          card, con la stessa divisione della barra laterale. Le due fasce hanno anche un
          titolo, perché il colore da solo non basta a chi non lo distingue. */}
      <FasciaKpi titolo="Capi" nota="Dove sono i capi lungo il percorso, dall'idea al negozio.">
        <KpiTile
          area="prodotto"
          label="Capi attivi"
          value={kpis.prodottiAttivi}
          dettaglio="in uso, escluse idee e archivio"
          tooltip="Capi in uso: in lavorazione, prodotti o già online. Esclusi idee e archivio."
          icon={<TrendingUp />}
          to="/prodotti?vista=attivi"
        />
        <KpiTile
          area="prodotto"
          label="In sviluppo"
          value={kpis.prodottiInSviluppo}
          dettaglio="modello, prototipo, campione"
          tooltip="Fase tecnica: modellistica, piazzamento, taglio e campione non ancora approvato."
          icon={<PenTool />}
          to="/prodotti?vista=sviluppo"
        />
        <KpiTile
          area="prodotto"
          label="In produzione"
          value={kpis.prodottiInProduzione}
          dettaglio="campione approvato, produzione avviata"
          tooltip="Solo i capi nella fase «Produzione» della pipeline. Chi ha finito è nello stock, non qui."
          icon={<Factory />}
          to="/produzione"
        />
        <KpiTile
          area="prodotto"
          label="Online su Shopify"
          value={kpis.prodottiPubblicati}
          dettaglio="pubblicati e attivi sullo store"
          tooltip="Capi pubblicati e attivi sullo store."
          icon={<Store />}
          to="/prodotti?vista=shopify"
        />
      </FasciaKpi>

      <FasciaKpi titolo="Magazzino" nota="Quanti pezzi ci sono, e dove stanno fisicamente.">
        <KpiTile
          area="inventario"
          label="In magazzino"
          value={kpis.capiInMagazzino}
          dettaglio="pezzi, tutte le varianti"
          tooltip="Pezzi fisicamente presenti in magazzino, in tutte le varianti."
          icon={<Warehouse />}
          to="/inventario/prodotti-finiti?vista=magazzino"
        />
        <KpiTile
          area="inventario"
          label="In laboratorio"
          value={kpis.capiInLaboratorio}
          dettaglio="pezzi assegnati al laboratorio"
          tooltip="Pezzi assegnati o trasferiti al laboratorio, in tutte le varianti."
          icon={<Scissors />}
          to="/inventario/prodotti-finiti?vista=laboratorio"
        />
        <KpiTile
          area="inventario"
          label="Fabric Library"
          value={kpis.fabricLibraryCount}
          dettaglio="tessuti a catalogo"
          tooltip="Tessuti a catalogo nella libreria materiali."
          icon={<Layers />}
          to="/inventario/tessuti"
        />
      </FasciaKpi>

      {/* Sezione unica "Azioni richieste" (backlog "Note" §9): categorie, non conteggi. */}
      <SezioneCard
        area="relazioni"
        titolo="Azioni richieste"
        sottotitolo="Raggruppate per tipo, critiche per prime. Ogni riga dice cosa fare e dove."
        className="mb-4"
        azione={
          <Link to="/alert" className="text-xs font-medium text-heemia-grey hover:text-heemia-black hover:underline">
            Vedi tutte →
          </Link>
        }
      >
        <div className="p-4">
          <AzioniRichieste azioni={azioni} />
        </div>
      </SezioneCard>

      {/* Riquadro Analytics (nota §11): compare solo se GA è collegato e il ruolo lo vede
          — altrimenti non lascia neanche lo spazio vuoto (il margine è dentro il riquadro). */}
      <AnalyticsWidget attivo={vedeAnalytics} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SezioneCard
          area="prodotto"
          titolo="Capi in lavorazione"
          sottotitolo="Solo chi sta attraversando la pipeline: i capi finiti stanno nello stock."
          className="lg:col-span-2"
          azione={
            <Link to="/produzione" className="text-xs font-medium text-heemia-grey hover:text-heemia-black hover:underline">
              Apri la pipeline →
            </Link>
          }
        >
          <ul className="divide-y divide-heemia-border">
            {activeProduction.length === 0 && <li className="p-4 text-sm text-heemia-grey">Nessun capo è in lavorazione.</li>}
            {activeProduction.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <Link to={`/prodotti/${s.productId}`} className="font-display text-heemia-black hover:underline">
                  {products.find((p) => p.id === s.productId)?.nome ?? s.productId}
                </Link>
                <span className="font-mono-heemia text-[11px] uppercase tracking-[0.06em] text-heemia-grey">
                  {stageLabel(s.fase)}
                </span>
              </li>
            ))}
          </ul>
        </SezioneCard>

        <SezioneCard area="inventario" titolo="Capi più venduti">
          <div className="p-5">
            {topProducts.length > 0 ? (
              <TopProductsBarList data={topProducts} />
            ) : (
              <p className="text-sm text-heemia-grey">Nessuna vendita registrata.</p>
            )}
          </div>
        </SezioneCard>

        <SezioneCard area="economico" titolo="Vendite recenti" className="lg:col-span-2">
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
        </SezioneCard>

        <SezioneCard area="inventario" titolo="Bozze email in attesa" sottotitolo="Richieste fornitore non ancora inviate">
          <ul className="divide-y divide-heemia-border">
            {pendingDrafts.length === 0 && <li className="p-4 text-sm text-heemia-grey">Nessuna bozza in attesa.</li>}
            {pendingDrafts.map((r) => (
              <li key={r.id} className="px-4 py-2.5 text-sm">
                <Link to="/fornitori" className="text-heemia-black hover:underline">{r.oggetto}</Link>
                <p className="text-xs text-heemia-grey">{r.urgenza === 'alta' ? 'Urgente' : 'Normale'}</p>
              </li>
            ))}
          </ul>
        </SezioneCard>
      </div>
    </div>
  )
}

/**
 * Una fascia di KPI con il proprio titolo. Il raggruppamento è la metà testuale della
 * codifica a colori: il colore rende le card riconoscibili di sfuggita, il titolo dice
 * che cosa hanno in comune — e resta l'unica fonte per chi i colori non li distingue.
 */
function FasciaKpi({ titolo, nota, children }: { titolo: string; nota: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="font-sans text-[11px] font-medium uppercase tracking-[0.09em] text-heemia-black">{titolo}</h2>
        <p className="text-xs text-heemia-grey">{nota}</p>
      </div>
      <div className="flex flex-wrap gap-3">{children}</div>
    </section>
  )
}
