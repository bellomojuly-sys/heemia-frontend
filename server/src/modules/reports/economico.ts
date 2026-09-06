// Report economico mensile (spec di Giulia, 2026-08-13).
//
// Risponde a tre domande, e solo a quelle: **quanto è entrato** quel mese, **quanto è
// uscito** e **in che cosa** è uscito, più la quota dei costi fissi. È diverso dal report
// di `service.ts`, che parla di margini per capo: quello guarda i prodotti, questo guarda
// la cassa. Tenerli separati evita il documento che risponde a metà a due domande.
//
// Nota sulle fatture: nell'app non servono a fini fiscali — quelle stanno dai
// commercialisti — ma **solo** ad alimentare questo report. È il motivo per cui il
// promemoria di fine mese (alerts/service.ts) chiede di caricare lo ZIP: senza fatture,
// la colonna delle uscite di quel mese è vuota e il risultato è falso per eccesso.
import { CategoriaCosto } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { meseLabel } from '../../core/dates.js'

const r2 = (n: number) => Math.round(n * 100) / 100

/** Etichette leggibili delle categorie di costo, nell'ordine in cui hanno senso a schermo. */
const CATEGORIE: { chiave: CategoriaCosto; etichetta: string }[] = [
  { chiave: 'tessuto', etichetta: 'Tessuti' },
  { chiave: 'accessori', etichetta: 'Accessori' },
  { chiave: 'manodopera', etichetta: 'Manodopera e lavorazioni' },
  { chiave: 'packaging', etichetta: 'Packaging' },
  { chiave: 'spedizione', etichetta: 'Spedizioni' },
  { chiave: 'logistica', etichetta: 'Logistica' },
  { chiave: 'marketing', etichetta: 'Marketing' },
  { chiave: 'servizi', etichetta: 'Servizi' },
  { chiave: 'costi_generali', etichetta: 'Costi generali' },
]

export interface VoceCategoria {
  categoria: CategoriaCosto
  etichetta: string
  imponibile: number
  numeroFatture: number
}

export interface ReportEconomico {
  mese: string
  meseLabel: string
  generatoIl: string
  entrate: {
    ordiniShopify: number
    ordiniShowroom: number
    incassoScontrini: number
    /** Falso quando la chiusura di cassa del mese non è ancora stata caricata. */
    scontriniRegistrati: boolean
    totale: number
  }
  uscite: {
    perCategoria: VoceCategoria[]
    totaleImponibile: number
    totaleIva: number
    pagate: number
    daPagare: number
    scadute: number
    numeroFatture: number
  }
  costiFissi: {
    totaleAnnuo: number
    quotaMensile: number
    voci: { nome: string; importoAnnuo: number }[]
  }
  /** Entrate − uscite (imponibile) − quota mensile dei costi fissi. */
  risultato: number
  /**
   * Cosa manca perché il mese sia raccontato per intero. Il report li mostra in cima:
   * un numero incompleto va letto sapendo che è incompleto, non scoperto dopo.
   */
  avvisi: string[]
}

/** Estremi del mese "YYYY-MM" come intervallo [inizio, inizio del mese successivo). */
function meseRange(mese: string): { from: Date; to: Date } {
  const [anno, m] = mese.split('-').map(Number)
  return { from: new Date(Date.UTC(anno, m - 1, 1)), to: new Date(Date.UTC(anno, m, 1)) }
}

