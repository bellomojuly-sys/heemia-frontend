import type { Role, AlertModulo } from '../types'

// Gating da 04_Security/User_Roles_Permissions.md.
// Regola esplicita: "Team interno non vede mai Costi e Margini" — nel prototipo mock i moduli
// sono assenti dalla navigazione, non semplicemente "con dati nascosti".
// Punti non esplicitamente coperti dalla matrice (Clienti, Shopify, Report, Activity log per Team/Viewer)
// sono trattati in modo conservativo: riservati ad Admin/CEO finche' non arriva una decisione documentata.

export type ModuleKey =
  | 'dashboard'
  | 'prodotti'
  | 'produzione'
  | 'inventario'
  | 'ordini'
  | 'fatture'
  | 'scadenze'
  | 'costi-margini'
  | 'fornitori'
  | 'clienti'
  | 'shopify'
  | 'report'
  | 'alert'
  | 'ai-assistant'
  | 'activity-log'
  | 'impostazioni'

const ADMIN_CEO: Role[] = ['admin', 'ceo']
const ADMIN_CEO_TEAM_VIEWER: Role[] = ['admin', 'ceo', 'team', 'viewer']

const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  dashboard: ADMIN_CEO_TEAM_VIEWER,
  prodotti: ADMIN_CEO_TEAM_VIEWER,
  produzione: ADMIN_CEO_TEAM_VIEWER,
  // FR-36 / DEC-020: vista unica Inventario — le tre chiavi separate (tessuti/accessori/prodotti)
  // avevano comunque accesso identico, quindi la fusione non cambia alcun comportamento di gating.
  inventario: ADMIN_CEO_TEAM_VIEWER,
  // La matrice assegna esplicitamente "ordini" al Team interno; pagina dedicata separata
  // da Clienti (che resta Admin/CEO perché include dati commerciali e sconti).
  ordini: ADMIN_CEO_TEAM_VIEWER,
  fatture: ADMIN_CEO,
  scadenze: ADMIN_CEO,
  'costi-margini': ADMIN_CEO,
  fornitori: ADMIN_CEO_TEAM_VIEWER,
  clienti: ADMIN_CEO,
  shopify: ADMIN_CEO,
  report: ADMIN_CEO,
  alert: ADMIN_CEO_TEAM_VIEWER,
  'ai-assistant': ADMIN_CEO_TEAM_VIEWER,
  'activity-log': ADMIN_CEO,
  impostazioni: ADMIN_CEO_TEAM_VIEWER,
}

// Alert la cui visibilita' segue lo stesso gating del modulo economico corrispondente.
const RESTRICTED_ALERT_MODULES: AlertModulo[] = ['Margini', 'Costi', 'Fatture', 'Scadenze', 'Shopify', 'Report']

export function canAccessModule(role: Role, moduleKey: ModuleKey): boolean {
  return MODULE_ACCESS[moduleKey].includes(role)
}

export function canSeeAlertModulo(role: Role, modulo: AlertModulo): boolean {
  if (!RESTRICTED_ALERT_MODULES.includes(modulo)) return true
  return ADMIN_CEO.includes(role)
}

export function canEdit(role: Role): boolean {
  return role === 'admin' || role === 'ceo' || role === 'team'
}

export function canApproveEmailDrafts(role: Role): boolean {
  return role === 'admin' || role === 'ceo' || role === 'team'
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  ceo: 'Founder / CEO',
  team: 'Team interno',
  viewer: 'Viewer',
  showroom: 'Cliente showroom',
}
