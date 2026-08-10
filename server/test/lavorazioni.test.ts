// Verifiche del ciclo bolle / lavorazione esterna (2026-08-10).
//
// Girano contro il Postgres di sviluppo vero, non contro dei finti: l'oggetto della
// verifica è proprio che le quantità sul database si muovano come devono, e un doppio
// finto non potrebbe dimostrarlo. Ogni test si crea i propri dati con un prefisso unico e
// li cancella alla fine, quindi la suite si può rilanciare all'infinito senza sporcare il
// database né dipendere da cosa c'era prima.
//
//     cd server && npm test
//
// I numeri di caso (1…12) sono quelli della richiesta.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import {
  annullaBolla, chiudiBolla, creaBolla, emettiBolla, getBolla, listBolle, listMovimenti,
  registraRientro, riepilogoPressoLavoranti,
} from '../src/modules/lavorazioni/service.js'

const prisma = new PrismaClient()

/** Marchio unico di questa esecuzione: isola i dati di prova da qualunque altro contenuto. */
const RUN = `TEST-LAV-${Date.now().toString(36).toUpperCase()}`

const admin = { id: '', role: 'admin' as const }
let supplierId = ''
let productId = ''
let variantId = ''

const creati: string[] = []

/** Legge i numeri che contano su un tessuto: patrimonio, presso terzisti, disponibile. */
async function tessuto(id: string) {
  const m = await prisma.material.findUniqueOrThrow({ where: { id } })
  const acquistati = Number(m.metriAcquistati)
  const utilizzati = Number(m.metriUtilizzati)
  const presso = Number(m.metriPressoTerzisti)
  const scampoli = Number(m.metriScampoli)
  return {
    acquistati, utilizzati, presso, scampoli, patrimonio: acquistati - utilizzati,
    disponibile: acquistati - utilizzati - presso - scampoli,
  }
}

async function accessorio(id: string) {
  const a = await prisma.accessory.findUniqueOrThrow({ where: { id } })
  const acquistata = Number(a.quantitaAcquistata)
  const utilizzata = Number(a.quantitaUtilizzata)
  const presso = Number(a.quantitaPressoTerzisti)
  const scampoli = Number(a.quantitaScampoli)
  return { utilizzata, presso, scampoli, patrimonio: acquistata - utilizzata, disponibile: acquistata - utilizzata - presso - scampoli }
}

async function giacenzaCapo(vId: string) {
  const r = await prisma.inventoryRecord.findUniqueOrThrow({ where: { variantId: vId } })
  return {
    magazzino: r.qtaMagazzino, laboratorio: r.qtaLaboratorio,
    pressoTerzisti: r.qtaPressoTerzisti, scampoli: r.qtaScampoli,
  }
}

/** Un tessuto nuovo di zecca per il test che lo chiede: nessun test dipende dagli altri. */
async function nuovoTessuto(nome: string, metri: number, costo = 0) {
  const m = await prisma.material.create({
    data: {
      nome: `${RUN} ${nome}`, codice: `${RUN}-${nome}`, metriAcquistati: metri,
      prezzoAlMetro: costo, unitaMisura: 'm', sogliaMinima: 5,
    },
  })
  return m.id
}

async function nuovoAccessorio(nome: string, quantita: number) {
  const a = await prisma.accessory.create({
    data: { nome: `${RUN} ${nome}`, codice: `${RUN}-${nome}`, quantitaAcquistata: quantita, unitaMisura: 'cad' },
  })
  return a.id
}

/** Bozza pronta all'uso; l'id viene messo in lista per la pulizia finale. */
async function bozza(righe: {
  tipo: 'materiale' | 'accessorio' | 'variante'
  articoloId: string
  quantita: number
  provenienza?: 'magazzino' | 'scampoli'
}[]) {
  const b = await creaBolla(
    {
      supplierId, data: '2026-08-10', causale: 'conto_lavorazione',
      productId, commessa: `${RUN}/1`, quantitaAttesa: 10, righe,
    },
    admin.id,
  )
  creati.push(b.id)
  return b
}

