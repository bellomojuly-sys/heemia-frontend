// Porting server-side di src/lib/permissions.ts. La matrice vive sul server (System_Architecture §3):
// il client la replica solo per nascondere pulsanti/pagine, ma l'autorità è qui.
import type { Role } from '@prisma/client'

export type ModuleKey =
  | 'dashboard' | 'prodotti' | 'produzione' | 'inventario' | 'ordini' | 'fatture'
  | 'scadenze' | 'costi-margini' | 'fornitori' | 'clienti' | 'shopify' | 'report'
  | 'analytics' | 'alert' | 'ai-assistant' | 'activity-log' | 'impostazioni'
  | 'richieste-showroom' | 'lavorazioni'

const ADMIN_CEO: Role[] = ['admin', 'ceo']
const ALL_INTERNAL: Role[] = ['admin', 'ceo', 'team', 'viewer']

const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  dashboard: ALL_INTERNAL,
  prodotti: ALL_INTERNAL,
  produzione: ALL_INTERNAL,
  inventario: ALL_INTERNAL,
  ordini: ALL_INTERNAL,
  // Richieste dalla vista cliente (spec 2026-08-06): è lavoro operativo di chi segue il
  // cliente in showroom, quindi stessa apertura di "ordini". Contiene contatto e misure,
  // non dati economici aziendali.
  'richieste-showroom': ALL_INTERNAL,
  // Bolle di lavorazione esterna (2026-08-10): è lavoro di magazzino — chi prepara la
  // consegna al lavorante e chi registra il rientro. Stessa apertura di "inventario", di
  // cui è la continuazione naturale; nessun dato economico. La chiusura con differenza
  // resta però riservata ad admin/CEO (controllo in lavorazioni/service.ts).
  lavorazioni: ALL_INTERNAL,
  fatture: ADMIN_CEO,
  scadenze: ADMIN_CEO,
  'costi-margini': ADMIN_CEO,
  fornitori: ALL_INTERNAL,
  clienti: ADMIN_CEO,
  shopify: ADMIN_CEO,
  report: ADMIN_CEO,
  // Analytics GA4 (backlog "note" §10): dati commerciali, stesso gating di Shopify/Report.
  analytics: ADMIN_CEO,
  alert: ALL_INTERNAL,
  'ai-assistant': ALL_INTERNAL,
  'activity-log': ADMIN_CEO,
  impostazioni: ALL_INTERNAL,
}

export function canAccessModule(role: Role, moduleKey: ModuleKey): boolean {
  return MODULE_ACCESS[moduleKey].includes(role)
}

// Etichette di modulo usate dagli alert (FR-27): non coincidono con le ModuleKey delle pagine.
export type AlertModulo =
  | 'Margini' | 'Costi' | 'Fatture' | 'Inventario tessuti' | 'Inventario accessori'
  | 'Inventario prodotti finiti' | 'Scadenze' | 'Anagrafica' | 'Shopify' | 'Report' | 'Ordini'
  | 'Produzione'

// Alert la cui visibilità segue lo stesso gating del modulo economico corrispondente
// (porting di RESTRICTED_ALERT_MODULES in src/lib/permissions.ts).
const RESTRICTED_ALERT_MODULES: AlertModulo[] = ['Margini', 'Costi', 'Fatture', 'Scadenze', 'Shopify', 'Report']

export function canSeeAlertModulo(role: Role, modulo: AlertModulo): boolean {
  if (!RESTRICTED_ALERT_MODULES.includes(modulo)) return true
  return ADMIN_CEO.includes(role)
}

// Chi può scrivere (create/update). Viewer è in sola lettura; showroom non tocca il gestionale.
export function canEdit(role: Role): boolean {
  return role === 'admin' || role === 'ceo' || role === 'team'
}
