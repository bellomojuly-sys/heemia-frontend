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
      // Anagrafica e bolle sono due parti dello stesso rapporto con chi lavora materiali
      // e capi per l'azienda, quindi condividono una sola pagina operativa.
      { label: 'Fornitori e lavorazioni', path: '/fornitori', moduleKey: 'fornitori' },
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
      { label: 'Clienti', path: '/clienti', moduleKey: 'clienti' },
      { label: 'Analytics', path: '/analytics', moduleKey: 'analytics' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Azioni richieste', path: '/alert', moduleKey: 'alert' },
      { label: 'AI Assistant', path: '/assistente', moduleKey: 'ai-assistant' },
      { label: 'Impostazioni', path: '/impostazioni', moduleKey: 'impostazioni' },
    ],
  },
]
