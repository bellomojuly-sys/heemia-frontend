import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { RoleProvider } from './context/RoleContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DataStoreProvider } from './context/DataStore'
import { LoginPage } from './pages/auth/LoginPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
import { AppLayout } from './components/layout/AppLayout'
import { RoleGuard } from './components/layout/RoleGuard'


// Ogni area operativa viene scaricata solo quando la sua rotta viene aperta. Prima il
// router importava tutte le pagine (PDF, grafici e modali compresi) nel bundle iniziale:
// anche la schermata di login pagava il costo dell'intero gestionale.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const ProductList = lazy(() => import('./pages/products/ProductList').then((m) => ({ default: m.ProductList })))
const ProductDetail = lazy(() => import('./pages/products/ProductDetail').then((m) => ({ default: m.ProductDetail })))
const ProductionPipeline = lazy(() => import('./pages/production/ProductionPipeline').then((m) => ({ default: m.ProductionPipeline })))
const InventoryPage = lazy(() => import('./pages/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })))
const FabricsInventory = lazy(() => import('./pages/inventory/FabricsInventory').then((m) => ({ default: m.FabricsInventory })))
const AccessoriesInventory = lazy(() => import('./pages/inventory/AccessoriesInventory').then((m) => ({ default: m.AccessoriesInventory })))
const FinishedGoodsInventory = lazy(() => import('./pages/inventory/FinishedGoodsInventory').then((m) => ({ default: m.FinishedGoodsInventory })))
const LavorazioniPage = lazy(() => import('./pages/lavorazioni/LavorazioniPage').then((m) => ({ default: m.LavorazioniPage })))
const BollaDetail = lazy(() => import('./pages/lavorazioni/BollaDetail').then((m) => ({ default: m.BollaDetail })))
const OrdersPage = lazy(() => import('./pages/orders/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const SalesChannelsPage = lazy(() => import('./pages/orders/SalesChannelsPage').then((m) => ({ default: m.SalesChannelsPage })))
const RichiesteShowroomPage = lazy(() => import('./pages/richieste/RichiesteShowroomPage').then((m) => ({ default: m.RichiesteShowroomPage })))
const InvoicesDeadlinesPage = lazy(() => import('./pages/invoices/InvoicesDeadlinesPage').then((m) => ({ default: m.InvoicesDeadlinesPage })))
const InvoiceList = lazy(() => import('./pages/invoices/InvoiceList').then((m) => ({ default: m.InvoiceList })))
const DeadlinesPage = lazy(() => import('./pages/deadlines/DeadlinesPage').then((m) => ({ default: m.DeadlinesPage })))
const EconomicsPage = lazy(() => import('./pages/margins/EconomicsPage').then((m) => ({ default: m.EconomicsPage })))
const MarginsPage = lazy(() => import('./pages/margins/MarginsPage').then((m) => ({ default: m.MarginsPage })))
const SupplierList = lazy(() => import('./pages/suppliers/SupplierList').then((m) => ({ default: m.SupplierList })))
const SupplierWorkPage = lazy(() => import('./pages/suppliers/SupplierWorkPage').then((m) => ({ default: m.SupplierWorkPage })))
const CustomerList = lazy(() => import('./pages/customers/CustomerList').then((m) => ({ default: m.CustomerList })))
const ShopifyPage = lazy(() => import('./pages/shopify/ShopifyPage').then((m) => ({ default: m.ShopifyPage })))
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const AnalyticsPage = lazy(() => import('./pages/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const AlertsPage = lazy(() => import('./pages/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage })))
const AiAssistantPage = lazy(() => import('./pages/assistant/AiAssistantPage').then((m) => ({ default: m.AiAssistantPage })))
const ActivityLogPage = lazy(() => import('./pages/logs/ActivityLogPage').then((m) => ({ default: m.ActivityLogPage })))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const SettingsHubPage = lazy(() => import('./pages/settings/SettingsHubPage').then((m) => ({ default: m.SettingsHubPage })))
const UsersPage = lazy(() => import('./pages/settings/UsersPage').then((m) => ({ default: m.UsersPage })))
const ShowroomApp = lazy(() => import('./pages/showroom/ShowroomApp').then((m) => ({ default: m.ShowroomApp })))

function RouteLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-heemia-surface" aria-busy="true">
      <p className="font-mono-heemia text-[11px] uppercase tracking-[0.18em] text-heemia-grey">Caricamento…</p>
    </div>
  )
}

/**
 * Gate di sessione (Fase 13): senza utente autenticato si vede solo il login.
 * Lo showroom resta fuori — è la sub-app rivolta al cliente, con scope separato (A5).
 */
