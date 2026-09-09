// Import del listino materiali e accessori del censimento (Data_Census §10).
//
//     npm run census:materiali            # SIMULAZIONE: mostra i numeri, non scrive niente
//     npm run census:materiali -- --scrivi   # scrive davvero
//
// Stessa forma di import-censimento.mts: la simulazione è il modo predefinito, fa le stesse
// letture e le stesse scritture e poi annulla tutto. L'import è idempotente: rilanciarlo
// aggiorna prezzo e unità di misura delle righe già presenti, non ne crea di nuove.
//
// Cosa NON fa, di proposito:
//   - le quantità a magazzino restano quelle che sono. Il censimento porta il PREZZO, non i
//     metri e i pezzi: quelli si rilevano in inventario (Data_Census §5).
//   - le 4 righe `lavorazione` non entrano. Andrebbero in supplier_service_prices, che vuole
//     un fornitore, e il documento non dice da chi si comprano.
//   - non sovrascrive mai una riga il cui `codice` esiste già con un nome diverso: la segnala
//     e la lascia stare. Un codice che collide è un errore da guardare, non da risolvere a
//     colpi di UPDATE.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PrismaClient, type MaterialUnita, type AccessoryUnita } from '@prisma/client'

// Come in import-censimento.mts: senza CENSIMENTO_DIR si legge il vault, che resta la
// fonte. La variabile serve quando l'import non parte da un Mac con il vault accanto.
const censusDir = process.env.CENSIMENTO_DIR
  ? process.env.CENSIMENTO_DIR.replace(/\/?$/, '')
  : fileURLToPath(new URL('../../../03_Technical_Specification/Censimento_Dati', import.meta.url))

type Row = Record<string, string>

/** Stesso lettore CSV del preflight: virgolette, a capo dentro i campi, BOM. */
function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1 } else { quoted = !quoted }
    } else if (char === ',' && !quoted) {
      row.push(field); field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []; field = ''
    } else {
      field += char
    }
  }
  if (quoted) throw new Error('CSV non valido: virgolette non chiuse')
  if (field || row.length) {
    row.push(field)
    if (row.some((v) => v.trim() !== '')) rows.push(row)
  }
  const headers = rows.shift()?.map((v) => v.trim().replace(/^﻿/, '')) ?? []
  return rows.map((values, i) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV non valido alla riga ${i + 2}: ${values.length} colonne invece di ${headers.length}`)
    }
    return Object.fromEntries(headers.map((h, c) => [h, values[c].trim()]))
  })
}

const scrivi = process.argv.includes('--scrivi')
const righe = parseCsv(await readFile(`${censusDir}/materiali_lavorazioni.csv`, 'utf8'))

const prisma = new PrismaClient()

/** Segnale interno per far annullare la transazione alla fine di una simulazione. */
class Simulazione extends Error {}

const esito = {
  materialiCreati: 0,
  materialiAggiornati: 0,
  accessoriCreati: 0,
  accessoriAggiornati: 0,
  lavorazioniIgnorate: [] as string[],
  conflitti: [] as string[],
}

try {
  await prisma.$transaction(async (tx) => {
    for (const r of righe) {
      const codice = r.codice
      const nome = r.nome
      const prezzo = Number(r.costo_unitario)
      if (!Number.isFinite(prezzo)) throw new Error(`Costo non numerico per ${codice} (${nome}): "${r.costo_unitario}"`)

      if (r.destinazione === 'lavorazione') {
        esito.lavorazioniIgnorate.push(`${nome} — €${prezzo.toFixed(2)}/${r.unita_app}`)
        continue
      }

      if (r.destinazione === 'materiale') {
        const esistente = await tx.material.findUnique({ where: { codice } })
        if (esistente && esistente.nome !== nome) {
          esito.conflitti.push(`${codice} e' gia' di "${esistente.nome}", il censimento lo vuole per "${nome}"`)
          continue
        }
        const dati = { prezzoAlMetro: prezzo, unitaMisura: r.unita_app as MaterialUnita }
        if (esistente) {
          await tx.material.update({ where: { codice }, data: dati })
          esito.materialiAggiornati += 1
        } else {
          await tx.material.create({ data: { codice, nome, ...dati } })
          esito.materialiCreati += 1
        }
        continue
      }

      if (r.destinazione === 'accessorio') {
        const esistente = await tx.accessory.findUnique({ where: { codice } })
        if (esistente && esistente.nome !== nome) {
          esito.conflitti.push(`${codice} e' gia' di "${esistente.nome}", il censimento lo vuole per "${nome}"`)
          continue
        }
        const dati = {
          costoUnitario: prezzo,
          unitaMisura: r.unita_app as AccessoryUnita,
          categoria: r.categoria || null,
        }
        if (esistente) {
          await tx.accessory.update({ where: { codice }, data: dati })
          esito.accessoriAggiornati += 1
        } else {
          await tx.accessory.create({ data: { codice, nome, ...dati } })
          esito.accessoriCreati += 1
        }
        continue
      }

      throw new Error(`Destinazione sconosciuta per ${codice} (${nome}): "${r.destinazione}"`)
    }

    if (!scrivi) throw new Simulazione()
  })
} catch (errore) {
  if (!(errore instanceof Simulazione)) throw errore
} finally {
  await prisma.$disconnect()
}

console.log()
console.log(scrivi ? '=== SCRITTO ===' : '=== SIMULAZIONE — nessuna scrittura mantenuta ===')
console.log(`  materiali creati / aggiornati      ${esito.materialiCreati} / ${esito.materialiAggiornati}`)
console.log(`  accessori creati / aggiornati      ${esito.accessoriCreati} / ${esito.accessoriAggiornati}`)
console.log(`  lavorazioni non importate          ${esito.lavorazioniIgnorate.length}`)
for (const l of esito.lavorazioniIgnorate) console.log(`     ${l}`)
if (esito.lavorazioniIgnorate.length) {
  console.log('     Servono in supplier_service_prices, che vuole un fornitore: il documento non lo dice.')
}
if (esito.conflitti.length) {
  console.log(`  codici in conflitto, non toccati   ${esito.conflitti.length}`)
  for (const c of esito.conflitti) console.log(`     ${c}`)
}
console.log()
if (!scrivi) console.log('  Per scrivere davvero: npm run census:materiali -- --scrivi')
