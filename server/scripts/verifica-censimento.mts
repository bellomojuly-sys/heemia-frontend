// Confronto fra i CSV del censimento e quello che c'è davvero a database — Fase 21.
//
//     npm run census:verifica
//     DATABASE_URL='<produzione>' npm run census:verifica
//
// Serve **dopo** l'import (`census:import -- --scrivi`) e risponde a una domanda sola:
// quello che sta a database corrisponde a quello che doveva entrare? È il «confronto
// conteggi CSV ↔ DB» che Data_Migration chiede al punto 4, e non lo si può fare a occhio
// su 828 righe.
//
// Non scrive niente, mai. Esce con codice 1 se qualcosa non torna, così si accorge anche
// chi lo lancia dentro uno script.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { tessutoConosciuto } from '../src/core/tessuti.js'

const censusDir = fileURLToPath(
  new URL('../../../03_Technical_Specification/Censimento_Dati/', import.meta.url),
)

type Row = Record<string, string>

function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1 } else { quoted = !quoted }
    } else if (c === ',' && !quoted) {
      row.push(field); field = ''
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []; field = ''
    } else {
      field += c
    }
  }
  if (field || row.length) {
    row.push(field)
    if (row.some((v) => v.trim() !== '')) rows.push(row)
  }
  const headers = rows.shift()?.map((v) => v.trim().replace(/^﻿/, '')) ?? []
  return rows.map((values) => Object.fromEntries(headers.map((h, c) => [h, (values[c] ?? '').trim()])))
}

const ESCLUSI = new Set(['Denver', 'Moss'])

const [prodottiTxt, variantiTxt, fornitoriTxt] = await Promise.all([
  readFile(`${censusDir}/products.csv`, 'utf8'),
  readFile(`${censusDir}/product_variants.csv`, 'utf8'),
  readFile(`${censusDir}/suppliers.csv`, 'utf8'),
])

const prodotti = parseCsv(prodottiTxt)
const varianti = parseCsv(variantiTxt)
const fornitori = parseCsv(fornitoriTxt)
const pezziAttesi = varianti.reduce((s, v) => s + (Number(v.stock_disponibile) || 0), 0)

const prisma = new PrismaClient()
const codici = prodotti.map((p) => p.codice_prodotto)
const sku = varianti.map((v) => v.sku)

const conDescrizione = prodotti.filter((p) => (p.descrizione_breve ?? '').trim()).length
// I capi il cui tessuto sta nella tabella approvata: solo quelli devono avere composizione
// e consigli di cura. I foderati restano vuoti di proposito (DEC-064).
const conTessutoNoto = prodotti.filter((p) => tessutoConosciuto(p.tessuto)).length

const [capiDb, variantiDb, giacenzeDb, fornitoriDb, pezziLab, pezziMag, daConfermare, fuoriFase,
       descrizioniDb, composizioniDb, curaApprovataDb] =
  await Promise.all([
    prisma.product.count({ where: { codiceProdotto: { in: codici } } }),
    prisma.productVariant.count({ where: { sku: { in: sku } } }),
    prisma.inventoryRecord.count({ where: { variant: { sku: { in: sku } } } }),
    prisma.supplier.count(),
    prisma.inventoryRecord.aggregate({ _sum: { qtaLaboratorio: true }, where: { variant: { sku: { in: sku } } } }),
    prisma.inventoryRecord.aggregate({ _sum: { qtaMagazzino: true }, where: { variant: { sku: { in: sku } } } }),
    prisma.inventoryRecord.count({ where: { variant: { sku: { in: sku } }, migrazioneCompletata: false } }),
    prisma.product.count({ where: { codiceProdotto: { in: codici }, stato: { not: 'in_vendita' } } }),
    prisma.product.count({ where: { codiceProdotto: { in: codici }, descrizioneBreve: { not: null } } }),
    prisma.product.count({ where: { codiceProdotto: { in: codici }, composizione: { not: null } } }),
    prisma.product.count({ where: { codiceProdotto: { in: codici }, consigliCuraStato: 'approvata' } }),
  ])

const doppiCodice = await prisma.$queryRaw<unknown[]>`SELECT codice_prodotto FROM products GROUP BY 1 HAVING count(*) > 1`
const doppiSku = await prisma.$queryRaw<unknown[]>`SELECT sku FROM product_variants GROUP BY 1 HAVING count(*) > 1`

interface Controllo { cosa: string; atteso: number | string; trovato: number | string }

const controlli: Controllo[] = [
  { cosa: 'capi del censimento', atteso: prodotti.length, trovato: capiDb },
  { cosa: 'varianti', atteso: varianti.length, trovato: variantiDb },
  { cosa: 'giacenze create', atteso: varianti.length, trovato: giacenzeDb },
  { cosa: 'pezzi in laboratorio', atteso: pezziAttesi, trovato: pezziLab._sum.qtaLaboratorio ?? 0 },
  // Regola 2 di Data_Migration: il magazzino parte da zero, la divisione la fanno le persone.
  { cosa: 'pezzi in magazzino (deve essere 0)', atteso: 0, trovato: pezziMag._sum.qtaMagazzino ?? 0 },
  { cosa: 'distribuzioni da confermare', atteso: varianti.length, trovato: daConfermare },
  { cosa: 'capi fuori dalla fase Vendita', atteso: 0, trovato: fuoriFase },
  { cosa: 'descrizioni sui capi', atteso: conDescrizione, trovato: descrizioniDb },
  { cosa: 'composizioni ricavate dal tessuto', atteso: conTessutoNoto, trovato: composizioniDb },
  { cosa: 'consigli di cura approvati', atteso: conTessutoNoto, trovato: curaApprovataDb },
  { cosa: 'codici prodotto duplicati', atteso: 0, trovato: doppiCodice.length },
  { cosa: 'SKU duplicati', atteso: 0, trovato: doppiSku.length },
  { cosa: 'fornitori in anagrafica (almeno)', atteso: `≥ ${fornitori.length}`, trovato: fornitoriDb },
]

console.log('')
console.log('=== CENSIMENTO: CSV a confronto con il database ===')
console.log('')
let problemi = 0
for (const c of controlli) {
  const ok =
    typeof c.atteso === 'string'
      ? Number(c.trovato) >= fornitori.length
      : c.atteso === c.trovato
  if (!ok) problemi += 1
  console.log(`  ${ok ? '✓' : '✗'}  ${c.cosa.padEnd(36)} atteso ${String(c.atteso).padStart(6)}   trovato ${String(c.trovato).padStart(6)}`)
}

// I capi esclusi per decisione non devono avere giacenze: si controlla, non si dà per buono.
const conGiacenza = await prisma.product.count({
  where: { nome: { in: [...ESCLUSI] }, variants: { some: { inventory: { isNot: null } } } },
})
const okEsclusi = conGiacenza === 0
if (!okEsclusi) problemi += 1
console.log(`  ${okEsclusi ? '✓' : '✗'}  ${'Denver e Moss senza giacenze'.padEnd(36)} atteso      0   trovato ${String(conGiacenza).padStart(6)}`)

console.log('')
if (problemi === 0) {
  console.log('  Tutto corrisponde: il censimento è dentro come doveva.')
} else {
  console.log(`  ${problemi} controlli non tornano. NON considerare la migrazione conclusa.`)
  process.exitCode = 1
}
console.log('')
await prisma.$disconnect()
