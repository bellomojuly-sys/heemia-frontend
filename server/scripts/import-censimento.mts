// Esecuzione dell'import del censimento — Fase 21.
//
//     npm run census:import            # SIMULAZIONE: mostra i numeri, non scrive niente
//     npm run census:import -- --scrivi   # scrive davvero
//
// La simulazione è il modo predefinito di proposito: la prima domanda da farsi non è «ha
// funzionato?» ma «cosa succederebbe?». Fa esattamente lo stesso lavoro dell'import vero —
// stesse letture, stesse scritture, stessi conflitti su chiavi uniche — e poi annulla tutto.
//
// L'import è idempotente: rilanciarlo con --scrivi non duplica niente. È anche il modo di
// verificarlo, ed è quello che chiede Data_Migration («provato due volte senza duplicati»).
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PrismaClient, type ProductStage } from '@prisma/client'
import { importaCensimento } from '../src/modules/migration/importCensimento.js'

// I CSV del censimento vivono nel vault, fuori dal repository: la fonte resta quella.
// CENSIMENTO_DIR serve al caso in cui l'import non parta da un Mac con il vault accanto —
// per esempio da dentro Render, dove il database è sulla rete interna e non c'è una
// connessione domestica o mobile che possa cadere a metà transazione.
const censusDir = process.env.CENSIMENTO_DIR
  ? process.env.CENSIMENTO_DIR.replace(/\/?$/, '/')
  : fileURLToPath(new URL('../../../03_Technical_Specification/Censimento_Dati/', import.meta.url))

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

const [prodottiTxt, variantiTxt, fornitoriTxt, decisioniTxt] = await Promise.all([
  readFile(`${censusDir}/products.csv`, 'utf8'),
  readFile(`${censusDir}/product_variants.csv`, 'utf8'),
  readFile(`${censusDir}/suppliers.csv`, 'utf8'),
  readFile(`${censusDir}/migration_decisions.json`, 'utf8'),
])

const decisioni = JSON.parse(decisioniTxt) as { productStageMapping?: string; excludedFromInitialInventory?: string }

// La fase iniziale la decide il censimento, non il codice: sta scritta per esteso in
// migration_decisions.json e qui si estrae il valore dell'enum. Se un giorno la decisione
// cambia, cambia quel file — non questo script.
const FASI: ProductStage[] = ['idea', 'prototipo', 'campionario', 'produzione', 'completato', 'archivio']
const faseIniziale = FASI.find((f) => (decisioni.productStageMapping ?? '').includes(f))
if (!faseIniziale) {
  throw new Error(
    'migration_decisions.json non dice in che fase entrano i capi: ' +
      `il campo productStageMapping deve contenere uno fra ${FASI.join(', ')}.`,
  )
}

const prisma = new PrismaClient()
// L'import si firma: l'activity log deve dire CHI l'ha eseguito. Si usa il primo
// amministratore attivo, che è chi ha titolo per farlo.
const admin = await prisma.user.findFirst({ where: { role: 'admin', attivo: true }, select: { id: true, email: true } })
if (!admin) throw new Error('Nessun amministratore attivo: l\'import va firmato da un utente.')

const esito = await importaCensimento(
  {
    prodotti: parseCsv(prodottiTxt) as never,
    varianti: parseCsv(variantiTxt) as never,
    fornitori: parseCsv(fornitoriTxt) as never,
    esclusiDallInventario: ['Denver', 'Moss'],
    faseIniziale,
  },
  admin.id,
  { simulazione: !scrivi },
)

const riga = (etichetta: string, valore: string | number) =>
  console.log(`  ${etichetta.padEnd(34)} ${valore}`)

console.log('')
console.log(scrivi ? '=== IMPORT ESEGUITO ===' : '=== SIMULAZIONE — nessuna scrittura mantenuta ===')
console.log(`  fase iniziale dei capi: ${faseIniziale} · firmato da ${admin.email}`)
console.log('')
riga('fornitori creati / aggiornati', `${esito.fornitori.creati} / ${esito.fornitori.aggiornati}`)
riga('capi creati / aggiornati', `${esito.prodotti.creati} / ${esito.prodotti.aggiornati}`)
riga('varianti create / aggiornate', `${esito.varianti.create} / ${esito.varianti.aggiornate}`)
riga('giacenze create / aggiornate', `${esito.giacenze.create} / ${esito.giacenze.aggiornate}`)
riga('pezzi caricati in laboratorio', esito.giacenze.pezzi)
riga('descrizioni inserite / riscritte', `${esito.descrizioni.inserite} / ${esito.descrizioni.riscritte}`)
riga('composizioni e consigli di cura', esito.curaCompilata)
if (esito.curaRimossa > 0) {
  riga('composizioni RIMOSSE (regola non valida)', esito.curaRimossa)
}
if (esito.tessutoSconosciuto.length > 0) {
  console.log(`     ${esito.tessutoSconosciuto.length} capi con un tessuto fuori tabella, senza composizione:`)
  for (const t of esito.tessutoSconosciuto) console.log(`       ${t.nome} (${t.tessuto})`)
}
if (esito.descrizioni.riscritte > 0) {
  console.log('     Attenzione: descrizioni già a database sostituite con quelle di Notion.')
}
console.log('')
riga('capi col tessuto collegato', esito.tessutiLegati)
if (esito.tessutiSenzaMagazzino.length > 0) {
  riga('capi senza tessuto a magazzino', esito.tessutiSenzaMagazzino.length)
  const perTessuto = new Map<string, number>()
  for (const t of esito.tessutiSenzaMagazzino) perTessuto.set(t.tessuto, (perTessuto.get(t.tessuto) ?? 0) + 1)
  console.log(`     ${[...perTessuto].map(([t, n]) => `${t} (${n})`).join(', ')}`)
  console.log('     Restano scoperti di proposito: in magazzino quei tessuti non ci sono.')
}
riga('capi senza costo diretto', esito.senzaCostoDiretto.length)
if (esito.senzaCostoDiretto.length > 0) {
  console.log(`     ${esito.senzaCostoDiretto.join(', ')}`)
  console.log('     Entrano lo stesso: per questi il margine non si calcola finché il costo manca.')
}
if (esito.saltate.length > 0) {
  console.log('')
  console.log(`  righe non scritte: ${esito.saltate.length}`)
  for (const s of esito.saltate.slice(0, 20)) console.log(`     ${s.riga} — ${s.motivo}`)
  if (esito.saltate.length > 20) console.log(`     …e altre ${esito.saltate.length - 20}`)
}
console.log('')
if (!scrivi) {
  console.log('  Per scrivere davvero: npm run census:import -- --scrivi')
  console.log('  Prima però: backup del database, e primo passaggio su staging.')
}
await prisma.$disconnect()
