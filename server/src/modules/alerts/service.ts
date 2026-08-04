// FR-27 — alert derivati dai dati. Porting server-side di src/lib/alerts.ts (computeAlerts).
// Differenze volute rispetto al prototipo:
//   - la data di riferimento è quella reale, non la TODAY fissa del 14/07/2026;
//   - il filtro per ruolo (canSeeAlertModulo) è applicato dal server, non dal client.
import type { Role } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { canSeeAlertModulo, type AlertModulo } from '../../core/permissions.js'
import { daysFromToday, mesePrecedente, meseLabel } from '../../core/dates.js'
import { computeAllMargins } from '../margins/service.js'

export interface AlertItem {
  id: string
  modulo: AlertModulo
  livello: 'critico' | 'attenzione' | 'info'
  messaggio: string
  data: string
  entitaId?: string
  link?: string
}

export async function computeAlerts(role: Role): Promise<AlertItem[]> {
  const [products, materials, accessories, invoices, inventoryRecords, orders, cashClosures, margins, sogliaSetting] =
    await Promise.all([
      prisma.product.findMany({ include: { technicalSheets: true } }),
      prisma.material.findMany(),
      prisma.accessory.findMany(),
      prisma.invoice.findMany(),
      prisma.inventoryRecord.findMany({ include: { variant: true } }),
      prisma.order.findMany(),
      prisma.cashClosure.findMany(),
      computeAllMargins(),
      prisma.appSetting.findUnique({ where: { chiave: 'soglia_margine_percent' } }),
    ])

  const thresholdPercent = Number(sogliaSetting?.valore ?? 35)
  const now = new Date().toISOString()
  const alerts: AlertItem[] = []

  // FR-41: promemoria chiusura di cassa del mese precedente.
  const mesePrec = mesePrecedente()
  if (!cashClosures.some((c) => c.mese === mesePrec)) {
    alerts.push({
      id: `alert-chiusura-${mesePrec}`, modulo: 'Fatture', livello: 'attenzione',
      messaggio: `Chiusura di cassa di ${meseLabel(mesePrec)} non ancora registrata: carica l'export scontrini da Billy`,
      data: now, entitaId: mesePrec, link: '/fatture',
    })
  }

  // FR-29: ordine su misura dallo showroom da prendere in carico.
  for (const o of orders) {
    if (o.numero.startsWith('SM-') && o.stato === 'in_lavorazione') {
      alerts.push({
        id: `alert-sumisura-${o.id}`, modulo: 'Ordini', livello: 'attenzione',
        messaggio: `Nuovo ordine su misura ${o.numero} dallo showroom: da prendere in carico`,
        data: o.data.toISOString(), entitaId: o.id, link: '/ordini',
      })
    }
  }

  const productById = new Map(products.map((p) => [p.id, p]))

  for (const m of margins) {
    if (m.sottoSoglia) {
      alerts.push({
        id: `alert-margin-${m.productId}`, modulo: 'Margini', livello: 'critico',
        messaggio: `${productById.get(m.productId)?.nome ?? m.productId}: margine ${m.marginePercentuale.toFixed(1)}% sotto soglia (${thresholdPercent}%)`,
        data: now, entitaId: m.productId, link: `/prodotti/${m.productId}`,
      })
    }
    if (m.prezzoNettoIva <= m.breakEvenPrice) {
      alerts.push({
        id: `alert-breakeven-${m.productId}`, modulo: 'Margini', livello: 'critico',
        messaggio: `${productById.get(m.productId)?.nome ?? m.productId}: prezzo di vendita sotto break-even`,
        data: now, entitaId: m.productId, link: `/prodotti/${m.productId}`,
      })
    }
  }

  for (const mat of materials) {
    if (mat.stato === 'sotto_soglia' || mat.stato === 'esaurito') {
      alerts.push({
        id: `alert-mat-${mat.id}`, modulo: 'Inventario tessuti',
        livello: mat.stato === 'esaurito' ? 'critico' : 'attenzione',
        messaggio: `${mat.nome}: ${mat.stato === 'esaurito' ? 'scorta esaurita' : 'scorta sotto soglia minima'}`,
        data: now, entitaId: mat.id, link: '/inventario/tessuti',
      })
    }
  }

  for (const acc of accessories) {
    if (acc.stato === 'sotto_soglia' || acc.stato === 'esaurito') {
      alerts.push({
        id: `alert-acc-${acc.id}`, modulo: 'Inventario accessori',
        livello: acc.stato === 'esaurito' ? 'critico' : 'attenzione',
        messaggio: `${acc.nome}: ${acc.stato === 'esaurito' ? 'scorta esaurita' : 'scorta sotto soglia minima'}`,
        data: now, entitaId: acc.id, link: '/inventario/accessori',
      })
    }
  }

  for (const inv of invoices) {
    if (!inv.associata) {
      alerts.push({
        id: `alert-inv-assoc-${inv.id}`, modulo: 'Fatture', livello: 'attenzione',
        messaggio: `Fattura ${inv.numero} caricata ma non associata a prodotti o materiali`,
        data: now, entitaId: inv.id, link: '/fatture',
      })
    }
    const giorni = inv.dataScadenza ? daysFromToday(inv.dataScadenza) : null
    const scaduta = inv.statoPagamento === 'scaduta' || (inv.statoPagamento === 'da_pagare' && giorni !== null && giorni < 0)
    if (scaduta) {
      alerts.push({
        id: `alert-inv-scaduta-${inv.id}`, modulo: 'Scadenze', livello: 'critico',
        messaggio: `Fattura ${inv.numero} scaduta e non pagata`,
        data: now, entitaId: inv.id, link: '/scadenze',
      })
    } else if (giorni !== null && inv.statoPagamento !== 'pagata') {
      if (giorni >= 0 && giorni <= 7) {
        alerts.push({
          id: `alert-inv-7-${inv.id}`, modulo: 'Scadenze', livello: 'attenzione',
          messaggio: `Fattura ${inv.numero} in scadenza tra ${giorni} giorni`,
          data: now, entitaId: inv.id, link: '/scadenze',
        })
      } else if (giorni > 7 && giorni <= 30) {
        alerts.push({
          id: `alert-inv-30-${inv.id}`, modulo: 'Scadenze', livello: 'info',
          messaggio: `Fattura ${inv.numero} in scadenza tra ${giorni} giorni`,
          data: now, entitaId: inv.id, link: '/scadenze',
        })
      }
    }
  }

  for (const p of products) {
    if (p.stato !== 'idea' && p.stato !== 'archivio' && Number(p.prezzoVendita) <= 0) {
      alerts.push({
        id: `alert-noprice-${p.id}`, modulo: 'Anagrafica', livello: 'critico',
        messaggio: `${p.nome}: nessun prezzo di vendita impostato`,
        data: now, entitaId: p.id, link: `/prodotti/${p.id}`,
      })
    }
    const sheets = p.technicalSheets
    if (sheets.length === 0 && p.stato !== 'idea') {
      alerts.push({
        id: `alert-nosheet-${p.id}`, modulo: 'Anagrafica', livello: 'attenzione',
        messaggio: `${p.nome}: nessuna scheda tecnica presente`,
        data: now, entitaId: p.id, link: `/prodotti/${p.id}`,
      })
    }
    // FR-27 "Costo prodotto incompleto": scheda presente ma con costi chiave a zero.
    const sheet = sheets.find((s) => s.versione === 'finale') ?? sheets[sheets.length - 1]
    if (
      sheet && p.stato !== 'idea' && p.stato !== 'archivio' &&
      (Number(sheet.costoTessuto) <= 0 || Number(sheet.costoManodopera) <= 0)
    ) {
      alerts.push({
        id: `alert-incompletecost-${p.id}`, modulo: 'Costi', livello: 'attenzione',
        messaggio: `${p.nome}: costo prodotto incompleto nella scheda tecnica (tessuto o manodopera a zero)`,
        data: now, entitaId: p.id, link: `/prodotti/${p.id}`,
      })
    }
    if (p.statoPubblicazioneShopify === 'pubblicato' && !sheet) {
      alerts.push({
        id: `alert-shopify-cost-${p.id}`, modulo: 'Shopify', livello: 'attenzione',
        messaggio: `${p.nome}: pubblicato su Shopify senza costo prodotto completo`,
        data: now, entitaId: p.id, link: `/prodotti/${p.id}`,
      })
    }
  }

  for (const rec of inventoryRecords) {
    if (rec.divergenzaShopify) {
      alerts.push({
        id: `alert-stock-div-${rec.id}`, modulo: 'Shopify', livello: 'attenzione',
        messaggio: `SKU ${rec.variant?.sku ?? rec.variantId}: stock interno (${rec.qtaMagazzino}) diverge da Shopify (${rec.stockShopify})`,
        data: now, entitaId: rec.variantId, link: '/inventario/prodotti-finiti',
      })
    }
  }

  const rank = { critico: 0, attenzione: 1, info: 2 }
  return alerts
    .filter((a) => canSeeAlertModulo(role, a.modulo))
    .sort((a, b) => rank[a.livello] - rank[b.livello])
}
