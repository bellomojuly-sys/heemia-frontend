// FR-30 — dashboard. Un solo endpoint aggregato: la home fa una chiamata sola.
// I KPI economici (margini) restano visibili solo a chi ha il modulo costi-margini.
import type { FastifyInstance } from 'fastify'
import { authenticate, requireModule } from '../../core/guards.js'
import { canAccessModule } from '../../core/permissions.js'
import {
  getDashboardKpis, getMaterialAlerts, getProductBreakdowns, getRecentOrders,
  getStockOverview, getTopSellingProducts,
} from './service.js'

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', { preHandler: [authenticate, requireModule('dashboard')] }, async (req) => {
    const [kpis, materialAlerts, stock, recentOrders, topSelling, breakdowns] = await Promise.all([
      getDashboardKpis(),
      getMaterialAlerts(),
      getStockOverview(),
      getRecentOrders(),
      getTopSellingProducts(),
      getProductBreakdowns(),
    ])

    // Chi non ha accesso ai costi non riceve i KPI economici: nascosti alla fonte,
    // non solo nell'interfaccia.
    const vedeCosti = canAccessModule(req.user!.role, 'costi-margini')
    const { margineSottoTarget, sottoBreakEven, fattureNonAssociate, ...neutri } = kpis

    return {
      kpis: vedeCosti ? kpis : neutri,
      materialAlerts,
      stock,
      recentOrders,
      topSelling,
      ...breakdowns,
    }
  })
}
