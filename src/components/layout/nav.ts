import type { ModuleKey } from '../../lib/permissions'

export interface NavItem {
  label: string
  path: string
  moduleKey: ModuleKey
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  { label: '', items: [{ label: 'Dashboard', path: '/', moduleKey: 'dashboard' }] },
  {
    label: 'Prodotto',
    items: [
      { label: 'Anagrafica prodotti', path: '/prodotti', moduleKey: 'prodotti' },
      { label: 'Pipeline produzione', path: '/produzione', moduleKey: 'produzione' },
    ],
  },
  {
    // FR-36: vista unica Inventario — una voce di menu, non tre. Le sezioni Tessuti/Accessori/
    // Prodotti finiti sono schede cliccabili dentro InventoryPage, non voci di navigazione separate.
    label: 'Inventario',
    items: [
      { label: 'Inventario', path: '/inventario', moduleKey: 'inventario' },
      // Bolle di lavorazione esterna (2026-08-10): sta qui perché è la continuazione
      // dell'inventario — è il posto dove finisce il materiale che esce dal magazzino
      // senza essere venduto.
      { label: 'Bolle / Lavorazioni esterne', path: '/lavorazioni', moduleKey: 'lavorazioni' },
      // Una richiesta showroom confermata diventa un ordine; Shopify è l'altro canale da
      // cui arrivano ordini. Le tre viste sono quindi schede della stessa pagina.
      { label: 'Ordini e canali di vendita', path: '/ordini', moduleKey: 'ordini' },
    ],
  },
  {
    // Due viste uniche invece di quattro voci (2026-08-10), stesso schema di FR-36 per
    // l'Inventario: le scadenze nascono dalle fatture da pagare e i report economici sono
    // la lettura mensile degli stessi margini, quindi le schede stanno dentro la pagina.
    // Nessun cambio di permessi: le quattro chiavi sono tutte Admin/CEO.
    label: 'Economico',
    items: [
      { label: 'Fatture e scadenze', path: '/fatture', moduleKey: 'fatture' },
      { label: 'Costi, margini e report', path: '/margini', moduleKey: 'costi-margini' },
    ],
  },
  {
    label: 'Relazioni',
    items: [
      { label: 'Fornitori', path: '/fornitori', moduleKey: 'fornitori' },
      { label: 'Clienti', path: '/clienti', moduleKey: 'clienti' },
      { label: 'Analytics', path: '/analytics', moduleKey: 'analytics' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Azioni richieste', path: '/alert', moduleKey: 'alert' },
      { label: 'AI Assistant', path: '/assistente', moduleKey: 'ai-assistant' },
      { label: 'Activity log', path: '/log', moduleKey: 'activity-log' },
      { label: 'Impostazioni', path: '/impostazioni', moduleKey: 'impostazioni' },
    ],
  },
]
