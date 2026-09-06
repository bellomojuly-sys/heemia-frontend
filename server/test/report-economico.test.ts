// Report economico mensile e promemoria di fine mese (spec Giulia 2026-08-13).
//
// Girano contro il Postgres di sviluppo vero: l'oggetto della verifica è che i numeri
// escano dai dati, e un doppio finto non lo dimostrerebbe. Ogni esecuzione crea i propri
// dati con un prefisso unico e li cancella alla fine.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { generateReportEconomico, mesiConMovimenti } from '../src/modules/reports/economico.js'

const prisma = new PrismaClient()
const RUN = `TEST-ECO-${Date.now().toString(36).toUpperCase()}`
/** Mese lontano dal presente: nessun altro dato del database può caderci dentro. */
const MESE = '2019-04'
const giorno = (n: number) => new Date(Date.UTC(2019, 3, n))

let customerId = ''
let supplierId = ''
const costiFissiIds: string[] = []
/**
 * I costi fissi sono **globali**, non del mese: il database di sviluppo ne ha gia' di suoi
 * (le voci d'esempio del seed). Le prove partono quindi da quel totale invece di
 * pretendere un database vuoto, che nella realta' non esiste mai.
 */
let costiFissiPreesistenti = 0

before(async () => {
  const customer = await prisma.customer.create({ data: { nome: `${RUN} cliente` } })
  customerId = customer.id
  const supplier = await prisma.supplier.create({ data: { nome: `${RUN} fornitore`, categoria: 'Tessuti' } })
  supplierId = supplier.id

  // Entrate: due canali diversi, piu' l'incasso degli scontrini.
  await prisma.order.createMany({
    data: [
      { numero: `${RUN}-SH1`, canale: 'shopify', customerId, data: giorno(3), totale: 500 },
      { numero: `${RUN}-SH2`, canale: 'shopify', customerId, data: giorno(9), totale: 250 },
      { numero: `${RUN}-FI1`, canale: 'fisico', customerId, data: giorno(11), totale: 300 },
      // Annullato: non deve entrare in nessun totale.
      { numero: `${RUN}-ANN`, canale: 'shopify', customerId, data: giorno(12), totale: 999, stato: 'annullato' },
    ],
  })
  await prisma.cashClosure.create({ data: { mese: MESE, totaleIncassato: 1200, numeroScontrini: 40 } })

  // Uscite: tre categorie, tre stati di pagamento.
  await prisma.invoice.createMany({
    data: [
      { numero: `${RUN}-F1`, data: giorno(5), fornitoreId: supplierId, imponibile: 200, iva: 44, categoriaCosto: 'tessuto', statoPagamento: 'pagata' },
      { numero: `${RUN}-F2`, data: giorno(6), fornitoreId: supplierId, imponibile: 100, iva: 22, categoriaCosto: 'tessuto', statoPagamento: 'da_pagare' },
      { numero: `${RUN}-F3`, data: giorno(7), fornitoreId: supplierId, imponibile: 150, iva: 33, categoriaCosto: 'manodopera', statoPagamento: 'scaduta' },
    ],
  })

  const gia = await prisma.fixedCostItem.findMany()
  costiFissiPreesistenti = gia.reduce((s, c) => s + Number(c.importoAnnuo), 0)

  const fissi = await Promise.all([
    prisma.fixedCostItem.create({ data: { nome: `${RUN} affitto`, importoAnnuo: 9600 } }),
    prisma.fixedCostItem.create({ data: { nome: `${RUN} commercialista`, importoAnnuo: 2400 } }),
  ])
  costiFissiIds.push(...fissi.map((f) => f.id))
})

after(async () => {
  await prisma.invoice.deleteMany({ where: { numero: { startsWith: RUN } } })
  await prisma.order.deleteMany({ where: { numero: { startsWith: RUN } } })
  await prisma.cashClosure.deleteMany({ where: { mese: MESE } })
  await prisma.fixedCostItem.deleteMany({ where: { id: { in: costiFissiIds } } })
  await prisma.supplier.deleteMany({ where: { id: supplierId } })
  await prisma.customer.deleteMany({ where: { id: customerId } })
  await prisma.$disconnect()
})

describe('Report economico mensile', () => {
  test('le entrate restano divise per canale, e l\'ordine annullato non entra', async () => {
    const r = await generateReportEconomico(MESE)
    assert.equal(r.entrate.ordiniShopify, 750, 'i due ordini shopify, non il terzo annullato')
    assert.equal(r.entrate.ordiniShowroom, 300)
    assert.equal(r.entrate.incassoScontrini, 1200)
    assert.equal(r.entrate.totale, 2250)
    assert.equal(r.entrate.scontriniRegistrati, true)
  })

  test('le uscite sono raggruppate per categoria e contano l\'imponibile, non il totale', async () => {
    const r = await generateReportEconomico(MESE)
    const tessuto = r.uscite.perCategoria.find((c) => c.categoria === 'tessuto')
    assert.equal(tessuto?.imponibile, 300)
    assert.equal(tessuto?.numeroFatture, 2)
    assert.equal(r.uscite.perCategoria.find((c) => c.categoria === 'manodopera')?.imponibile, 150)
    // Le categorie senza fatture non compaiono: un elenco di nove zeri non dice niente.
    assert.equal(r.uscite.perCategoria.length, 2)
    assert.equal(r.uscite.totaleImponibile, 450)
    // L'IVA sugli acquisti si recupera: sta a parte, non fra i costi.
    assert.equal(r.uscite.totaleIva, 99)
  })

  test('le uscite si leggono anche per stato di pagamento', async () => {
    const r = await generateReportEconomico(MESE)
    assert.equal(r.uscite.pagate, 200)
    assert.equal(r.uscite.daPagare, 100)
    assert.equal(r.uscite.scadute, 150)
    assert.equal(r.uscite.numeroFatture, 3)
  })

  test('la quota dei costi fissi è annua diviso dodici', async () => {
    const r = await generateReportEconomico(MESE)
    const atteso = costiFissiPreesistenti + 12000
    assert.equal(r.costiFissi.totaleAnnuo, atteso)
    assert.equal(r.costiFissi.quotaMensile, Math.round((atteso / 12) * 100) / 100)
  })

  test('il risultato è entrate meno uscite meno quota fissi', async () => {
    const r = await generateReportEconomico(MESE)
    const quota = Math.round(((costiFissiPreesistenti + 12000) / 12) * 100) / 100
    assert.equal(r.risultato, Math.round((2250 - 450 - quota) * 100) / 100)
  })

  test('un mese senza fatture lo dice, invece di mostrare un utile falso', async () => {
    const r = await generateReportEconomico('2019-05')
    assert.equal(r.uscite.numeroFatture, 0)
    assert.ok(
      r.avvisi.some((a) => /Nessuna fattura registrata/.test(a)),
      'il report deve avvisare che le uscite mancano',
    )
    assert.ok(r.avvisi.some((a) => /Chiusura di cassa/.test(a)))
    // Le entrate di quel mese sono zero, quindi il risultato e' la sola quota fissi in negativo:
    // il report non deve far sembrare positivo un mese di cui non sa niente.
    assert.ok(r.risultato <= 0)
  })

  test('il mese con movimenti compare fra quelli selezionabili', async () => {
    const mesi = await mesiConMovimenti()
    assert.ok(mesi.includes(MESE))
  })
})
