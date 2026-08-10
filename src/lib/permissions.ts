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
  | 'lavorazioni'
  | 'ordini'
  | 'richieste-showroom'
  | 'fatture'
  | 'scadenze'
  | 'costi-margini'
  | 'fornitori'
  | 'clienti'
  | 'shopify'
  | 'report'
  | 'analytics'
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
  // Bolle di lavorazione esterna (2026-08-10): lavoro di magazzino, stessa apertura
  // dell'inventario. La chiusura di una lavorazione **con differenza** resta però
  // riservata ad Admin/CEO — quel controllo lo fa il server, che è l'autorità.
  lavorazioni: ADMIN_CEO_TEAM_VIEWER,
  // La matrice assegna esplicitamente "ordini" al Team interno; pagina dedicata separata
  // da Clienti (che resta Admin/CEO perché include dati commerciali e sconti).
  ordini: ADMIN_CEO_TEAM_VIEWER,
  // Richieste dalla vista cliente (spec 2026-08-06): lavoro operativo di chi segue il
  // cliente in showroom, stessa apertura di "ordini". L'autorità resta il server.
  'richieste-showroom': ADMIN_CEO_TEAM_VIEWER,
  fatture: ADMIN_CEO,
  scadenze: ADMIN_CEO,
  'costi-margini': ADMIN_CEO,
  fornitori: ADMIN_CEO_TEAM_VIEWER,
  clienti: ADMIN_CEO,
  shopify: ADMIN_CEO,
  report: ADMIN_CEO,
  // Analytics (backlog "note" §10): dati commerciali del sito, stesso gating di Shopify e
  // Report. Assunzione da confermare con la founder (OQ-20).
  analytics: ADMIN_CEO,
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

/**
 * Eliminare un capo è riservato ad Admin e CEO: le altre scritture si correggono, questa
 * porta via varianti, giacenze, schede tecniche e documenti. Stessa regola sul server
 * (`requireRole('admin','ceo')` su DELETE /products/:id), che è l'autorità vera.
 */
export function canDeleteProducts(role: Role): boolean {
  return role === 'admin' || role === 'ceo'
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
