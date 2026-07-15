import { Badge } from '../components/ui/Badge'

type BadgeVariant = 'neutral' | 'critical' | 'warning' | 'success' | 'info'

interface StatusMeta {
  label: string
  variant: BadgeVariant
}

// Mappa unica di tutti gli stati stringa usati nel mock (materiali, accessori, inventario,
// fatture, scadenze, bozze email, pubblicazione Shopify, alert, margini, idee, ordini).
const STATUS_META: Record<string, StatusMeta> = {
  // disponibilità materiali / accessori / varianti / inventario
  disponibile: { label: 'Disponibile', variant: 'success' },
  sotto_soglia: { label: 'Sotto soglia', variant: 'warning' },
  esaurito: { label: 'Esaurito', variant: 'critical' },
  da_verificare: { label: 'Da verificare', variant: 'neutral' },
  low_stock: { label: 'Low stock', variant: 'warning' },

  // scadenze
  in_arrivo: { label: 'In arrivo', variant: 'info' },
  in_ritardo: { label: 'In ritardo', variant: 'critical' },
  saldata: { label: 'Saldata', variant: 'success' },

  // fatture
  da_pagare: { label: 'Da pagare', variant: 'warning' },
  pagata: { label: 'Pagata', variant: 'success' },
  scaduta: { label: 'Scaduta', variant: 'critical' },

  // bozze email fornitori (FR-06)
  bozza_generata: { label: 'Bozza generata', variant: 'neutral' },
  in_attesa_approvazione: { label: 'In attesa di approvazione', variant: 'warning' },
  modificata: { label: 'Modificata', variant: 'info' },
  approvata: { label: 'Approvata', variant: 'success' },
  inviata: { label: 'Inviata', variant: 'info' },
  risposta_ricevuta: { label: 'Risposta ricevuta', variant: 'success' },
  chiusa: { label: 'Chiusa', variant: 'neutral' },
  annullata: { label: 'Annullata', variant: 'neutral' },

  // pubblicazione Shopify
  non_pubblicato: { label: 'Non pubblicato', variant: 'neutral' },
  bozza: { label: 'Bozza', variant: 'warning' },
  pubblicato: { label: 'Pubblicato', variant: 'success' },

  // alert
  critico: { label: 'Critico', variant: 'critical' },
  attenzione: { label: 'Attenzione', variant: 'warning' },
  info: { label: 'Info', variant: 'info' },

  // margini
  reale: { label: 'Dato reale', variant: 'success' },
  stimato: { label: 'Dato stimato', variant: 'neutral' },

  // idee capo
  nuova: { label: 'Nuova', variant: 'info' },
  in_valutazione: { label: 'In valutazione', variant: 'warning' },
  promossa: { label: 'Promossa a prodotto', variant: 'success' },

  // ordini
  in_lavorazione: { label: 'In lavorazione', variant: 'info' },
  spedito: { label: 'Spedito', variant: 'success' },
  consegnato: { label: 'Consegnato', variant: 'success' },
  annullato: { label: 'Annullato', variant: 'neutral' },
}

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? { label: status, variant: 'neutral' }
}

export function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status)
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}
