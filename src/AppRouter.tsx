import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { RoleProvider, useRole } from './context/RoleContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { MockStoreProvider } from './context/MockStore'
import { LoginPage } from './pages/auth/LoginPage'
import { AppLayout } from './components/layout/AppLayout'
import { RoleGuard } from './components/layout/RoleGuard'

import { Dashboard } from './pages/Dashboard'
import { ProductList } from './pages/products/ProductList'
import { ProductDetail } from './pages/products/ProductDetail'
import { ProductionPipeline } from './pages/production/ProductionPipeline'
import { InventoryPage } from './pages/inventory/InventoryPage'
import { FabricsInventory } from './pages/inventory/FabricsInventory'
import { AccessoriesInventory } from './pages/inventory/AccessoriesInventory'
import { FinishedGoodsInventory } from './pages/inventory/FinishedGoodsInventory'
import { LavorazioniPage } from './pages/lavorazioni/LavorazioniPage'
import { BollaDetail } from './pages/lavorazioni/BollaDetail'
import { OrdersPage } from './pages/orders/OrdersPage'
import { RichiesteShowroomPage } from './pages/richieste/RichiesteShowroomPage'
import { InvoicesDeadlinesPage } from './pages/invoices/InvoicesDeadlinesPage'
import { InvoiceList } from './pages/invoices/InvoiceList'
import { DeadlinesPage } from './pages/deadlines/DeadlinesPage'
import { EconomicsPage } from './pages/margins/EconomicsPage'
import { MarginsPage } from './pages/margins/MarginsPage'
import { SupplierList } from './pages/suppliers/SupplierList'
import { CustomerList } from './pages/customers/CustomerList'
import { ShopifyPage } from './pages/shopify/ShopifyPage'
import { ReportsPage } from './pages/reports/ReportsPage'
import { AnalyticsPage } from './pages/analytics/AnalyticsPage'
import { AlertsPage } from './pages/alerts/AlertsPage'
import { AiAssistantPage } from './pages/assistant/AiAssistantPage'
import { ActivityLogPage } from './pages/logs/ActivityLogPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { ShowroomApp } from './pages/showroom/ShowroomApp'

/**
 * Gate di sessione (Fase 13): senza utente autenticato si vede solo il login.
 * Lo showroom resta fuori — è la sub-app rivolta al cliente, con scope separato (A5).
 */
function AreaRiservata() {
  const { user, loading } = useAuth()
  const { setRole } = useRole()

  // Il ruolo dell'interfaccia segue quello reale della sessione: il selettore demo non decide più nulla.
  useEffect(() => {
    if (user) setRole(user.role)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role])

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
        <MockStoreProvider>
        <Routes>
          <Route path="/showroom" element={<ShowroomApp />} />

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
            {/* Bolle di lavorazione esterna: elenco e scheda del singolo documento. */}
            <Route path="/lavorazioni" element={<RoleGuard moduleKey="lavorazioni"><LavorazioniPage /></RoleGuard>} />
            <Route path="/lavorazioni/:id" element={<RoleGuard moduleKey="lavorazioni"><BollaDetail /></RoleGuard>} />
            <Route path="/ordini" element={<RoleGuard moduleKey="ordini"><OrdersPage /></RoleGuard>} />
            <Route path="/richieste-showroom" element={<RoleGuard moduleKey="richieste-showroom"><RichiesteShowroomPage /></RoleGuard>} />
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
            <Route path="/fornitori" element={<RoleGuard moduleKey="fornitori"><SupplierList /></RoleGuard>} />
            <Route path="/clienti" element={<RoleGuard moduleKey="clienti"><CustomerList /></RoleGuard>} />
            <Route path="/shopify" element={<RoleGuard moduleKey="shopify"><ShopifyPage /></RoleGuard>} />
            {/* Vecchio indirizzo dei Report economici: i link salvati continuano a funzionare. */}
            <Route path="/report" element={<Navigate to="/margini/report" replace />} />
            <Route path="/analytics" element={<RoleGuard moduleKey="analytics"><AnalyticsPage /></RoleGuard>} />
            <Route path="/alert" element={<RoleGuard moduleKey="alert"><AlertsPage /></RoleGuard>} />
            <Route path="/assistente" element={<RoleGuard moduleKey="ai-assistant"><AiAssistantPage /></RoleGuard>} />
            <Route path="/log" element={<RoleGuard moduleKey="activity-log"><ActivityLogPage /></RoleGuard>} />
            <Route path="/impostazioni" element={<RoleGuard moduleKey="impostazioni"><SettingsPage /></RoleGuard>} />
          </Route>
          </Route>
        </Routes>
        </MockStoreProvider>
      </RoleProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
