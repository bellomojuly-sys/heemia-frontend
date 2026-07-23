// Porting server-side di src/lib/permissions.ts. La matrice vive sul server (System_Architecture §3):
// il client la replica solo per nascondere pulsanti/pagine, ma l'autorità è qui.
import type { Role } from '@prisma/client'

export type ModuleKey =
  | 'dashboard' | 'prodotti' | 'produzione' | 'inventario' | 'ordini' | 'fatture'
  | 'scadenze' | 'costi-margini' | 'fornitori' | 'clienti' | 'shopify' | 'report'
  | 'alert' | 'ai-assistant' | 'activity-log' | 'impostazioni'

const ADMIN_CEO: Role[] = ['admin', 'ceo']
const ALL_INTERNAL: Role[] = ['admin', 'ceo', 'team', 'viewer']

const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  dashboard: ALL_INTERNAL,
  prodotti: ALL_INTERNAL,
  produzione: ALL_INTERNAL,
  inventario: ALL_INTERNAL,
  ordini: ALL_INTERNAL,
  fatture: ADMIN_CEO,
  scadenze: ADMIN_CEO,
  'costi-margini': ADMIN_CEO,
  fornitori: ALL_INTERNAL,
  clienti: ADMIN_CEO,
  shopify: ADMIN_CEO,
  report: ADMIN_CEO,
  alert: ALL_INTERNAL,
  'ai-assistant': ALL_INTERNAL,
  'activity-log': ADMIN_CEO,
  impostazioni: ALL_INTERNAL,
}

export function canAccessModule(role: Role, moduleKey: ModuleKey): boolean {
  return MODULE_ACCESS[moduleKey].includes(role)
}

// Chi può scrivere (create/update). Viewer è in sola lettura; showroom non tocca il gestionale.
export function canEdit(role: Role): boolean {
  return role === 'admin' || role === 'ceo' || role === 'team'
}