function AreaRiservata() {
  const { user, loading } = useAuth()

  // Il ruolo dell'interfaccia lo deriva RoleContext direttamente dalla sessione, quindi è
  // già giusto al primo render: qui non c'è più niente da sincronizzare a posteriori.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-heemia-surface">
        <p className="font-mono-heemia text-[11px] uppercase tracking-[0.18em] text-heemia-grey">Caricamento…</p>
      </div>
    )
  }
  if (!user) return <LoginPage />
  return <Outlet />
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <RoleProvider>
        <DataStoreProvider>
        <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/showroom" element={<ShowroomApp />} />
          {/* Fuori dal gate di sessione, come lo showroom: chi apre questo link è proprio
              chi non riesce a entrare (DEC-071). */}
          <Route path="/reimposta-password" element={<ResetPasswordPage />} />

          <Route element={<AreaRiservata />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<RoleGuard moduleKey="dashboard"><Dashboard /></RoleGuard>} />
            <Route path="/prodotti" element={<RoleGuard moduleKey="prodotti"><ProductList /></RoleGuard>} />
            <Route path="/prodotti/:id" element={<RoleGuard moduleKey="prodotti"><ProductDetail /></RoleGuard>} />
            <Route path="/produzione" element={<RoleGuard moduleKey="produzione"><ProductionPipeline /></RoleGuard>} />
            {/* FR-36: vista unica Inventario, schede interne per Tessuti/Accessori/Prodotti finiti. */}
            <Route path="/inventario" element={<RoleGuard moduleKey="inventario"><InventoryPage /></RoleGuard>}>
              <Route index element={<Navigate to="tessuti" replace />} />
              <Route path="tessuti" element={<FabricsInventory />} />
              <Route path="accessori" element={<AccessoriesInventory />} />
              <Route path="prodotti-finiti" element={<FinishedGoodsInventory />} />
            </Route>
            {/* Il vecchio elenco bolle confluisce nella vista unica Fornitori e lavorazioni. */}
            <Route path="/lavorazioni" element={<Navigate to="/fornitori/lavorazioni" replace />} />
            <Route path="/lavorazioni/:id" element={<RoleGuard moduleKey="lavorazioni"><BollaDetail /></RoleGuard>} />
            {/* Vista unica del flusso commerciale: richieste showroom, ordini e Shopify. */}
            <Route path="/ordini" element={<RoleGuard moduleKey="ordini"><SalesChannelsPage /></RoleGuard>}>
              <Route index element={<Navigate to="elenco" replace />} />
              <Route path="elenco" element={<OrdersPage />} />
              <Route path="showroom" element={<RoleGuard moduleKey="richieste-showroom"><RichiesteShowroomPage /></RoleGuard>} />
              <Route path="shopify" element={<RoleGuard moduleKey="shopify"><ShopifyPage /></RoleGuard>} />
            </Route>
            <Route path="/richieste-showroom" element={<Navigate to="/ordini/showroom" replace />} />
            {/* Vista unica Fatture e scadenze: una voce di menu, due schede interne. */}
            <Route path="/fatture" element={<RoleGuard moduleKey="fatture"><InvoicesDeadlinesPage /></RoleGuard>}>
              <Route index element={<Navigate to="elenco" replace />} />
              <Route path="elenco" element={<InvoiceList />} />
              <Route path="scadenze" element={<RoleGuard moduleKey="scadenze"><DeadlinesPage /></RoleGuard>} />
            </Route>
            {/* Vecchio indirizzo delle Scadenze: i link salvati continuano a funzionare. */}
            <Route path="/scadenze" element={<Navigate to="/fatture/scadenze" replace />} />
            {/* Vista unica Costi, margini e report. */}
            <Route path="/margini" element={<RoleGuard moduleKey="costi-margini"><EconomicsPage /></RoleGuard>}>
              <Route index element={<Navigate to="costi" replace />} />
              <Route path="costi" element={<MarginsPage />} />
              <Route path="report" element={<RoleGuard moduleKey="report"><ReportsPage /></RoleGuard>} />
            </Route>
            <Route path="/fornitori" element={<RoleGuard moduleKey="fornitori"><SupplierWorkPage /></RoleGuard>}>
              <Route index element={<Navigate to="anagrafica" replace />} />
              <Route path="anagrafica" element={<SupplierList />} />
              <Route path="lavorazioni" element={<RoleGuard moduleKey="lavorazioni"><LavorazioniPage /></RoleGuard>} />
            </Route>
            <Route path="/clienti" element={<RoleGuard moduleKey="clienti"><CustomerList /></RoleGuard>} />
            <Route path="/shopify" element={<Navigate to="/ordini/shopify" replace />} />
            {/* Vecchio indirizzo dei Report economici: i link salvati continuano a funzionare. */}
            <Route path="/report" element={<Navigate to="/margini/report" replace />} />
            <Route path="/analytics" element={<RoleGuard moduleKey="analytics"><AnalyticsPage /></RoleGuard>} />
            <Route path="/alert" element={<RoleGuard moduleKey="alert"><AlertsPage /></RoleGuard>} />
            <Route path="/assistente" element={<RoleGuard moduleKey="ai-assistant"><AiAssistantPage /></RoleGuard>} />
            <Route path="/log" element={<Navigate to="/impostazioni/log" replace />} />
            <Route path="/impostazioni" element={<RoleGuard moduleKey="impostazioni"><SettingsHubPage /></RoleGuard>}>
              <Route index element={<Navigate to="generali" replace />} />
              <Route path="generali" element={<SettingsPage />} />
              <Route path="utenti" element={<RoleGuard moduleKey="utenti"><UsersPage /></RoleGuard>} />
              <Route path="log" element={<RoleGuard moduleKey="activity-log"><ActivityLogPage /></RoleGuard>} />
            </Route>
          </Route>
          </Route>
        </Routes>
        </Suspense>
        </DataStoreProvider>
      </RoleProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