before(async () => {
  const utente = await prisma.user.create({
    data: { nome: 'Tester lavorazioni', email: `${RUN.toLowerCase()}@test.local`, role: 'admin' },
  })
  admin.id = utente.id

  const s = await prisma.supplier.create({
    data: { nome: `${RUN} Confezioni Bianchi`, categoria: 'Confezione', partitaIva: '01234567890' },
  })
  supplierId = s.id

  const p = await prisma.product.create({
    data: { nome: `${RUN} Cappotto`, codiceProdotto: `${RUN}-CAP`, linea: 'tessile' },
  })
  productId = p.id

  const v = await prisma.productVariant.create({
    data: { productId: p.id, sku: `${RUN}-CAP-42-NERO`, taglia: '42', colore: 'nero' },
  })
  variantId = v.id
  await prisma.inventoryRecord.create({
    data: { variantId: v.id, qtaMagazzino: 20, qtaLaboratorio: 0, migrazioneCompletata: true },
  })
})

after(async () => {
  // L'ordine conta: le bolle prima degli articoli, perché le righe li referenziano.
  await prisma.bollaLavorazione.deleteMany({ where: { id: { in: creati } } })
  await prisma.movimentoLavorazione.deleteMany({ where: { bollaId: { in: creati } } })
  await prisma.inventoryMovement.deleteMany({ where: { variantId } })
  await prisma.inventoryRecord.deleteMany({ where: { variantId } })
  await prisma.productVariant.deleteMany({ where: { productId } })
  await prisma.product.deleteMany({ where: { id: productId } })
  await prisma.material.deleteMany({ where: { codice: { startsWith: RUN } } })
  await prisma.accessory.deleteMany({ where: { codice: { startsWith: RUN } } })
  await prisma.supplier.deleteMany({ where: { id: supplierId } })
  await prisma.activityLog.deleteMany({ where: { userId: admin.id } })
  await prisma.user.deleteMany({ where: { id: admin.id } })
  await prisma.$disconnect()
})

