// Correzioni al catalogo segnalate da Giulia il 2026-09-11.
//
//     npm run catalogo:correggi              # SIMULAZIONE: dice cosa cambierebbe, non scrive
//     npm run catalogo:correggi -- --scrivi  # scrive davvero
//
// Dentro Render la Shell non ha il `.env` che `npm run` si aspetta: là si lancia
//
//     node --import tsx scripts/correzioni-catalogo.mts --scrivi
//
// Due correzioni, di natura diversa:
//
//   1. COLORI SCRITTI MALE — «SLMONE» per Salmone su July, «BIANO» per Bianco su Siviglia.
//      Vengono dall'inventario di giugno e da lì sono finiti nel censimento e in produzione.
//      Servono uno script perché il colore di una variante, una volta creata, **dall'app non
//      si cambia**: esistono solo la creazione della variante e la modifica delle quantità.
//      Rinominarlo dall'interfaccia vorrebbe dire cancellare la variante e rifarla, perdendo
//      la giacenza collegata.
//
//   2. TAGLIE MANCANTI — Barcellona non ha la L in nessun colore, perché a giugno non c'era
//      nessun pezzo in magazzino e l'inventario era l'unica fonte. La taglia però esiste e si
//      vende: entra a catalogo con zero pezzi.
//
// Perché non un reimport del censimento: quello riporterebbe `stock_disponibile` di **tutte**
// le 828 varianti ai numeri di giugno, cancellando i movimenti registrati da allora. Qui si
// tocca una colonna su sette righe e se ne aggiungono tre.
//
// Idempotente: entrambe le parti guardano com'è il database adesso e fanno solo ciò che manca.
// Rilanciarlo a correzione avvenuta non trova niente e lo dice.
import { PrismaClient } from '@prisma/client'
import { logActivity } from '../src/core/activityLog.js'
import { createVariant } from '../src/modules/products/service.js'

// La grafia sbagliata è la chiave di ricerca: identifica le righe da correggere senza
// dipendere dagli SKU, che restano quelli (l'abbreviazione «SLM» per Salmone è corretta).
const COLORI_DA_CORREGGERE = [
  { sbagliato: 'SLMONE', giusto: 'SALMONE', capo: 'July' },
  { sbagliato: 'BIANO', giusto: 'BIANCO', capo: 'Siviglia' },
]

// Soglia minima 0 come le S e le M già a catalogo: la taglia si aggiunge, la regola di
// riordino di quel capo non cambia.
//
// Sullo SKU delle taglie doppie: la barra resta nel campo `taglia` («S/M»), che è la grafia
// vera, ma **non** nello SKU. Su 831 varianti gli SKU usano solo maiuscole, cifre e trattini,
// e una barra dentro un codice si porta dietro guai negli export e negli indirizzi. Quindi
// «S/M» diventa `SM` e «L/XL` diventa `LXL`.
const VARIANTI_DA_AGGIUNGERE = [
  { capo: 'Barcellona', sku: 'HEE-BARCELLO-L-CAM', taglia: 'L', colore: 'CAMMELLO', stockIniziale: 0, sogliaMinima: 0 },
  { capo: 'Barcellona', sku: 'HEE-BARCELLO-L-NER', taglia: 'L', colore: 'NERO', stockIniziale: 0, sogliaMinima: 0 },
  { capo: 'Barcellona', sku: 'HEE-BARCELLO-L-BIA', taglia: 'L', colore: 'BIANCO', stockIniziale: 0, sogliaMinima: 0 },
  { capo: 'Barcellona', sku: 'HEE-BARCELLO-SM-CAM', taglia: 'S/M', colore: 'CAMMELLO', stockIniziale: 0, sogliaMinima: 0 },
  { capo: 'Barcellona', sku: 'HEE-BARCELLO-SM-NER', taglia: 'S/M', colore: 'NERO', stockIniziale: 0, sogliaMinima: 0 },
  { capo: 'Barcellona', sku: 'HEE-BARCELLO-SM-BIA', taglia: 'S/M', colore: 'BIANCO', stockIniziale: 0, sogliaMinima: 0 },
  { capo: 'Barcellona', sku: 'HEE-BARCELLO-LXL-CAM', taglia: 'L/XL', colore: 'CAMMELLO', stockIniziale: 0, sogliaMinima: 0 },
  { capo: 'Barcellona', sku: 'HEE-BARCELLO-LXL-NER', taglia: 'L/XL', colore: 'NERO', stockIniziale: 0, sogliaMinima: 0 },
  { capo: 'Barcellona', sku: 'HEE-BARCELLO-LXL-BIA', taglia: 'L/XL', colore: 'BIANCO', stockIniziale: 0, sogliaMinima: 0 },
]

// L'elenco taglie dichiarato sul capo è un campo a parte dalle varianti, e sul bermuda i due
// si contraddicevano: il capo diceva «S/M|L/XL», le varianti erano S e M. Non era uno dei due
// a sbagliare — il capo si vende in tutte e cinque (Giulia, 2026-09-11).
const TAGLIE_DICHIARATE = [
  { capo: 'Barcellona', taglie: ['S', 'M', 'L', 'S/M', 'L/XL'] },
]

