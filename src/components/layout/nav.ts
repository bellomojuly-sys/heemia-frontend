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
      { label: 'Ordini', path: '/ordini', moduleKey: 'ordini' },
      // Richieste dalla vista cliente showroom: stanno accanto agli ordini perché è lì che
      // finiscono una volta confermate (DEC-044).
      { label: 'Richieste showroom', path: '/richieste-showroom', moduleKey: 'richieste-showroom' },
    ],
  },
  {
    label: 'Economico',
    items: [
      { label: 'Fatture', path: '/fatture', moduleKey: 'fatture' },
      { label: 'Scadenze', path: '/scadenze', moduleKey: 'scadenze' },
      { label: 'Costi e margini', path: '/margini', moduleKey: 'costi-margini' },
      { label: 'Report economici', path: '/report', moduleKey: 'report' },
    ],
  },
  {
    label: 'Relazioni',
    items: [
      { label: 'Fornitori', path: '/fornitori', moduleKey: 'fornitori' },
      { label: 'Clienti', path: '/clienti', moduleKey: 'clienti' },
      { label: 'Shopify', path: '/shopify', moduleKey: 'shopify' },
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
