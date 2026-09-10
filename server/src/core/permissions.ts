// Matrice dei permessi: ruolo × modulo × azione. La matrice vive sul server
// (System_Architecture §3): il client la replica solo per nascondere pulsanti e pagine,
// ma l'autorità è qui.
//
// 2026-09-07 — due cambiamenti rispetto alla versione precedente.
//
//   1. **Quattro azioni invece di una.** Prima un ruolo «vedeva» o «non vedeva» un modulo,
//      e la scrittura era un'unica funzione `canEdit(role)` valida per tutta l'app: chi
//      poteva modificare un prodotto poteva anche eliminarlo, e chi poteva vedere una
//      fattura poteva crearne una. Ora vedere, creare, modificare ed eliminare sono
//      permessi distinti per ciascun modulo.
//
//   2. **La matrice è un dato, non solo codice.** Quella scritta qui sotto è la riga di
//      partenza; l'amministratore può cambiarla dall'app e le modifiche finiscono in
//      `role_permissions`. Una riga in tabella vince sul valore predefinito; se la riga
//      non c'è vale il predefinito, così un modulo nuovo funziona il giorno in cui viene
//      scritto senza dover ricordarsi di popolare la tabella.
//
// Perché il predefinito resta nel codice e non in un seed: un seed si esegue una volta e
// poi la verità sta solo in tabella. Qui invece il codice risponde sempre, anche su un
// database appena creato, e la tabella contiene **solo le differenze volute**.
import type { Role } from '@prisma/client'
import { prisma } from './prisma.js'

export type ModuleKey =
  | 'dashboard' | 'prodotti' | 'produzione' | 'inventario' | 'ordini' | 'fatture'
  | 'scadenze' | 'costi-margini' | 'fornitori' | 'clienti' | 'shopify' | 'report'
  | 'analytics' | 'alert' | 'ai-assistant' | 'activity-log' | 'impostazioni'
  | 'richieste-showroom' | 'lavorazioni' | 'utenti'

/** Le quattro azioni della matrice. L'ordine è quello in cui si leggono in tabella. */
export const AZIONI = ['vedere', 'creare', 'modificare', 'eliminare'] as const
export type Azione = (typeof AZIONI)[number]

export interface PermessiModulo {
  vedere: boolean
  creare: boolean
  modificare: boolean
  eliminare: boolean
}

/** Elenco completo dei moduli, nell'ordine in cui compaiono nella matrice in Impostazioni. */
export const MODULE_KEYS: ModuleKey[] = [
  'dashboard', 'prodotti', 'produzione', 'inventario', 'lavorazioni', 'ordini',
  'richieste-showroom', 'fornitori', 'clienti', 'fatture', 'scadenze', 'costi-margini',
  'report', 'shopify', 'analytics', 'alert', 'ai-assistant', 'activity-log',
  'impostazioni', 'utenti',
]

/** Etichette leggibili: le usano l'interfaccia e i messaggi d'errore del server. */
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

export const RUOLI: Role[] = ['admin', 'ceo', 'team', 'viewer', 'showroom']

const NESSUNO: PermessiModulo = { vedere: false, creare: false, modificare: false, eliminare: false }
const TUTTO: PermessiModulo = { vedere: true, creare: true, modificare: true, eliminare: true }
const SOLA_LETTURA: PermessiModulo = { vedere: true, creare: false, modificare: false, eliminare: false }
/** Lavoro operativo: si crea e si corregge, non si cancella. */
const OPERATIVO: PermessiModulo = { vedere: true, creare: true, modificare: true, eliminare: false }

/**
 * Matrice predefinita, derivata da 04_Security/User_Roles_Permissions.md.
 *
 * Le regole esplicite del documento che qui restano invariate:
 *   - «Team interno non vede mai Costi e Margini» → moduli economici assenti, non svuotati.
 *   - Viewer è in sola lettura ovunque.
 *   - `utenti` è **solo admin**, non admin+CEO: dare e togliere accessi è amministrazione
 *     del sistema, non direzione dell'azienda.
 *   - `showroom` non è un utente del gestionale ma lo scope della sub-app cliente: qui
 *     non ha nulla, e le sue rotte vivono sotto un prefisso separato.
 *
 * Le eliminazioni sono chiuse quasi ovunque anche per admin/CEO di proposito: si aprono
 * dove esiste davvero un'eliminazione con controlli a monte (prodotti, clienti, utenti,
 * costi fissi, lavorazioni, schede e documenti).
 */
