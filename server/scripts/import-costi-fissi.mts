// Import dei costi fissi annui dal censimento (2026-09-07).
//
// Legge `03_Technical_Specification/Censimento_Dati/costi_fissi.csv` — le 16 voci del
// documento *Heemia_Reset_Business_Costi_Fissi_v1* più le due attrezzature spostate qui
// per decisione di Giulia — e le porta in `fixed_cost_items`, la tabella da cui l'app
// calcola la quota per capo (`SUM(importo_annuo) / capi_prodotti_annui`, DEC-022).
//
// Le regole sono le stesse dell'importatore del censimento, e per lo stesso motivo:
//
//   1. **Idempotente, sul nome.** Una voce si riconosce dal nome, che è unico in tabella.
//      Rilanciare aggiorna importo e nota, non duplica: è così che si verifica se è
//      andato bene — si rilancia e i numeri non cambiano.
//   2. **Si prova a vuoto.** Senza `--scrivi` non tocca niente e stampa cosa farebbe.
//   3. **O tutto o niente.** Una sola transazione: se una riga fallisce, il database resta
//      esattamente com'era.
//   4. **Non cancella ciò che non conosce.** Le voci già in tabella e assenti dal CSV
//      vengono *segnalate*, non rimosse. Per toglierle serve dirlo: `--sostituisci`.
//      È il caso delle tre voci d'esempio del seed, che in sviluppo gonfierebbero il
//      totale (e quindi tutti i margini) senza che si veda perché.
//
// Uso:
//   npm run costi-fissi:import              prova a vuoto
//   npm run costi-fissi:import -- --scrivi  scrive
//   npm run costi-fissi:import -- --scrivi --sostituisci   scrive e rimuove le estranee
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Prisma, PrismaClient } from '@prisma/client'

const scrivi = process.argv.includes('--scrivi')
const sostituisci = process.argv.includes('--sostituisci')

const qui = dirname(fileURLToPath(import.meta.url))
const csvPath =
  process.argv.find((a) => a.endsWith('.csv')) ??
  resolve(qui, '../../../03_Technical_Specification/Censimento_Dati/costi_fissi.csv')

