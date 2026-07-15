import type { AlertItem } from '../types'
import { products } from '../mock/products'
import { technicalSheets } from '../mock/technicalSheets'
import { materials, accessories } from '../mock/materials'
import { invoices } from '../mock/invoices'
import { margins, MARGIN_THRESHOLD_PERCENT } from '../mock/margins'
import { inventoryRecords } from '../mock/inventory'
import { productVariants } from '../mock/products'
import { monthlyReports } from '../mock/reports'

// "Oggi" fissato per il prototipo a dati finti (coerente con le scadenze mock in invoices.ts).
export const TODAY = new Date('2026-07-14')

export function daysBetween(dateStr: string): number {
  const target = new Date(dateStr)
  return Math.round((target.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24))
}

// Deriva gli alert direttamente dai dati mock (FR-27), cosi restano sempre coerenti
// con prodotti, materiali, fatture e margini mostrati nel resto dell'app.
export function computeAlerts(): AlertItem[] {
  const alerts: AlertItem[] = []

  for (const m of margins) {
    if (m.sottoSoglia) {
      const p = products.find((pr) => pr.id === m.productId)
      alerts.push({
        id: `alert-margin-${m.productId}`, modulo: 'Margini', livello: 'critico',
        messaggio: `${p?.nome ?? m.productId}: margine ${m.marginePercentuale.toFixed(1)}% sotto soglia (${MARGIN_THRESHOLD_PERCENT}%)`,
        data: TODAY.toISOString(), entitaId: m.productId, link: `/prodotti/${m.productId}`,
      })
    }
    if (m.prezzoVendita <= m.breakEvenPrice) {
      alerts.push({
        id: `alert-breakeven-${m.productId}`, modulo: 'Margini', livello: 'critico',
        messaggio: `${products.find((pr) => pr.id === m.productId)?.nome ?? m.productId}: prezzo di vendita sotto break-even`,
        data: TODAY.toISOString(), entitaId: m.productId, link: `/prodotti/${m.productId}`,
      })
    }
  }

  for (const mat of materials) {
    if (mat.stato === 'sotto_soglia' || mat.stato === 'esaurito') {
      alerts.push({
        id: `alert-mat-${mat.id}`, modulo: 'Inventario tessuti',
        livello: mat.stato === 'esaurito' ? 'critico' : 'attenzione',
        messaggio: `${mat.nome}: ${mat.stato === 'esaurito' ? 'scorta esaurita' : 'scorta sotto soglia minima'}`,
        data: TODAY.toISOString(), entitaId: mat.id, link: `/inventario/tessuti`,
      })
    }
  }

  for (const acc of accessories) {
    if (acc.stato === 'sotto_soglia' || acc.stato === 'esaurito') {
      alerts.push({
        id: `alert-acc-${acc.id}`, modulo: 'Inventario accessori',
        livello: acc.stato === 'esaurito' ? 'critico' : 'attenzione',
        messaggio: `${acc.nome}: ${acc.stato === 'esaurito' ? 'scorta esaurita' : 'scorta sotto soglia minima'}`,
        data: TODAY.toISOString(), entitaId: acc.id, link: `/inventario/accessori`,
      })
    }
  }

  for (const inv of invoices) {
    if (!inv.associata) {
      alerts.push({
        id: `alert-inv-assoc-${inv.id}`, modulo: 'Fatture', livello: 'attenzione',
        messaggio: `Fattura ${inv.numero} caricata ma non associata a prodotti o materiali`,
        data: TODAY.toISOString(), entitaId: inv.id, link: `/fatture`,
      })
    }
    if (inv.statoPagamento === 'scaduta') {
      alerts.push({
        id: `alert-inv-scaduta-${inv.id}`, modulo: 'Scadenze', livello: 'critico',
        messaggio: `Fattura ${inv.numero} scaduta e non pagata`,
        data: TODAY.toISOString(), entitaId: inv.id, link: `/scadenze`,
      })
    } else if (inv.dataScadenza) {
      const giorni = daysBetween(inv.dataScadenza)
      if (giorni >= 0 && giorni <= 7) {
        alerts.push({
          id: `alert-inv-7-${inv.id}`, modulo: 'Scadenze', livello: 'attenzione',
          messaggio: `Fattura ${inv.numero} in scadenza tra ${giorni} giorni`,
          data: TODAY.toISOString(), entitaId: inv.id, link: `/scadenze`,
        })
      } else if (giorni > 7 && giorni <= 30) {
        alerts.push({
          id: `alert-inv-30-${inv.id}`, modulo: 'Scadenze', livello: 'info',
          messaggio: `Fattura ${inv.numero} in scadenza tra ${giorni} giorni`,
          data: TODAY.toISOString(), entitaId: inv.id, link: `/scadenze`,
        })
      }
    }
  }

  for (const p of products) {
    if (p.stato !== 'idea' && p.stato !== 'archivio' && p.prezzoVendita <= 0) {
      alerts.push({
        id: `alert-noprice-${p.id}`, modulo: 'Anagrafica', livello: 'critico',
        messaggio: `${p.nome}: nessun prezzo di vendita impostato`,
        data: TODAY.toISOString(), entitaId: p.id, link: `/prodotti/${p.id}`,
      })
    }
    const hasSheet = technicalSheets.some((ts) => ts.productId === p.id)
    if (!hasSheet && p.stato !== 'idea') {
      alerts.push({
        id: `alert-nosheet-${p.id}`, modulo: 'Anagrafica', livello: 'attenzione',
        messaggio: `${p.nome}: nessuna scheda tecnica presente`,
        data: TODAY.toISOString(), entitaId: p.id, link: `/prodotti/${p.id}`,
      })
    }
    if (p.statoPubblicazioneShopify === 'pubblicato') {
      const margin = margins.find((m) => m.productId === p.id)
      if (!margin) {
        alerts.push({
          id: `alert-shopify-cost-${p.id}`, modulo: 'Shopify', livello: 'attenzione',
          messaggio: `${p.nome}: pubblicato su Shopify senza costo prodotto completo`,
          data: TODAY.toISOString(), entitaId: p.id, link: `/prodotti/${p.id}`,
        })
      }
    }
  }

  for (const rec of inventoryRecords) {
    if (rec.divergenzaShopify) {
      const variant = productVariants.find((v) => v.id === rec.variantId)
      alerts.push({
        id: `alert-stock-div-${rec.id}`, modulo: 'Shopify', livello: 'attenzione',
        messaggio: `SKU ${variant?.sku ?? rec.variantId}: stock interno (${rec.qtaMagazzino}) diverge da Shopify (${rec.stockShopify})`,
        data: TODAY.toISOString(), entitaId: rec.variantId, link: `/inventario/prodotti-finiti`,
      })
    }
  }

  for (const r of monthlyReports) {
    alerts.push({
      id: `alert-report-${r.id}`, modulo: 'Report', livello: 'info',
      messaggio: `Report mensile ${r.mese} pronto`, data: r.generatoIl, entitaId: r.id, link: `/report`,
    })
  }

  const rank = { critico: 0, attenzione: 1, info: 2 }
  return alerts.sort((a, b) => rank[a.livello] - rank[b.livello])
}