describe('Bolle di lavorazione esterna', () => {
  test('1 — la bozza non modifica nessuna giacenza', async () => {
    const tessutoId = await nuovoTessuto('T1', 100)
    const zipId = await nuovoAccessorio('Z1', 50)
    const prima = { t: await tessuto(tessutoId), z: await accessorio(zipId), capo: await giacenzaCapo(variantId) }

    const b = await bozza([
      { tipo: 'materiale', articoloId: tessutoId, quantita: 30 },
      { tipo: 'accessorio', articoloId: zipId, quantita: 12 },
      { tipo: 'variante', articoloId: variantId, quantita: 3 },
    ])

    assert.equal(b.stato, 'bozza')
    assert.equal(b.numero, null, 'una bozza non consuma un numero di documento')
    assert.deepEqual(await tessuto(tessutoId), prima.t)
    assert.deepEqual(await accessorio(zipId), prima.z)
    assert.deepEqual(await giacenzaCapo(variantId), prima.capo)
    assert.equal((await listMovimenti(b.id)).length, 0, 'una bozza non genera movimenti')
  })

  test('2 — l\'emissione sposta i materiali dal magazzino al lavorante', async () => {
    const tessutoId = await nuovoTessuto('T2', 100)
    const zipId = await nuovoAccessorio('Z2', 50)
    const capoPrima = await giacenzaCapo(variantId)

    const b = await bozza([
      { tipo: 'materiale', articoloId: tessutoId, quantita: 30 },
      { tipo: 'accessorio', articoloId: zipId, quantita: 12 },
      { tipo: 'variante', articoloId: variantId, quantita: 3 },
    ])
    const emessa = await emettiBolla(b.id, admin.id)

    assert.equal(emessa.stato, 'emessa')
    assert.match(emessa.numero ?? '', /^DDT-2026-\d{4}$/, 'il numero si assegna all\'emissione')
    assert.equal(emessa.lavoranteNome, `${RUN} Confezioni Bianchi`, 'anagrafica del lavorante congelata')

    const t = await tessuto(tessutoId)
    assert.equal(t.presso, 30, '30 m sono presso il lavorante')
    assert.equal(t.disponibile, 70, 'il disponibile in casa cala')
    assert.equal(t.patrimonio, 100, 'il patrimonio NON cala: la merce è ancora nostra')

    const z = await accessorio(zipId)
    assert.equal(z.presso, 12)
    assert.equal(z.disponibile, 38)
    assert.equal(z.patrimonio, 50)

    const capo = await giacenzaCapo(variantId)
    assert.equal(capo.magazzino, capoPrima.magazzino - 3)
    assert.equal(capo.pressoTerzisti, capoPrima.pressoTerzisti + 3)

    const mov = await listMovimenti(b.id)
    assert.equal(mov.length, 3, 'un movimento per riga')
    assert.ok(mov.every((m) => m.tipo === 'uscita_materiale' && m.da === 'magazzino' && m.a === 'produzione_esterna'))
    assert.ok(mov.every((m) => m.rigaId !== null), 'ogni movimento è agganciato alla riga che lo ha generato')
    assert.ok(mov.every((m) => m.createdBy === admin.id), 'ogni movimento porta l\'utente responsabile')
  })

  test('3 — non si può inviare più materiale di quello disponibile', async () => {
    const tessutoId = await nuovoTessuto('T3', 40)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 60 }])

    await assert.rejects(() => emettiBolla(b.id, admin.id), /disponibili 40 m/i)

    const t = await tessuto(tessutoId)
    assert.equal(t.presso, 0, 'il rifiuto non lascia scorie: niente è uscito')
    assert.equal((await getBolla(b.id)).stato, 'bozza', 'la bolla resta bozza')
    assert.equal((await listMovimenti(b.id)).length, 0)
  })

  test('3b — la disponibilità si misura sul totale della bolla, non riga per riga', async () => {
    // Due righe da 30 m su un tessuto che ne ha 50: prese singolarmente passano entrambe.
    const tessutoId = await nuovoTessuto('T3B', 50)
    const b = await bozza([
      { tipo: 'materiale', articoloId: tessutoId, quantita: 30 },
      { tipo: 'materiale', articoloId: tessutoId, quantita: 30 },
    ])
    await assert.rejects(() => emettiBolla(b.id, admin.id), /non se ne possono consegnare 60/i)
    assert.equal((await tessuto(tessutoId)).presso, 0)
  })

  test('3c — il materiale già presso un lavorante non è più disponibile per un altro', async () => {
    const tessutoId = await nuovoTessuto('T3C', 100)
    const prima = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 80 }])
    await emettiBolla(prima.id, admin.id)

    const seconda = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 30 }])
    await assert.rejects(() => emettiBolla(seconda.id, admin.id), /già presso un lavorante/i)

    assert.equal((await tessuto(tessutoId)).presso, 80, 'la seconda emissione non ha aggiunto niente')
  })

  test('4 — la doppia conferma non duplica i movimenti', async () => {
    const tessutoId = await nuovoTessuto('T4', 100)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 25 }])

    await emettiBolla(b.id, admin.id)
    await assert.rejects(() => emettiBolla(b.id, admin.id), /già emessa/i)

    const t = await tessuto(tessutoId)
    assert.equal(t.presso, 25, 'un solo scarico, non due')
    assert.equal(t.disponibile, 75)
    assert.equal((await listMovimenti(b.id)).length, 1)
  })

  test('4b — due emissioni contemporanee: una passa, l\'altra viene respinta', async () => {
    const tessutoId = await nuovoTessuto('T4B', 100)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 40 }])

    const esiti = await Promise.allSettled([emettiBolla(b.id, admin.id), emettiBolla(b.id, admin.id)])
    const riuscite = esiti.filter((e) => e.status === 'fulfilled')
    assert.equal(riuscite.length, 1, 'esattamente una delle due emissioni va a buon fine')
    assert.equal((await tessuto(tessutoId)).presso, 40, 'un solo scarico')
    assert.equal((await listMovimenti(b.id)).length, 1)
  })

  test('5, 6, 7 — il rientro restituisce l\'inutilizzato, scarica il consumo, registra lo scarto', async () => {
    const tessutoId = await nuovoTessuto('T5', 100)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 40 }])
    const emessa = await emettiBolla(b.id, admin.id)
    const rigaId = emessa.righe[0].id

    // 40 consegnati: 25 finiti nei capi, 12 tornano indietro, 3 rovinati.
    const dopo = await registraRientro(
      b.id,
      { data: '2026-08-20', numeroDocumentoLavorante: 'DDT-BIANCHI-77', righe: [{ rigaId, utilizzata: 25, restituita: 12, scartoPerso: 3 }] },
      admin.id,
    )

    const t = await tessuto(tessutoId)
    // Caso 5: solo i 12 inutilizzati tornano disponibili.
    assert.equal(t.presso, 0, 'niente è più dal lavorante')
    assert.equal(t.disponibile, 100 - 25 - 3, 'tornano disponibili solo i 12 restituiti')
    // Caso 6: consumo e scarto escono dal patrimonio per sempre.
    assert.equal(t.utilizzati, 28, '25 consumati + 3 scartati escono dal patrimonio')
    assert.equal(t.patrimonio, 72)

    // Caso 7: lo scarto resta visibile e distinto dal consumo.
    const mov = await listMovimenti(b.id)
    const scarto = mov.filter((m) => m.tipo === 'scarto')
    assert.equal(scarto.length, 1)
    assert.equal(Number(scarto[0].quantita), 3)
    assert.equal(scarto[0].a, 'scarto', 'lo scarto ha una causale propria, non finisce dentro il consumo')
    assert.equal(scarto[0].motivo, 'Scarto perso in lavorazione')
    assert.equal(mov.filter((m) => m.tipo === 'consumo').length, 1)
    assert.equal(mov.filter((m) => m.tipo === 'rientro_inutilizzato').length, 1)

    const riga = dopo.righe[0]
    assert.equal(riga.quantitaScartoPerso, 3, 'lo scarto perso resta contato a parte anche sulla riga')
    assert.equal(riga.quantitaPressoLavorante, 0)
  })

  test('7b — lo scarto recuperabile rientra come scampolo e non diventa una perdita', async () => {
    const tessutoId = await nuovoTessuto('T7B', 100, 12.5)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 40 }])

    // Il costo deve restare quello fotografato sulla bolla, anche se l'anagrafica cambia.
    await prisma.material.update({ where: { id: tessutoId }, data: { prezzoAlMetro: 99 } })

    const emessa = await emettiBolla(b.id, admin.id)
    const dopo = await registraRientro(
      b.id,
      {
        data: '2026-08-20',
        righe: [{
          rigaId: emessa.righe[0].id,
          utilizzata: 25,
          scartoRecuperato: 10,
          scartoPerso: 5,
        }],
      },
      admin.id,
    )

    const t = await tessuto(tessutoId)
    assert.equal(t.presso, 0)
    assert.equal(t.scampoli, 10, 'i ritagli riutilizzabili restano patrimonio in una riserva separata')
    assert.equal(t.utilizzati, 30, 'solo consumo e perdita escono dal patrimonio')
    assert.equal(t.patrimonio, 70)
    assert.equal(t.disponibile, 60, 'gli scampoli non gonfiano la pezza integra disponibile')

    assert.equal(dopo.righe[0].costoUnitario, 12.5, 'il costo è congelato alla creazione della bolla')
    assert.equal(dopo.costoConsumato, 312.5)
    assert.equal(dopo.costoPerso, 62.5)
    assert.equal(dopo.costoLavorazione, 375)

    const movimenti = await listMovimenti(b.id)
    const recupero = movimenti.find((m) => m.tipo === 'scarto_recuperato')
    const perdita = movimenti.find((m) => m.tipo === 'scarto')
    assert.equal(recupero?.a, 'scampoli')
    assert.equal(Number(recupero?.valore), 125, 'il registro valorizza anche il bene recuperato')
    assert.equal(Number(perdita?.valore), 62.5)
  })

  test('7c — gli scampoli possono essere prelevati senza gonfiare il materiale integro', async () => {
    const tessutoId = await nuovoTessuto('T7C', 50, 8)
    const prima = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 10 }])
    const primaEmessa = await emettiBolla(prima.id, admin.id)
    await registraRientro(
      prima.id,
      { data: '2026-08-20', righe: [{ rigaId: primaEmessa.righe[0].id, scartoRecuperato: 10 }] },
      admin.id,
    )
    assert.equal((await tessuto(tessutoId)).scampoli, 10)

    const seconda = await bozza([{
      tipo: 'materiale', articoloId: tessutoId, quantita: 6, provenienza: 'scampoli',
    }])
    const secondaEmessa = await emettiBolla(seconda.id, admin.id)
    let t = await tessuto(tessutoId)
    assert.equal(t.scampoli, 4)
    assert.equal(t.presso, 6)
    assert.equal(t.disponibile, 40, 'lo spostamento scampoli → lavorante non cambia la pezza integra')

    await registraRientro(
      seconda.id,
      {
        data: '2026-08-21',
        righe: [{ rigaId: secondaEmessa.righe[0].id, utilizzata: 4, restituita: 2 }],
      },
      admin.id,
    )
    t = await tessuto(tessutoId)
    assert.equal(t.scampoli, 6, 'l\'inutilizzato torna nella riserva da cui era partito')
    assert.equal(t.presso, 0)
    assert.equal(t.disponibile, 40)

    const troppo = await bozza([{
      tipo: 'materiale', articoloId: tessutoId, quantita: 7, provenienza: 'scampoli',
    }])
    await assert.rejects(() => emettiBolla(troppo.id, admin.id), /scampoli disponibili 6/i)
  })

  test('8 — il rientro carica i capi finiti nell\'inventario prodotti finiti', async () => {
    const tessutoId = await nuovoTessuto('T8', 100)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 20 }])
    const emessa = await emettiBolla(b.id, admin.id)
    const capoPrima = await giacenzaCapo(variantId)

    const dopo = await registraRientro(
      b.id,
      {
        data: '2026-08-22',
        righe: [{ rigaId: emessa.righe[0].id, utilizzata: 20 }],
        capi: [{ variantId, quantita: 7 }],
      },
      admin.id,
    )

    const capo = await giacenzaCapo(variantId)
    assert.equal(capo.magazzino, capoPrima.magazzino + 7, '7 capi entrano in magazzino')
    assert.equal(dopo.capiRientrati, 7)

    // Il capo rientrato porta con sé taglia e colore, copiati al momento del rientro.
    const capoRientrato = dopo.rientri[0].capi[0]
    assert.equal(capoRientrato.taglia, '42')
    assert.equal(capoRientrato.colore, 'nero')
    assert.equal(capoRientrato.sku, `${RUN}-CAP-42-NERO`)

    // Il carico si vede anche nel registro della variante, dove lo cerca chi guarda l'inventario.
    const movVariante = await prisma.inventoryMovement.findMany({
      where: { variantId, motivo: 'Capi finiti da lavorazione esterna' },
      include: { locationFrom: true, locationTo: true },
    })
    assert.ok(movVariante.length >= 1)
    assert.equal(movVariante[0].locationFrom?.tipo, 'produzione_esterna', 'usa l\'ubicazione già prevista, senza duplicarne una')
    assert.equal(movVariante[0].locationTo?.codice, 'MAG')
  })

  test('9 — un rientro parziale lascia la lavorazione aperta', async () => {
    const tessutoId = await nuovoTessuto('T9', 100)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 50 }])
    const emessa = await emettiBolla(b.id, admin.id)
    const rigaId = emessa.righe[0].id

    const dopo = await registraRientro(b.id, { data: '2026-08-21', righe: [{ rigaId, utilizzata: 20 }] }, admin.id)

    assert.equal(dopo.stato, 'parzialmente_rientrata')
    assert.equal(dopo.tuttoRiconciliato, false)
    assert.equal(dopo.righe[0].quantitaPressoLavorante, 30, '30 m sono ancora fuori')
    assert.equal((await tessuto(tessutoId)).presso, 30)

    // E la chiusura viene rifiutata finché quei 30 m non hanno una destinazione.
    await assert.rejects(() => chiudiBolla(b.id, {}, admin), /non è riconciliata/i)

    // Il riepilogo "chi ha cosa" li mostra, con nome del lavorante e numero di bolla.
    const riepilogo = await riepilogoPressoLavoranti()
    const voce = riepilogo.find((v) => v.chiave === tessutoId)
    assert.ok(voce, 'il tessuto risulta fuori')
    assert.equal(voce.totale, 30)
    assert.equal(voce.dettaglio[0].lavorante, `${RUN} Confezioni Bianchi`)

    // Secondo rientro: si chiude il conto.
    const finale = await registraRientro(b.id, { data: '2026-08-28', righe: [{ rigaId, utilizzata: 25, restituita: 5 }] }, admin.id)
    assert.equal(finale.tuttoRiconciliato, true)
    assert.equal(finale.rientri.length, 2, 'più rientri restano collegati alla stessa lavorazione')
    assert.equal((await tessuto(tessutoId)).presso, 0)
  })

  test('9b — non si può restituire più di quanto consegnato (niente doppi rientri)', async () => {
    const tessutoId = await nuovoTessuto('T9B', 100)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 20 }])
    const emessa = await emettiBolla(b.id, admin.id)
    const rigaId = emessa.righe[0].id

    await registraRientro(b.id, { data: '2026-08-21', righe: [{ rigaId, restituita: 20 }] }, admin.id)
    // Rilanciare lo stesso rientro (doppio invio, doppio click) viene respinto.
    await assert.rejects(
      () => registraRientro(b.id, { data: '2026-08-21', righe: [{ rigaId, restituita: 20 }] }, admin.id),
      /ancora 0 m/i,
    )
    assert.equal((await tessuto(tessutoId)).disponibile, 100, 'nessun doppio carico')
  })

  test('10 — la chiusura riconcilia tutte le quantità', async () => {
    const tessutoId = await nuovoTessuto('T10', 100)
    const zipId = await nuovoAccessorio('Z10', 40)
    const b = await bozza([
      { tipo: 'materiale', articoloId: tessutoId, quantita: 30 },
      { tipo: 'accessorio', articoloId: zipId, quantita: 10 },
    ])
    const emessa = await emettiBolla(b.id, admin.id)

    await registraRientro(
      b.id,
      {
        data: '2026-08-25',
        righe: [
          { rigaId: emessa.righe[0].id, utilizzata: 28, scartoPerso: 2 },
          { rigaId: emessa.righe[1].id, utilizzata: 10 },
        ],
        capi: [{ variantId, quantita: 10 }],
      },
      admin.id,
    )

    const chiusa = await chiudiBolla(b.id, {}, admin)
    assert.equal(chiusa.stato, 'chiusa')
    assert.equal(chiusa.chiusaConDifferenza, false)
    assert.equal(chiusa.tuttoRiconciliato, true)
    assert.equal(chiusa.chiusaDa, admin.id, 'la chiusura registra chi l\'ha fatta')

    assert.equal((await tessuto(tessutoId)).presso, 0)
    assert.equal((await accessorio(zipId)).presso, 0)

    // Una bolla chiusa non accetta altri rientri.
    await assert.rejects(
      () => registraRientro(b.id, { data: '2026-08-26', righe: [{ rigaId: emessa.righe[0].id, restituita: 1 }] }, admin.id),
      /non accetta altri rientri/i,
    )
  })

  test('10b — la chiusura con differenza serve il ruolo giusto e una motivazione', async () => {
    const tessutoId = await nuovoTessuto('T10B', 100)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 30 }])
    const emessa = await emettiBolla(b.id, admin.id)
    await registraRientro(b.id, { data: '2026-08-25', righe: [{ rigaId: emessa.righe[0].id, utilizzata: 25 }] }, admin.id)

    // Team interno: non può forzare.
    await assert.rejects(
      () => chiudiBolla(b.id, { forzaDifferenza: true, note: 'ammanco accettato' }, { id: admin.id, role: 'team' }),
      /riservato ad Admin e CEO/i,
    )
    // Admin senza motivazione: nemmeno.
    await assert.rejects(() => chiudiBolla(b.id, { forzaDifferenza: true }, admin), /motivazione scritta/i)

    const chiusa = await chiudiBolla(b.id, { forzaDifferenza: true, note: '5 m persi dal lavorante, accettato' }, admin)
    assert.equal(chiusa.stato, 'chiusa')
    assert.equal(chiusa.chiusaConDifferenza, true, 'la differenza resta marcata, non sparisce nella chiusura')
    assert.match(chiusa.differenzaNote ?? '', /5 m persi/)
    // I 5 m non tornano in magazzino d'ufficio: non sono tornati davvero.
    assert.equal((await tessuto(tessutoId)).presso, 5)
  })

  test('11 — annullare una bolla emessa ristorna le quantità; con un rientro non si può più', async () => {
    const tessutoId = await nuovoTessuto('T11', 100)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 35 }])
    await emettiBolla(b.id, admin.id)
    assert.equal((await tessuto(tessutoId)).disponibile, 65)

    const annullata = await annullaBolla(b.id, 'lavorante non disponibile', admin.id)
    assert.equal(annullata.stato, 'annullata')
    const t = await tessuto(tessutoId)
    assert.equal(t.presso, 0)
    assert.equal(t.disponibile, 100, 'le quantità sono tornate esattamente com\'erano')
    assert.equal(t.utilizzati, 0, 'lo storno non consuma niente')

    // Lo storno si aggiunge allo storico, non lo riscrive.
    const mov = await listMovimenti(b.id)
    assert.equal(mov.filter((m) => m.tipo === 'uscita_materiale').length, 1, 'l\'uscita originale resta visibile')
    assert.equal(mov.filter((m) => m.tipo === 'storno_uscita').length, 1)

    // Con un rientro già registrato l'annullamento non è più reversibile: viene rifiutato.
    const tessuto2 = await nuovoTessuto('T11B', 100)
    const b2 = await bozza([{ tipo: 'materiale', articoloId: tessuto2, quantita: 30 }])
    const em2 = await emettiBolla(b2.id, admin.id)
    await registraRientro(b2.id, { data: '2026-08-25', righe: [{ rigaId: em2.righe[0].id, utilizzata: 10 }] }, admin.id)
    await assert.rejects(() => annullaBolla(b2.id, undefined, admin.id), /già dei rientri/i)
  })

  test('11b — una bolla emessa non si modifica; le note sì', async () => {
    const { aggiornaBolla } = await import('../src/modules/lavorazioni/service.js')
    const tessutoId = await nuovoTessuto('T11C', 100)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 10 }])

    // In bozza si cambia tutto.
    const modificata = await aggiornaBolla(b.id, { quantitaAttesa: 42 }, admin.id)
    assert.equal(modificata.quantitaAttesa, 42)

    await emettiBolla(b.id, admin.id)
    await assert.rejects(
      () => aggiornaBolla(b.id, { righe: [{ tipo: 'materiale', articoloId: tessutoId, quantita: 99 }] }, admin.id),
      /non si cambiano più/i,
    )
    const conNota = await aggiornaBolla(b.id, { note: 'consegnato a mano il 10/08' }, admin.id)
    assert.equal(conNota.note, 'consegnato a mano il 10/08')
    assert.equal((await tessuto(tessutoId)).presso, 10, 'la nota non muove quantità')
  })

  test('12 — bolle, righe e movimenti sono nel database e si rileggono uguali', async () => {
    const tessutoId = await nuovoTessuto('T12', 100)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 30 }])
    const emessa = await emettiBolla(b.id, admin.id)
    await registraRientro(
      b.id,
      { data: '2026-08-25', righe: [{ rigaId: emessa.righe[0].id, utilizzata: 20, restituita: 10 }], capi: [{ variantId, quantita: 4 }] },
      admin.id,
    )

    // Riletta da una connessione nuova, come farebbe il browser dopo un ricaricamento:
    // niente sta in memoria, tutto arriva da Postgres.
    const fresco = new PrismaClient()
    try {
      const dal = await fresco.bollaLavorazione.findUniqueOrThrow({
        where: { id: b.id },
        include: { righe: true, rientri: { include: { righe: true, capi: true } }, movimenti: true },
      })
      assert.equal(dal.numero, emessa.numero)
      assert.equal(dal.stato, 'parzialmente_rientrata')
      assert.equal(dal.righe.length, 1)
      assert.equal(Number(dal.righe[0].quantitaUtilizzata), 20)
      assert.equal(Number(dal.righe[0].quantitaRestituita), 10)
      assert.equal(dal.rientri.length, 1)
      assert.equal(dal.rientri[0].capi[0].quantita, 4)
      assert.equal(dal.movimenti.length, 4, 'uscita + consumo + restituzione + carico capi')
      assert.ok(dal.movimenti.every((m) => m.descrizione.length > 0), 'ogni movimento porta la descrizione storica')
    } finally {
      await fresco.$disconnect()
    }

    // I dati storici restano leggibili anche se l'anagrafica cambia dopo l'emissione.
    await prisma.material.update({ where: { id: tessutoId }, data: { nome: `${RUN} RINOMINATO`, codice: `${RUN}-T12-NEW` } })
    const riletta = await getBolla(b.id)
    assert.equal(riletta.righe[0].descrizione, `${RUN} T12`, 'la bolla dice ancora cosa è uscito davvero')
    assert.equal(riletta.righe[0].sku, `${RUN}-T12`)
  })

  test('filtri dell\'elenco: lavorante, stato, numero e data', async () => {
    const tutte = await listBolle({ supplierId })
    assert.ok(tutte.length > 0)
    assert.ok(tutte.every((b) => b.supplierId === supplierId))

    const bozze = await listBolle({ supplierId, stato: 'bozza' })
    assert.ok(bozze.every((b) => b.stato === 'bozza'))

    const conNumero = tutte.find((b) => b.numero)
    assert.ok(conNumero)
    const perNumero = await listBolle({ numero: conNumero.numero! })
    assert.equal(perNumero.length, 1)

    const fuoriFinestra = await listBolle({ supplierId, dataDa: '2027-01-01' })
    assert.equal(fuoriFinestra.length, 0)
  })

  test('ogni operazione finisce nell\'audit log con il suo utente', async () => {
    const tessutoId = await nuovoTessuto('TLOG', 100)
    const b = await bozza([{ tipo: 'materiale', articoloId: tessutoId, quantita: 10 }])
    const emessa = await emettiBolla(b.id, admin.id)
    await registraRientro(b.id, { data: '2026-08-25', righe: [{ rigaId: emessa.righe[0].id, restituita: 10 }] }, admin.id)
    await chiudiBolla(b.id, {}, admin)

    const log = await prisma.activityLog.findMany({ where: { entita: 'bolla_lavorazione', entitaId: b.id }, orderBy: { createdAt: 'asc' } })
    const azioni = log.map((l) => l.azione)
    assert.deepEqual(azioni, [
      'crea_bolla_lavorazione',
      'emetti_bolla_lavorazione',
      'registra_rientro_lavorazione',
      'chiudi_bolla_lavorazione',
    ])
    assert.ok(log.every((l) => l.userId === admin.id))
  })
})
