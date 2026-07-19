import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RoleProvider } from './context/RoleContext'
import { MockStoreProvider } from './context/MockStore'
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
import { OrdersPage } from './pages/orders/OrdersPage'
import { InvoiceList } from './pages/invoices/InvoiceList'
import { DeadlinesPage } from './pages/deadlines/DeadlinesPage'
import { MarginsPage } from './pages/margins/MarginsPage'
import { SupplierList } from './pages/suppliers/SupplierList'
import { CustomerList } from './pages/customers/CustomerList'
import { ShopifyPage } from './pages/shopify/ShopifyPage'
import { ReportsPage } from './pages/reports/ReportsPage'
import { AlertsPage } from './pages/alerts/AlertsPage'
import { AiAssistantPage } from './pages/assistant/AiAssistantPage'
import { ActivityLogPage } from './pages/logs/ActivityLogPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { ShowroomApp } from './pages/showroom/ShowroomApp'

export function AppRouter() {
  return (
    <BrowserRouter>
      <RoleProvider>
        <MockStoreProvider>
        <Routes>
          <Route path="/showroom" element={<ShowroomApp />} />

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
            <Route path="/ordini" element={<RoleGuard moduleKey="ordini"><OrdersPage /></RoleGuard>} />
            <Route path="/fatture" element={<RoleGuard moduleKey="fatture"><InvoiceList /></RoleGuard>} />
            <Route path="/scadenze" element={<RoleGuard moduleKey="scadenze"><DeadlinesPage /></RoleGuard>} />
            <Route path="/margini" element={<RoleGuard moduleKey="costi-margini"><MarginsPage /></RoleGuard>} />
            <Route path="/fornitori" element={<RoleGuard moduleKey="fornitori"><SupplierList /></RoleGuard>} />
            <Route path="/clienti" element={<RoleGuard moduleKey="clienti"><CustomerList /></RoleGuard>} />
            <Route path="/shopify" element={<RoleGuard moduleKey="shopify"><ShopifyPage /></RoleGuard>} />
            <Route path="/report" element={<RoleGuard moduleKey="report"><ReportsPage /></RoleGuard>} />
            <Route path="/alert" element={<RoleGuard moduleKey="alert"><AlertsPage /></RoleGuard>} />
            <Route path="/assistente" element={<RoleGuard moduleKey="ai-assistant"><AiAssistantPage /></RoleGuard>} />
            <Route path="/log" element={<RoleGuard moduleKey="activity-log"><ActivityLogPage /></RoleGuard>} />
            <Route path="/impostazioni" element={<RoleGuard moduleKey="impostazioni"><SettingsPage /></RoleGuard>} />
          </Route>
        </Routes>
        </MockStoreProvider>
      </RoleProvider>
    </BrowserRouter>
  )
}