const DEFAULT_MATRIX: Record<Role, Partial<Record<ModuleKey, PermessiModulo>>> = {
  admin: Object.fromEntries(MODULE_KEYS.map((m) => [m, TUTTO])) as Record<ModuleKey, PermessiModulo>,
  ceo: {
    ...(Object.fromEntries(MODULE_KEYS.map((m) => [m, TUTTO])) as Record<ModuleKey, PermessiModulo>),
    // Unica differenza dall'admin: gli accessi non si danno dalla direzione.
    utenti: NESSUNO,
  },
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
    // Moduli economici e amministrativi: assenti, non «visibili senza dati».
    clienti: NESSUNO, fatture: NESSUNO, scadenze: NESSUNO, 'costi-margini': NESSUNO,
    // Analytics: visibile a tutti i ruoli del gestionale in sola lettura (OQ-21, Giulia
    // 2026-09-10). E' l'andamento del sito, non un dato economico: non espone costi,
    // margini ne' fatturato, e chi lavora sui capi ha motivo di vedere cosa guardano i
    // clienti. Resta modificabile dalla matrice in Impostazioni.
    analytics: SOLA_LETTURA,
    report: NESSUNO, shopify: NESSUNO, 'activity-log': NESSUNO,
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
    analytics: SOLA_LETTURA, // come per il team: OQ-21, Giulia 2026-09-10.
    report: NESSUNO, shopify: NESSUNO, 'activity-log': NESSUNO,
    utenti: NESSUNO,
  },
  showroom: {},
}

export function permessiPredefiniti(role: Role, moduleKey: ModuleKey): PermessiModulo {
  return DEFAULT_MATRIX[role]?.[moduleKey] ?? NESSUNO
}

/**
 * Permessi che NON si possono togliere, nemmeno dall'app.
 *
 * Un amministratore che si togliesse `impostazioni` o `utenti` chiuderebbe la porta da cui
 * si rientra: la matrice si modifica da lì, e non esiste un secondo posto da cui rimediare
 * se non il database. È lo stesso motivo per cui non può disattivare il proprio account.
 */
const INTOCCABILI: { role: Role; moduleKey: ModuleKey; azioni: Azione[] }[] = [
  { role: 'admin', moduleKey: 'impostazioni', azioni: ['vedere'] },
  { role: 'admin', moduleKey: 'utenti', azioni: ['vedere', 'modificare'] },
]

export function permessoBloccato(role: Role, moduleKey: ModuleKey, azione: Azione): boolean {
  return INTOCCABILI.some((r) => r.role === role && r.moduleKey === moduleKey && r.azioni.includes(azione))
}

// --- Matrice effettiva: predefinita + righe salvate -------------------------------
//
// La cache evita una query per ogni richiesta: la matrice cambia solo quando qualcuno la
// salva, e in quel momento `invalidaCachePermessi()` la butta via. La durata massima serve
// a chiudere il caso di due istanze del server (Render può averne più di una): senza,
// una modifica fatta su un'istanza resterebbe invisibile all'altra finché non si riavvia.
const CACHE_MS = 30_000
let cache: { scadenza: number; matrice: Map<string, PermessiModulo> } | null = null

export function invalidaCachePermessi(): void {
  cache = null
}

const chiave = (role: Role, moduleKey: string) => `${role}::${moduleKey}`

async function caricaOverride(): Promise<Map<string, PermessiModulo>> {
  if (cache && cache.scadenza > Date.now()) return cache.matrice
  const righe = await prisma.rolePermission.findMany()
  const matrice = new Map<string, PermessiModulo>()
  for (const r of righe) {
    matrice.set(chiave(r.role, r.moduleKey), {
      vedere: r.puoVedere,
      creare: r.puoCreare,
      modificare: r.puoModificare,
      eliminare: r.puoEliminare,
    })
  }
  cache = { scadenza: Date.now() + CACHE_MS, matrice }
  return matrice
}

