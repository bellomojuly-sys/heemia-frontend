// Applica le copertine e le foto dei capi da `foto_capi.csv` (Fase 21).
//
//     npm run foto:import              # SIMULAZIONE: dice cosa cambierebbe, non scrive
//     npm run foto:import -- --scrivi  # scrive davvero
//
// Gira dove gira il censimento — anche dentro Render, sulla rete interna — e **non parla con
// Google Drive**: legge un file e scrive nel database. È il motivo per cui funziona anche su
// staging, dove per policy non esiste nessuna variabile di integrazione.
//
// Sulla simulazione: qui non serve la transazione annullata di `census:import`. Là serviva a
// far emergere i conflitti sulle chiavi uniche, che si vedono solo scrivendo; qui l'unica
// operazione è aggiungere indirizzi in fondo a una lista, non può collidere con niente, e
// una lettura predice il risultato esattamente.
//
// Idempotente: le foto già collegate non si riscrivono, e l'ordine di quelle che c'erano
// prima non si tocca. Rilanciarlo dopo un import riuscito non cambia niente.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { collegaFoto } from '../src/modules/drive/collegamento.js'

const censusDir = process.env.CENSIMENTO_DIR
  ? process.env.CENSIMENTO_DIR.replace(/\/?$/, '')
  : fileURLToPath(new URL('../../../03_Technical_Specification/Censimento_Dati', import.meta.url))

type Row = Record<string, string>

/** Stesso lettore CSV degli altri import: virgolette, a capo dentro i campi, BOM. */
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
const prisma = new PrismaClient()

const righe = parseCsv(await readFile(`${censusDir}/foto_capi.csv`, 'utf8'))

// Raggruppate per capo e riordinate: la riga con `ordine` più basso è la copertina, e
// l'ordine del file è l'unica cosa che decide quale foto si vede nella galleria.
const perCodice = new Map<string, { ordine: number; url: string }[]>()
for (const [i, r] of righe.entries()) {
  const codice = r.codice_prodotto
  const url = r.immagine_url
  const ordine = Number(r.ordine)
  if (!codice || !url) throw new Error(`riga ${i + 2}: mancano codice_prodotto o immagine_url`)
  if (!Number.isFinite(ordine)) throw new Error(`riga ${i + 2}: ordine non numerico («${r.ordine}»)`)
  if (!/^https?:\/\//i.test(url)) throw new Error(`riga ${i + 2}: indirizzo non valido («${url}»)`)
  const elenco = perCodice.get(codice) ?? []
  elenco.push({ ordine, url })
  perCodice.set(codice, elenco)
}

const capi = await prisma.product.findMany({
  where: { codiceProdotto: { in: [...perCodice.keys()] } },
  select: { id: true, codiceProdotto: true, nome: true, immaginiUrl: true },
})
const perId = new Map(capi.map((c) => [c.codiceProdotto, c]))

const mancanti = [...perCodice.keys()].filter((c) => !perId.has(c))
const abbinamenti: { capoId: string; urls: string[] }[] = []
let daAggiungere = 0
let giaPresenti = 0
let copertineNuove = 0

for (const [codice, foto] of perCodice) {
  const capo = perId.get(codice)
  if (!capo) continue
  const esistenti = capo.immaginiUrl ?? []
  const ordinate = [...foto].sort((a, b) => a.ordine - b.ordine).map((f) => f.url)
  const nuove = ordinate.filter((u, i, tutte) => !esistenti.includes(u) && tutte.indexOf(u) === i)
  giaPresenti += ordinate.length - nuove.length
  if (nuove.length === 0) continue
  if (esistenti.length === 0) copertineNuove += 1
  daAggiungere += nuove.length
  abbinamenti.push({ capoId: capo.id, urls: nuove })
}

console.log(`${scrivi ? 'IMPORT' : 'SIMULAZIONE'} — ${righe.length} righe da ${censusDir}/foto_capi.csv`)
console.log(`capi nel file: ${perCodice.size} · trovati nel database: ${perCodice.size - mancanti.length}`)
console.log(`foto da aggiungere: ${daAggiungere} · già collegate: ${giaPresenti}`)
console.log(`capi che acquistano una copertina: ${copertineNuove}`)
if (mancanti.length > 0) {
  // Non è fatale ma va guardato: quasi sempre vuol dire che il censimento non è ancora
  // entrato in questo ambiente, e allora prima va quello.
  console.log(`\ncodici del file assenti dal database (${mancanti.length}): ${mancanti.join(', ')}`)
}

if (!scrivi) {
  console.log('\nniente è stato scritto. Per applicare: npm run foto:import -- --scrivi')
} else if (abbinamenti.length === 0) {
  console.log('\nniente da fare: le foto del file sono già tutte collegate.')
} else {
  const esito = await collegaFoto(abbinamenti, null)
  console.log(`\nscritte ${esito.fotoCollegate} foto su ${esito.capiAggiornati} capi`)
  const conCopertina = await prisma.product.count({ where: { NOT: { immaginiUrl: { isEmpty: true } } } })
  const totale = await prisma.product.count()
  console.log(`capi con anteprima in anagrafica: ${conCopertina} su ${totale}`)
}

await prisma.$disconnect()