/** CSV minimale con virgolette: le note del file ne contengono, e contengono virgole. */
function parseCsv(testo: string): Record<string, string>[] {
  const righe: string[][] = []
  let campo = ''
  let riga: string[] = []
  let inVirgolette = false
  for (let i = 0; i < testo.length; i += 1) {
    const c = testo[i]
    if (inVirgolette) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i += 1 }
      else if (c === '"') inVirgolette = false
      else campo += c
      continue
    }
    if (c === '"') { inVirgolette = true; continue }
    if (c === ',') { riga.push(campo); campo = ''; continue }
    if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; continue }
    if (c === '\r') continue
    campo += c
  }
  if (campo !== '' || riga.length > 0) { riga.push(campo); righe.push(riga) }

  const [intestazione, ...corpo] = righe.filter((r) => r.some((c) => c.trim() !== ''))
  return corpo.map((r) => Object.fromEntries(intestazione.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

const euro = (n: number) => `€${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const testo = await readFile(csvPath, 'utf8')
const righe = parseCsv(testo)
if (righe.length === 0) throw new Error(`Nessuna riga leggibile in ${csvPath}`)

/**
 * Importo da CSV. Il file del censimento scrive `14400.00`, ma un documento riesportato
 * da un foglio italiano scrive `14.400,00`: leggere il punto sempre come separatore di
 * migliaia moltiplicherebbe per cento ogni cifra: un errore che non si vede a occhio nel
 * totale ma sposta tutti i margini. La regola: **l'ultimo separatore è quello decimale**.
 */
function importoDaCsv(grezzo: string): number {
  const t = grezzo.trim()
  if (!t) return NaN
  const ultimoPunto = t.lastIndexOf('.')
  const ultimaVirgola = t.lastIndexOf(',')
  if (ultimoPunto === -1 && ultimaVirgola === -1) return Number(t)
  const decimale = ultimoPunto > ultimaVirgola ? '.' : ','
  const migliaia = decimale === '.' ? ',' : '.'
  return Number(t.split(migliaia).join('').replace(decimale, '.'))
}

const voci = righe.map((r, i) => {
  const nome = (r.nome ?? '').trim()
  const importo = importoDaCsv(r.importo_annuo ?? '')
  if (!nome) throw new Error(`Riga ${i + 2}: manca il nome della voce.`)
  if (!Number.isFinite(importo) || importo < 0) {
    throw new Error(`Riga ${i + 2} («${nome}»): importo annuo non leggibile («${r.importo_annuo}»).`)
  }
  return { nome, importoAnnuo: importo, nota: (r.note ?? '').trim() || null }
})

const nomi = voci.map((v) => v.nome)
const doppioni = nomi.filter((n, i) => nomi.indexOf(n) !== i)
if (doppioni.length > 0) {
  throw new Error(`Il file contiene voci con lo stesso nome: ${[...new Set(doppioni)].join(', ')}.`)
}

const totale = voci.reduce((s, v) => s + v.importoAnnuo, 0)

const prisma = new PrismaClient()
// L'import si firma: l'activity log deve dire chi l'ha eseguito.
const admin = await prisma.user.findFirst({ where: { role: 'admin', attivo: true }, select: { id: true, email: true } })
if (!admin) throw new Error("Nessun amministratore attivo: l'import va firmato da un utente.")

const presenti = await prisma.fixedCostItem.findMany()
const perNome = new Map(presenti.map((v) => [v.nome, v]))
const estranee = presenti.filter((v) => !nomi.includes(v.nome))

const creare = voci.filter((v) => !perNome.has(v.nome))
const aggiornare = voci.filter((v) => {
  const p = perNome.get(v.nome)
  return p && (Number(p.importoAnnuo) !== v.importoAnnuo || (p.nota ?? null) !== v.nota)
})
const invariate = voci.length - creare.length - aggiornare.length

console.log(`\nCosti fissi — ${csvPath}`)
console.log(`  voci nel file        ${voci.length}`)
console.log(`  totale annuo         ${euro(totale)}`)
console.log(`  da creare            ${creare.length}${creare.length ? `  (${creare.map((v) => v.nome).join(', ')})` : ''}`)
console.log(`  da aggiornare        ${aggiornare.length}${aggiornare.length ? `  (${aggiornare.map((v) => v.nome).join(', ')})` : ''}`)
console.log(`  già identiche        ${invariate}`)

if (estranee.length > 0) {
  console.log(`\n  ⚠ ${estranee.length} voci già in tabella non sono nel file:`)
  for (const e of estranee) console.log(`      ${e.nome.padEnd(30)} ${euro(Number(e.importoAnnuo))}`)
  console.log(
    sostituisci
      ? '    → --sostituisci indicato: verranno rimosse.'
      : '    → restano dove sono e continuano a pesare sulla quota per capo.\n' +
        '      Se sono dati di esempio del seed, rilancia con --sostituisci.',
  )
}

if (!scrivi) {
  console.log('\nProva a vuoto: nessuna scrittura. Rilancia con --scrivi per applicare.\n')
  await prisma.$disconnect()
  process.exit(0)
}

await prisma.$transaction(async (tx) => {
  for (const v of voci) {
    await tx.fixedCostItem.upsert({
      where: { nome: v.nome },
      update: { importoAnnuo: new Prisma.Decimal(v.importoAnnuo), nota: v.nota },
      create: { nome: v.nome, importoAnnuo: new Prisma.Decimal(v.importoAnnuo), nota: v.nota },
    })
  }
  if (sostituisci && estranee.length > 0) {
    await tx.fixedCostItem.deleteMany({ where: { id: { in: estranee.map((e) => e.id) } } })
  }
  await tx.activityLog.create({
    data: {
      userId: admin.id,
      azione: 'import_costi_fissi',
      entita: 'fixed_cost',
      valoreNuovo:
        `${voci.length} voci dal censimento, totale ${euro(totale)}` +
        (sostituisci && estranee.length > 0 ? `; ${estranee.length} voci estranee rimosse` : ''),
    },
  })
})

const dopo = await prisma.fixedCostItem.aggregate({ _sum: { importoAnnuo: true }, _count: true })
const capiAnnui = await prisma.appSetting.findUnique({ where: { chiave: 'capi_prodotti_annui' } })
const totaleDopo = Number(dopo._sum.importoAnnuo ?? 0)
const capi = Number(capiAnnui?.valore ?? 0)

console.log(`\nScritto. In tabella: ${dopo._count} voci, ${euro(totaleDopo)} l'anno.`)
console.log(
  capi > 0
    ? `Quota per capo: ${euro(totaleDopo / capi)} su ${capi} capi/anno.`
    : "Quota per capo: non calcolabile finché l'impostazione «capi prodotti annui» resta a zero " +
      '(Costi e margini → parametri di calcolo). È il moltiplicatore di tutti i margini: va scelto, non ereditato.',
)
console.log('')

await prisma.$disconnect()