/** I permessi realmente in vigore per un ruolo su un modulo. */
export async function permessiEffettivi(role: Role, moduleKey: ModuleKey): Promise<PermessiModulo> {
  const override = await caricaOverride()
  const salvati = override.get(chiave(role, moduleKey))
  const base = salvati ?? permessiPredefiniti(role, moduleKey)
  // I permessi intoccabili si riaffermano qui e non solo in salvataggio: se una riga
  // sbagliata arrivasse in tabella per altra via (import, correzione a mano), non deve
  // poter chiudere fuori l'amministratore.
  const bloccati = INTOCCABILI.filter((r) => r.role === role && r.moduleKey === moduleKey).flatMap((r) => r.azioni)
  if (bloccati.length === 0) return base
  return {
    vedere: base.vedere || bloccati.includes('vedere'),
    creare: base.creare || bloccati.includes('creare'),
    modificare: base.modificare || bloccati.includes('modificare'),
    eliminare: base.eliminare || bloccati.includes('eliminare'),
  }
}

/** Matrice completa di un ruolo: quello che il client riceve per disegnare l'interfaccia. */
export async function matriceRuolo(role: Role): Promise<Record<ModuleKey, PermessiModulo>> {
  const voci = await Promise.all(MODULE_KEYS.map(async (m) => [m, await permessiEffettivi(role, m)] as const))
  return Object.fromEntries(voci) as Record<ModuleKey, PermessiModulo>
}

/** Matrice completa di tutti i ruoli: la tabella modificabile in Impostazioni. */
export async function matriceCompleta(): Promise<Record<Role, Record<ModuleKey, PermessiModulo>>> {
  const voci = await Promise.all(RUOLI.map(async (r) => [r, await matriceRuolo(r)] as const))
  return Object.fromEntries(voci) as Record<Role, Record<ModuleKey, PermessiModulo>>
}

export async function puo(role: Role, moduleKey: ModuleKey, azione: Azione): Promise<boolean> {
  return (await permessiEffettivi(role, moduleKey))[azione]
}

export async function canAccessModule(role: Role, moduleKey: ModuleKey): Promise<boolean> {
  return puo(role, moduleKey, 'vedere')
}

// Etichette di modulo usate dagli alert (FR-27): non coincidono con le ModuleKey delle pagine.
export type AlertModulo =
  | 'Margini' | 'Costi' | 'Fatture' | 'Inventario tessuti' | 'Inventario accessori'
  | 'Inventario prodotti finiti' | 'Scadenze' | 'Anagrafica' | 'Shopify' | 'Report' | 'Ordini'
  | 'Produzione'

/**
 * Alert la cui visibilità segue quella del modulo economico corrispondente. Da quando la
 * matrice è modificabile la domanda non è più «il ruolo è admin o CEO?» ma «questo ruolo
 * vede quel modulo?»: se l'amministratore apre Costi e margini al team, gli alert sui
 * margini devono seguirlo, altrimenti il permesso concesso resterebbe a metà.
 */
const ALERT_MODULO: Partial<Record<AlertModulo, ModuleKey>> = {
  Margini: 'costi-margini',
  Costi: 'costi-margini',
  Fatture: 'fatture',
  Scadenze: 'scadenze',
  Shopify: 'shopify',
  Report: 'report',
}

export async function canSeeAlertModulo(role: Role, modulo: AlertModulo): Promise<boolean> {
  const chiaveModulo = ALERT_MODULO[modulo]
  if (!chiaveModulo) return true
  return canAccessModule(role, chiaveModulo)
}

/**
 * Scrittura «generica», usata dove non c'è un modulo di riferimento (oggi: nessuna rotta
 * dell'API interna — le rotte passano tutte da `requireModule`). Resta come rete di
 * sicurezza per il codice che non dichiara il modulo: viewer e showroom non scrivono mai.
 */
export function canEdit(role: Role): boolean {
  return role === 'admin' || role === 'ceo' || role === 'team'
}