const scrivi = process.argv.includes('--scrivi')
const prisma = new PrismaClient()

const admin = await prisma.user.findFirst({
  where: { role: 'admin', attivo: true },
  select: { id: true, email: true },
})
if (!admin) throw new Error('Nessun amministratore attivo: la correzione va firmata da un utente.')

console.log(scrivi ? '── SCRITTURA ──' : '── SIMULAZIONE (niente viene scritto) ──')

// ------------------------------------------------------------------ 1. colori scritti male
console.log('\n### Colori scritti male')
let colori = 0
for (const c of COLORI_DA_CORREGGERE) {
  const righe = await prisma.productVariant.findMany({
    where: { colore: c.sbagliato },
    select: { sku: true, taglia: true, product: { select: { nome: true } } },
    orderBy: { sku: 'asc' },
  })

  if (righe.length === 0) {
    console.log(`\n${c.sbagliato} → ${c.giusto}: niente da correggere (gia' a posto).`)
    continue
  }

  console.log(`\n${c.sbagliato} → ${c.giusto}  (atteso: ${c.capo})`)
  for (const r of righe) console.log(`  ${r.sku}  ${r.product.nome} ${r.taglia}`)

  // Un capo diverso da quello atteso non è per forza un errore, ma non lo decide uno
  // script: si ferma e lo fa vedere.
  const inattesi = [...new Set(righe.filter((r) => r.product.nome !== c.capo).map((r) => r.product.nome))]
  if (inattesi.length) {
    throw new Error(
      `«${c.sbagliato}» trovato anche su ${inattesi.join(', ')}, non solo su ${c.capo}. Controlla prima di correggere.`,
    )
  }

  if (scrivi) {
    await prisma.$transaction(async (tx) => {
      await tx.productVariant.updateMany({ where: { colore: c.sbagliato }, data: { colore: c.giusto } })
      await logActivity(tx, {
        userId: admin.id,
        azione: 'correzione_colore',
        entita: 'product_variant',
        valorePrecedente: c.sbagliato,
        valoreNuovo: `${c.giusto} (${righe.length} varianti di ${c.capo})`,
      })
    })
  }
  colori += righe.length
}

// ------------------------------------------------------------------ 2. taglie mancanti
console.log('\n### Taglie mancanti')
let create = 0
for (const v of VARIANTI_DA_AGGIUNGERE) {
  const esiste = await prisma.productVariant.findUnique({ where: { sku: v.sku }, select: { id: true } })
  if (esiste) {
    console.log(`  ${v.sku}: c'e' gia', non la tocco.`)
    continue
  }

  const capo = await prisma.product.findFirst({ where: { nome: v.capo }, select: { id: true } })
  if (!capo) throw new Error(`Capo «${v.capo}» non trovato: non posso attaccarci la variante ${v.sku}.`)

  console.log(`  ${v.sku}  ${v.capo} ${v.taglia} ${v.colore} · ${v.stockIniziale} pezzi`)
  if (scrivi) {
    // Stessa funzione che usa l'app: variante, riga di inventario e registro attività
    // restano allineati senza riscrivere qui quella logica.
    await createVariant(capo.id, {
      sku: v.sku,
      taglia: v.taglia,
      colore: v.colore,
      stockIniziale: v.stockIniziale,
      sogliaMinima: v.sogliaMinima,
    }, admin.id)
  }
  create += 1
}

// ------------------------------------------------------------------ 3. elenco taglie del capo
console.log('\n### Elenco taglie dichiarato sul capo')
let taglie = 0
for (const t of TAGLIE_DICHIARATE) {
  const capo = await prisma.product.findFirst({
    where: { nome: t.capo },
    select: { id: true, taglieDisponibili: true },
  })
  if (!capo) throw new Error(`Capo «${t.capo}» non trovato.`)

  const uguali =
    capo.taglieDisponibili.length === t.taglie.length &&
    capo.taglieDisponibili.every((x, i) => x === t.taglie[i])
  if (uguali) {
    console.log(`  ${t.capo}: gia' ${t.taglie.join('|')}, non lo tocco.`)
    continue
  }

  console.log(`  ${t.capo}: ${capo.taglieDisponibili.join('|') || '(vuoto)'} → ${t.taglie.join('|')}`)
  if (scrivi) {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: capo.id }, data: { taglieDisponibili: t.taglie } })
      await logActivity(tx, {
        userId: admin.id,
        azione: 'update',
        entita: 'product',
        entitaId: capo.id,
        valorePrecedente: capo.taglieDisponibili.join('|'),
        valoreNuovo: t.taglie.join('|'),
      })
    })
  }
  taglie += 1
}

console.log(
  `\n${colori} varianti con il colore ${scrivi ? 'corretto' : 'da correggere'} · ` +
    `${create} varianti ${scrivi ? 'create' : 'da creare'} · ` +
    `${taglie} elenchi taglie ${scrivi ? 'aggiornati' : 'da aggiornare'}` +
    (scrivi ? ` · firmato da ${admin.email}` : '\nRilancia con --scrivi per applicare.'),
)

await prisma.$disconnect()
