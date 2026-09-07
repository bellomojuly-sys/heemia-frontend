import type { Role, AlertModulo } from '../types'

// Copia client della matrice permessi. **L'autorità è il server**
// (`server/src/core/permissions.ts`): qui si nascondono voci di menu e pulsanti, non si
// decide niente. Un pulsante che resta visibile per un errore di questo file produce una
// richiesta che il server rifiuta con 403; il contrario — un pulsante nascosto per errore —
// è un fastidio, non un buco.
//
// 2026-09-07 — due cambiamenti.
//
//   1. **Quattro azioni invece di una.** Prima c'era `canAccessModule` (vedi / non vedi) e
//      un `canEdit(role)` valido per tutta l'app: chi poteva correggere un prodotto poteva
//      anche eliminarlo, e il permesso non dipendeva dal modulo. Ora vedere, creare,
//      modificare ed eliminare sono distinti per ciascun modulo.
//   2. **La matrice arriva dal server.** Un amministratore può cambiarla da Impostazioni;
//      `/auth/me` e `/auth/login` restituiscono la matrice del ruolo di chi è entrato, e
//      `applicaMatriceUtente` la installa qui. La tabella scritta più sotto resta come
//      valore di partenza per il primo render e per i ruoli diversi dal proprio (che
//      servono solo a disegnare la matrice in Impostazioni, la quale però riceve la sua
//      copia dal server).

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
  | 'utenti'

export const AZIONI = ['vedere', 'creare', 'modificare', 'eliminare'] as const
export type Azione = (typeof AZIONI)[number]

export interface PermessiModulo {
  vedere: boolean
  creare: boolean
  modificare: boolean
  eliminare: boolean
}

export type MatriceRuolo = Partial<Record<ModuleKey, PermessiModulo>>

const NESSUNO: PermessiModulo = { vedere: false, creare: false, modificare: false, eliminare: false }
const TUTTO: PermessiModulo = { vedere: true, creare: true, modificare: true, eliminare: true }
const SOLA_LETTURA: PermessiModulo = { vedere: true, creare: false, modificare: false, eliminare: false }
const OPERATIVO: PermessiModulo = { vedere: true, creare: true, modificare: true, eliminare: false }

const MODULI: ModuleKey[] = [
  'dashboard', 'prodotti', 'produzione', 'inventario', 'lavorazioni', 'ordini',
  'richieste-showroom', 'fornitori', 'clienti', 'fatture', 'scadenze', 'costi-margini',
  'report', 'shopify', 'analytics', 'alert', 'ai-assistant', 'activity-log',
  'impostazioni', 'utenti',
]

/**
 * Matrice predefinita, gemella di quella in `server/src/core/permissions.ts`. Le due vanno
 * tenute allineate (regola vincolante del CLAUDE.md di progetto), ma da oggi una differenza
 * si nota subito: appena l'utente entra, il server manda la sua matrice reale e questa
 * viene sostituita.
 */
const DEFAULT_MATRIX: Record<Role, MatriceRuolo> = {
  admin: Object.fromEntries(MODULI.map((m) => [m, TUTTO])) as MatriceRuolo,
  ceo: { ...(Object.fromEntries(MODULI.map((m) => [m, TUTTO])) as MatriceRuolo), utenti: NESSUNO },
  team: {
    dashboard: SOLA_LETTURA,
    prodotti: OPERATIVO,
    produzione: OPERATIVO,
    inventario: OPERATIVO,
    lavorazioni: OPERATIVO,
    ordini: OPERATIVO,
    'richieste-showroom': OPERATIVO,
    fornitori: OPERATIVO,
    alert: SOLA_LETTURA,
    'ai-assistant': SOLA_LETTURA,
    impostazioni: SOLA_LETTURA,
    // «Team interno non vede mai Costi e Margini» (04_Security/User_Roles_Permissions.md):
    // i moduli economici sono assenti dalla navigazione, non mostrati senza dati.
    clienti: NESSUNO, fatture: NESSUNO, scadenze: NESSUNO, 'costi-margini': NESSUNO,
    report: NESSUNO, shopify: NESSUNO, analytics: NESSUNO, 'activity-log': NESSUNO,
    utenti: NESSUNO,
  },
  viewer: {
    dashboard: SOLA_LETTURA,
    prodotti: SOLA_LETTURA,
    produzione: SOLA_LETTURA,
    inventario: SOLA_LETTURA,
    lavorazioni: SOLA_LETTURA,
    ordini: SOLA_LETTURA,
    'richieste-showroom': SOLA_LETTURA,
    fornitori: SOLA_LETTURA,
    alert: SOLA_LETTURA,
    'ai-assistant': SOLA_LETTURA,
    impostazioni: SOLA_LETTURA,
    clienti: NESSUNO, fatture: NESSUNO, scadenze: NESSUNO, 'costi-margini': NESSUNO,
    report: NESSUNO, shopify: NESSUNO, analytics: NESSUNO, 'activity-log': NESSUNO,
    utenti: NESSUNO,
  },
  showroom: {},
}