export async function generateReportEconomico(mese: string): Promise<ReportEconomico> {
  const { from, to } = meseRange(mese)

  const [orders, invoices, chiusura, costiFissi] = await Promise.all([
    prisma.order.findMany({
      where: { data: { gte: from, lt: to }, stato: { not: 'annullato' } },
      select: { canale: true, totale: true },
    }),
    prisma.invoice.findMany({
      where: { data: { gte: from, lt: to } },
      select: { imponibile: true, iva: true, categoriaCosto: true, statoPagamento: true },
    }),
    prisma.cashClosure.findUnique({ where: { mese } }),
    prisma.fixedCostItem.findMany({ orderBy: { importoAnnuo: 'desc' } }),
  ])

  // --- Entrate -------------------------------------------------------------------------
  // Tre voci separate e non fuse: sono tre canali diversi, e sommarli in silenzio
  // nasconderebbe l'unico caso che può falsare il totale — una vendita di showroom
  // registrata sia come ordine sia come scontrino Billy. Il totale c'è, ma le tre righe
  // restano leggibili sopra di esso.
  const ordiniShopify = r2(orders.filter((o) => o.canale === 'shopify').reduce((s, o) => s + Number(o.totale), 0))
  const ordiniShowroom = r2(orders.filter((o) => o.canale === 'fisico').reduce((s, o) => s + Number(o.totale), 0))
  const incassoScontrini = r2(Number(chiusura?.totaleIncassato ?? 0))
  const totaleEntrate = r2(ordiniShopify + ordiniShowroom + incassoScontrini)

  // --- Uscite --------------------------------------------------------------------------
  // Si conta l'**imponibile**, non il totale: l'IVA sugli acquisti si recupera, non è un
  // costo dell'azienda. Viene comunque riportata a parte, perché è denaro che esce dal
  // conto corrente nel mese anche se poi rientra.
  const perCategoria: VoceCategoria[] = CATEGORIE.map(({ chiave, etichetta }) => {
    const righe = invoices.filter((i) => i.categoriaCosto === chiave)
    return {
      categoria: chiave,
      etichetta,
      imponibile: r2(righe.reduce((s, i) => s + Number(i.imponibile), 0)),
      numeroFatture: righe.length,
    }
  }).filter((v) => v.numeroFatture > 0)

  const sommaSe = (predicato: (i: (typeof invoices)[number]) => boolean) =>
    r2(invoices.filter(predicato).reduce((s, i) => s + Number(i.imponibile), 0))

  const uscite = {
    perCategoria,
    totaleImponibile: r2(invoices.reduce((s, i) => s + Number(i.imponibile), 0)),
    totaleIva: r2(invoices.reduce((s, i) => s + Number(i.iva), 0)),
    pagate: sommaSe((i) => i.statoPagamento === 'pagata'),
    daPagare: sommaSe((i) => i.statoPagamento === 'da_pagare'),
    scadute: sommaSe((i) => i.statoPagamento === 'scaduta'),
    numeroFatture: invoices.length,
  }

  // --- Costi fissi ---------------------------------------------------------------------
  // La quota è annua diviso dodici: i costi fissi non seguono il ritmo delle fatture, e
  // spalmarli è l'unico modo di confrontare un mese con l'altro.
  const totaleAnnuo = r2(costiFissi.reduce((s, c) => s + Number(c.importoAnnuo), 0))
  const quotaMensile = r2(totaleAnnuo / 12)

  // --- Avvisi --------------------------------------------------------------------------
  const avvisi: string[] = []
  if (uscite.numeroFatture === 0) {
    avvisi.push(
      `Nessuna fattura registrata per ${meseLabel(mese)}: la colonna delle uscite è vuota e il risultato è più alto del vero. Carica lo ZIP delle fatture del mese.`,
    )
  }
  if (!chiusura) {
    avvisi.push(
      `Chiusura di cassa di ${meseLabel(mese)} non ancora caricata: l'incasso degli scontrini non è compreso nelle entrate.`,
    )
  }
  if (costiFissi.length === 0) {
    avvisi.push(
      'Nessuna voce di costo fisso inserita: la quota mensile è zero. Si inseriscono da Costi e margini.',
    )
  }

  return {
    mese,
    meseLabel: meseLabel(mese),
    generatoIl: new Date().toISOString(),
    entrate: {
      ordiniShopify,
      ordiniShowroom,
      incassoScontrini,
      scontriniRegistrati: chiusura !== null,
      totale: totaleEntrate,
    },
    uscite,
    costiFissi: {
      totaleAnnuo,
      quotaMensile,
      voci: costiFissi.map((c) => ({ nome: c.nome, importoAnnuo: r2(Number(c.importoAnnuo)) })),
    },
    risultato: r2(totaleEntrate - uscite.totaleImponibile - quotaMensile),
    avvisi,
  }
}

/** I mesi per cui ha senso chiedere il report: quelli con ordini, fatture o scontrini. */
export async function mesiConMovimenti(limit = 24): Promise<string[]> {
  const [orders, invoices, chiusure] = await Promise.all([
    prisma.order.findMany({ select: { data: true } }),
    prisma.invoice.findMany({ select: { data: true } }),
    prisma.cashClosure.findMany({ select: { mese: true } }),
  ])
  const mesi = new Set<string>(chiusure.map((c) => c.mese))
  for (const d of [...orders, ...invoices]) {
    mesi.add(`${d.data.getUTCFullYear()}-${String(d.data.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return [...mesi].sort().reverse().slice(0, limit)
}