// --- Matrice dell'utente collegato ------------------------------------------------
//
// Una variabile di modulo e non un contesto React: `canAccessModule(role, chiave)` è
// chiamata da una cinquantina di punti, molti dei quali fuori da un componente (calcolo di
// colonne, filtri delle voci di menu). Trasformarla in un hook avrebbe voluto dire
// riscrivere tutti quei punti per un guadagno nullo: il valore cambia solo al login e al
// logout, momenti in cui l'app si ridisegna comunque.
let ruoloCorrente: Role | null = null
let matriceCorrente: MatriceRuolo | null = null

/** Installa la matrice ricevuta dal server per l'utente collegato. La chiama AuthContext. */
export function applicaMatriceUtente(role: Role | null, matrice: MatriceRuolo | null): void {
  ruoloCorrente = role
  matriceCorrente = matrice
}

function permessi(role: Role, moduleKey: ModuleKey): PermessiModulo {
  // La matrice del server vale solo per il ruolo di chi è collegato: è l'unica che il
  // server abbia mandato. Per gli altri ruoli si ricade sul predefinito, e l'unica
  // schermata che li mostra (la matrice in Impostazioni) riceve i dati dalla sua API.
  if (matriceCorrente && ruoloCorrente === role) return matriceCorrente[moduleKey] ?? NESSUNO
  return DEFAULT_MATRIX[role]?.[moduleKey] ?? NESSUNO
}

export function puo(role: Role, moduleKey: ModuleKey, azione: Azione): boolean {
  return permessi(role, moduleKey)[azione]
}

export function canAccessModule(role: Role, moduleKey: ModuleKey): boolean {
  return puo(role, moduleKey, 'vedere')
}

/** Può creare voci nuove in questo modulo. */
export function canCreate(role: Role, moduleKey: ModuleKey): boolean {
  return puo(role, moduleKey, 'creare')
}

/**
 * Può modificare in questo modulo. Sostituisce il vecchio `canEdit(role)`, che non
 * guardava il modulo: con la matrice modificabile un ruolo può scrivere in inventario e
 * non in prodotti, e una sola risposta per tutta l'app non basta più.
 */
export function canEditModule(role: Role, moduleKey: ModuleKey): boolean {
  return puo(role, moduleKey, 'modificare')
}

/** Può eliminare in questo modulo. È sempre un permesso a sé: correggere non è cancellare. */
export function canDeleteModule(role: Role, moduleKey: ModuleKey): boolean {
  return puo(role, moduleKey, 'eliminare')
}

/**
 * Scrittura «qualunque» su un modulo: crea **oppure** modifica. È la domanda giusta per i
 * pulsanti che aprono un form che può fare entrambe le cose.
 */
export function canWrite(role: Role, moduleKey: ModuleKey): boolean {
  return canCreate(role, moduleKey) || canEditModule(role, moduleKey)
}

// Alert la cui visibilità segue quella del modulo economico corrispondente. Da quando la
// matrice è modificabile la domanda non è più «sei admin o CEO?» ma «vedi quel modulo?»:
// se l'amministratore apre Costi e margini al team, gli alert sui margini lo seguono.
const ALERT_MODULO: Partial<Record<AlertModulo, ModuleKey>> = {
  Margini: 'costi-margini',
  Costi: 'costi-margini',
  Fatture: 'fatture',
  Scadenze: 'scadenze',
  Shopify: 'shopify',
  Report: 'report',
}

export function canSeeAlertModulo(role: Role, modulo: AlertModulo): boolean {
  const chiave = ALERT_MODULO[modulo]
  if (!chiave) return true
  return canAccessModule(role, chiave)
}

/**
 * Eliminare un capo porta via varianti, giacenze, schede tecniche e documenti: è un
 * permesso distinto dalla modifica. Stessa regola sul server (`requirePermesso('eliminare')`
 * su DELETE /products/:id), che è l'autorità vera.
 */
export function canDeleteProducts(role: Role): boolean {
  return canDeleteModule(role, 'prodotti')
}

export function canApproveEmailDrafts(role: Role): boolean {
  return canEditModule(role, 'fornitori')
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  ceo: 'Founder / CEO',
  team: 'Team interno',
  viewer: 'Viewer',
  showroom: 'Cliente showroom',
}

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: 'Dashboard',
  prodotti: 'Anagrafica prodotti',
  produzione: 'Pipeline produzione',
  inventario: 'Inventario',
  lavorazioni: 'Bolle e lavorazioni',
  ordini: 'Ordini e canali di vendita',
  'richieste-showroom': 'Richieste showroom',
  fornitori: 'Fornitori',
  clienti: 'Clienti',
  fatture: 'Fatture',
  scadenze: 'Scadenze',
  'costi-margini': 'Costi e margini',
  report: 'Report economici',
  shopify: 'Shopify',
  analytics: 'Analytics',
  alert: 'Azioni richieste',
  'ai-assistant': 'AI Assistant',
  'activity-log': 'Activity log',
  impostazioni: 'Impostazioni',
  utenti: 'Utenti e accessi',
}

export const AZIONE_LABELS: Record<Azione, string> = {
  vedere: 'Visualizza',
  creare: 'Crea',
  modificare: 'Modifica',
  eliminare: 'Elimina',
}
