// Inventario prodotti finiti. Porting di updateVariantQuantities dal DataStore: il record
// inventario e la variante restano allineati, stato e divergenza Shopify sono ricalcolati
// dal server (mai inviati dal client).
import type { InventoryStato, InventoryMovementType, Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { notFound, badRequest } from '../../core/errors.js'
import { bloccaRisorsa } from '../../core/lock.js'
import { logActivity } from '../../core/activityLog.js'

/** Client Prisma o client di una transazione in corso: le letture funzionano con entrambi. */
type Db = PrismaClient | Prisma.TransactionClient

/** Stessa soglia del prototipo (variantStato): 0 = esaurito, <= soglia = low_stock. */
export function stockStato(qta: number, sogliaMinima: number): InventoryStato {
  if (qta <= 0) return 'esaurito'
  if (qta <= sogliaMinima) return 'low_stock'
  return 'disponibile'
}

/**
 * Disponibilità di una variante. **Il disponibile è magazzino + laboratorio**: sono
 * entrambe giacenze fisiche di capi finiti, quindi entrambe vendibili.
 *
 * Il laboratorio è la posizione operativa da cui si preleva durante la produzione, per
 * questo ha una soglia propria: quando scende sotto, va reintegrato dal magazzino anche
 * se il totale è ancora alto.
 *
 * I capi mandati in lavorazione **non sono qui dentro**: escono dal laboratorio all'avvio
 * e ci rientrano quando la lavorazione è terminata (DEC-047). Sono una giacenza a sé,
 * contata nel totale registrato della variante ma non nel disponibile: un capo non finito
 * non si vende.
 */
export function calcolaDisponibilita(rec: {
  qtaMagazzino: number
  qtaLaboratorio: number
  sogliaMinima: number
  stockShopify: number
}) {
  const disponibileTotale = rec.qtaMagazzino + rec.qtaLaboratorio
  return {
    disponibileTotale,
    stato: stockStato(disponibileTotale, rec.sogliaMinima),
    // Il totale dei capi finiti è ciò che si può vendere: la divergenza si misura su quello.
    divergenzaShopify: rec.stockShopify !== disponibileTotale,
  }
}

export async function listInventory(filters: { stato?: string; divergenza?: boolean }) {
  const records = await prisma.inventoryRecord.findMany({
    where: {
      stato: filters.stato ? (filters.stato as InventoryStato) : undefined,
      divergenzaShopify: filters.divergenza,
    },
    orderBy: { updatedAt: 'desc' },
    include: { variant: { include: { product: true } } },
  })

  // Capi in produzione per variante, in una sola query invece di una per riga.
  const lavorazioni = await prisma.stockCommitment.groupBy({
    by: ['variantId'],
    where: { stato: 'in_produzione', variantId: { in: records.map((r) => r.variantId) } },
    _sum: { quantita: true },
  })
  const inProduzionePerVariante = new Map(lavorazioni.map((i) => [i.variantId, i._sum.quantita ?? 0]))

  return records.map((r) => {
    const inProduzione = inProduzionePerVariante.get(r.variantId) ?? 0
    return {
      ...r,
      // Disponibile = capi finiti in casa. I capi in lavorazione **non ci sono già più**:
      // sono usciti dal laboratorio all'avvio della lavorazione (DEC-047), quindi qui non
      // c'è niente da sottrarre.
      disponibileTotale: r.qtaMagazzino + r.qtaLaboratorio,
      qtaInProduzione: inProduzione,
      // La soglia di laboratorio vale solo a migrazione conclusa: durante la
      // distribuzione iniziale i numeri sono provvisori e un alert sarebbe rumore.
      // Sotto soglia = **strettamente** sotto. Con `<=` la variante restava segnalata anche
      // dopo un reintegro che l'aveva riportata esattamente a soglia: l'avviso diceva
      // "trasferisci 3 per ripristinare la soglia", si trasferiva, e l'avviso restava lì.
      laboratorioSottoSoglia:
        r.migrazioneCompletata && r.sogliaMinimaLaboratorio > 0 && r.qtaLaboratorio < r.sogliaMinimaLaboratorio,
      ...statoMigrazione(r, inProduzione),
      reintegro: calcolaReintegro(r),
    }
  })
}

// --- Migrazione iniziale delle giacenze (FR-49, DEC-045) ---
//
// All'import il sistema conosce **solo il totale** di ogni variante: entra tutto in
// laboratorio, e la distribuzione reale fra le ubicazioni la sistema una persona.
// Il punto delicato è che scrivere "3" nel magazzino è ambiguo: possono essere 3 capi
// già compresi nel totale (da spostare dal laboratorio) oppure 3 capi mai contati (da
// aggiungere). Il server non indovina: espone due operazioni distinte e il client fa la
// domanda. Vedi `migrationAdjust`.

export type UbicazioneMigrazione = 'magazzino' | 'laboratorio'
/**
 * Le tre risposte possibili alla domanda "cosa significa questo numero":
 * - `redistribuisci` — capi già compresi nel totale: arrivano dall'altra ubicazione, il totale non cambia;
 * - `aggiungi` — capi mai registrati: il totale si muove con loro;
 * - `colma` — capi che il totale già contava ma che non erano stati assegnati a nessuna
 *   ubicazione: il totale non cambia e lo scarto si chiude. Esiste solo quando uno scarto
 *   c'è: senza, sarebbe identica a `redistribuisci` con un'altra etichetta.
 */
export type ModalitaMigrazione = 'redistribuisci' | 'aggiungi' | 'colma'

interface RecordQuantita {
  qtaMagazzino: number
  qtaLaboratorio: number
  totaleMigrazione: number | null
  migrazioneCompletata: boolean
}

/**
 * Stato della distribuzione iniziale: quanto è stato assegnato, quanto è stato
 * dichiarato e la differenza. La migrazione si può confermare solo quando la somma
 * delle ubicazioni coincide col totale dichiarato (differenza zero).
 */
export function statoMigrazione(r: RecordQuantita, inProduzione = 0) {
  // Formula di controllo (FR-49 §2, DEC-047):
  //     totale registrato = magazzino + laboratorio + in produzione
  // I capi in lavorazione sono una giacenza a sé: non sono vendibili, ma esistono e vanno
  // contati, altrimenti una variante con lavorazioni aperte non quadrerebbe mai.
  const totaleDichiarato = r.totaleMigrazione ?? r.qtaMagazzino + r.qtaLaboratorio + inProduzione
  const totaleDistribuito = r.qtaMagazzino + r.qtaLaboratorio + inProduzione
  const differenza = totaleDistribuito - totaleDichiarato
  return {
    totaleDichiarato,
    totaleDistribuito,
    // Positiva = distribuiti più capi di quanti dichiarati; negativa = ne mancano.
    differenzaMigrazione: differenza,
    migrazioneConfermabile: !r.migrazioneCompletata && differenza === 0,
  }
}

/**
 * Reintegro suggerito del laboratorio: quanti capi servono per tornare alla soglia e
 * quanti se ne possono davvero spostare col magazzino di oggi. Se il magazzino non
 * basta, `quantitaSuggerita` è quel che c'è e `copreLaSoglia` resta falso: si trasferisce
 * comunque il possibile, ma la criticità non si spegne.
 */
export function calcolaReintegro(r: {
  qtaMagazzino: number
  qtaLaboratorio: number
  sogliaMinimaLaboratorio: number
  migrazioneCompletata: boolean
}) {
  if (!r.migrazioneCompletata || r.sogliaMinimaLaboratorio <= 0) return null

  // Soglia **superata verso il basso**, non "raggiunta": a quantità esattamente uguale
  // alla soglia non manca niente, e proporre un trasferimento da zero capi sarebbe un
  // avviso senza azione. Stessa regola per il badge "Da reintegrare" (`laboratorioSottoSoglia`),
  // così segnalazione e azione proposta dicono sempre la stessa cosa.
  const mancanti = r.sogliaMinimaLaboratorio - r.qtaLaboratorio
  if (mancanti <= 0) return null
  const quantitaSuggerita = Math.min(mancanti, r.qtaMagazzino)
  return {
    mancanti,
    quantitaSuggerita,
    inMagazzino: r.qtaMagazzino,
    copreLaSoglia: quantitaSuggerita >= mancanti,
  }
}

/**
 * Corregge la distribuzione durante la migrazione, con il significato dichiarato dal
 * chiamante (non dedotto).
 *
 * - `redistribuisci`: i capi erano già nel totale → si spostano dall'altra ubicazione.
 *   Il totale non cambia. Rifiutata se l'altra ubicazione non ne ha abbastanza.
 * - `aggiungi`: i capi non erano mai stati contati → si sommano all'ubicazione **e** al
 *   totale dichiarato, così la distribuzione resta valida.
 */
export async function migrationAdjust(
  variantId: string,
  input: { ubicazione: UbicazioneMigrazione; quantita: number; modalita: ModalitaMigrazione; note?: string },
  userId: string,
) {
  if (input.quantita < 0) throw badRequest('La quantità non può essere negativa')

  return prisma.$transaction(async (tx) => {
    await bloccaRisorsa(tx, 'inventory_record', variantId)
    const record = await tx.inventoryRecord.findUnique({ where: { variantId } })
    if (!record) throw notFound('Record di inventario non trovato per questa variante')
    if (record.migrazioneCompletata) {
      throw badRequest(
        'La distribuzione iniziale di questa variante è già stata confermata: usa i trasferimenti fra magazzino e laboratorio.',
      )
    }

    const versoMagazzino = input.ubicazione === 'magazzino'
    const inProduzione = await sommaInProduzione(variantId, tx)
    const totaleDichiarato = record.totaleMigrazione ?? record.qtaMagazzino + record.qtaLaboratorio + inProduzione

    let qtaMagazzino = record.qtaMagazzino
    let qtaLaboratorio = record.qtaLaboratorio
    let nuovoTotale = totaleDichiarato
    let quantitaMossa = 0

    if (input.modalita === 'redistribuisci') {
      // "Già compresi nel totale": l'ubicazione indicata arriva alla quantità richiesta e
      // la differenza esce dall'altra. Il totale resta quello.
      const attuale = versoMagazzino ? record.qtaMagazzino : record.qtaLaboratorio
      const altra = versoMagazzino ? record.qtaLaboratorio : record.qtaMagazzino
      const delta = input.quantita - attuale
      if (delta > altra) {
        throw badRequest(
          versoMagazzino
            ? `In laboratorio ci sono ${altra} pezzi: non se ne possono spostare ${delta} in magazzino.`
            : `In magazzino ci sono ${altra} pezzi: non se ne possono spostare ${delta} in laboratorio.`,
        )
      }
      quantitaMossa = Math.abs(delta)
      qtaMagazzino = versoMagazzino ? input.quantita : record.qtaMagazzino - delta
      qtaLaboratorio = versoMagazzino ? record.qtaLaboratorio - delta : input.quantita
    } else if (input.modalita === 'colma') {
      // "Erano nel totale ma non assegnati": l'ubicazione arriva alla quantità richiesta e
      // il totale resta com'è, così lo scarto si chiude. Ha senso solo se lo scarto si
      // riduce davvero: altrimenti si starebbe solo spostando il problema.
      const attuale = versoMagazzino ? record.qtaMagazzino : record.qtaLaboratorio
      const delta = input.quantita - attuale
      if (delta === 0) throw badRequest('La quantità è già questa: non cambia niente')
      const scartoPrima = record.qtaMagazzino + record.qtaLaboratorio + inProduzione - totaleDichiarato
      const scartoDopo = scartoPrima + delta
      if (Math.abs(scartoDopo) >= Math.abs(scartoPrima)) {
        throw badRequest(
          `Con questa quantità lo scarto rispetto al totale registrato non si riduce ` +
            `(da ${scartoPrima} a ${scartoDopo}). Se sono capi nuovi usa "Da aggiungere al totale".`,
        )
      }
      quantitaMossa = Math.abs(delta)
      qtaMagazzino = versoMagazzino ? input.quantita : record.qtaMagazzino
      qtaLaboratorio = versoMagazzino ? record.qtaLaboratorio : input.quantita
      // `nuovoTotale` resta `totaleDichiarato`: è tutto il senso di questa risposta.
    } else {
      // "Da aggiungere al totale": la differenza non viene dall'altra ubicazione, viene da
      // fuori — capi mai contati. L'ubicazione arriva comunque alla quantità richiesta (il
      // numero digitato ha **un solo significato**: "qui ce ne sono tanti"), e il totale
      // dichiarato si muove della stessa differenza, così la distribuzione resta quadrata.
      // Una differenza negativa è il caso simmetrico: capi contati per errore, si tolgono.
      const attuale = versoMagazzino ? record.qtaMagazzino : record.qtaLaboratorio
      const delta = input.quantita - attuale
      if (delta === 0) throw badRequest('La quantità è già questa: non c\'è niente da aggiungere')
      quantitaMossa = Math.abs(delta)
      qtaMagazzino = versoMagazzino ? input.quantita : record.qtaMagazzino
      qtaLaboratorio = versoMagazzino ? record.qtaLaboratorio : input.quantita
      nuovoTotale = totaleDichiarato + delta
    }

    const calcolo = calcolaDisponibilita({ ...record, qtaMagazzino, qtaLaboratorio })
    const updated = await tx.inventoryRecord.update({
      where: { variantId },
      data: {
        qtaMagazzino,
        qtaLaboratorio,
        totaleMigrazione: nuovoTotale,
        stato: calcolo.stato,
        divergenzaShopify: calcolo.divergenzaShopify,
      },
    })
    await tx.productVariant.update({
      where: { id: variantId },
      data: { stockDisponibile: calcolo.disponibileTotale, statoDisponibilita: calcolo.stato },
    })
    if (quantitaMossa > 0) {
      await logStockMovement(tx, {
        variantId,
        // Uno spostamento interno è un trasferimento; una quantità mai contata è un carico.
        tipo:
          input.modalita === 'redistribuisci'
            ? 'trasferimento'
            : input.modalita === 'colma'
              ? 'rettifica'
              : (versoMagazzino ? qtaMagazzino > record.qtaMagazzino : qtaLaboratorio > record.qtaLaboratorio)
                ? 'carico'
                : 'scarico',
        quantita: quantitaMossa,
        // `daMagazzino` indica l'origine del movimento: redistribuire verso il magazzino
        // significa prelevare dal laboratorio.
        daMagazzino: input.modalita === 'redistribuisci' ? !versoMagazzino : versoMagazzino,
        userId,
        motivo: 'Distribuzione iniziale',
        note:
          input.note ??
          (input.modalita === 'redistribuisci'
            ? `Migrazione: ${input.ubicazione} portato a ${input.quantita} (capi già compresi nel totale)`
            : input.modalita === 'colma'
              ? `Migrazione: ${input.ubicazione} portato a ${input.quantita} (capi del totale non ancora assegnati)`
              : `Migrazione: ${input.ubicazione} portato a ${input.quantita} con capi non compresi nel totale`),
      })
    }
    await logActivity(tx, {
      userId,
      azione: 'migrazione_giacenze',
      entita: 'inventory_record',
      entitaId: record.id,
      valorePrecedente: `magazzino ${record.qtaMagazzino} · laboratorio ${record.qtaLaboratorio} · totale ${totaleDichiarato}`,
      valoreNuovo: `magazzino ${qtaMagazzino} · laboratorio ${qtaLaboratorio} · totale ${nuovoTotale}`,
    })
    return { ...updated, ...statoMigrazione(updated, inProduzione) }
  })
}

/**
 * Chiude la migrazione di una variante. Rifiuta finché la somma delle ubicazioni non
 * coincide col totale dichiarato: confermare una distribuzione che non torna
 * significherebbe congelare un errore e non accorgersene più.
 */
export async function confirmMigration(variantId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await bloccaRisorsa(tx, 'inventory_record', variantId)
    const record = await tx.inventoryRecord.findUnique({ where: { variantId } })
    if (!record) throw notFound('Record di inventario non trovato per questa variante')
    if (record.migrazioneCompletata) throw badRequest('La distribuzione iniziale è già stata confermata')

    const inProduzione = await sommaInProduzione(variantId, tx)
    const stato = statoMigrazione(record, inProduzione)
    if (stato.differenzaMigrazione !== 0) {
      const d = stato.differenzaMigrazione
      throw badRequest(
        `La distribuzione non torna: magazzino ${record.qtaMagazzino} + laboratorio ${record.qtaLaboratorio}` +
          (inProduzione > 0 ? ` + in produzione ${inProduzione}` : '') +
          ` = ${stato.totaleDistribuito}, ma il totale registrato è ${stato.totaleDichiarato} ` +
          `(${d > 0 ? `${d} in più` : `${Math.abs(d)} mancanti`}). Sistema le quantità prima di confermare.`,
      )
    }
    const updated = await tx.inventoryRecord.update({
      where: { variantId },
      data: { migrazioneCompletata: true, migrazioneConfermataIl: new Date(), migrazioneConfermataDa: userId },
    })
    await logActivity(tx, {
      userId,
      azione: 'conferma_migrazione',
      entita: 'inventory_record',
      entitaId: record.id,
      valoreNuovo: `distribuzione iniziale confermata: magazzino ${record.qtaMagazzino} · laboratorio ${record.qtaLaboratorio} · in produzione ${inProduzione}`,
    })
    return { ...updated, ...statoMigrazione(updated, inProduzione) }
  })
}

// --- Movimenti di stock (magazzino <-> laboratorio) ---
// Le quantità restano su inventory_records (colonne fisse); qui si registra il movimento
// nelle tabelle a ubicazioni della migrazione 20260805024034, così lo storico è
// interrogabile per variante invece che leggibile solo come testo nell'activity log.

const LOCATION_MAGAZZINO = 'MAG'
const LOCATION_LABORATORIO = 'LAB'

/** Le due ubicazioni di sistema esistono sempre: si creano alla prima richiesta. */
async function ensureLocations(tx: Prisma.TransactionClient) {
  const [magazzino, laboratorio] = await Promise.all([
    tx.inventoryLocation.upsert({
      where: { codice: LOCATION_MAGAZZINO },
      update: {},
      create: { codice: LOCATION_MAGAZZINO, nome: 'Magazzino', tipo: 'magazzino' },
    }),
    tx.inventoryLocation.upsert({
      where: { codice: LOCATION_LABORATORIO },
      update: {},
      create: { codice: LOCATION_LABORATORIO, nome: 'Laboratorio', tipo: 'laboratorio' },
    }),
  ])
  return { magazzino, laboratorio }
}

export async function logStockMovement(
  tx: Prisma.TransactionClient,
  input: {
    variantId: string
    tipo: InventoryMovementType
    quantita: number
    daMagazzino: boolean
    userId: string
    motivo?: string
    note?: string
  },
) {
  const { magazzino, laboratorio } = await ensureLocations(tx)
  const origine = input.daMagazzino ? magazzino : laboratorio
  const destinazione = input.daMagazzino ? laboratorio : magazzino
  return tx.inventoryMovement.create({
    data: {
      variantId: input.variantId,
      tipo: input.tipo,
      quantita: input.quantita,
      locationFromId: input.tipo === 'trasferimento' ? origine.id : null,
      locationToId: input.tipo === 'trasferimento' ? destinazione.id : origine.id,
      createdBy: input.userId,
      motivo: input.motivo,
      note: input.note,
    },
  })
}

export type TransferDirezione = 'to_lab' | 'to_warehouse'

/**
 * Sposta quantità tra magazzino e laboratorio in una sola transazione.
 * Rifiuta la richiesta se l'ubicazione di partenza non ha abbastanza pezzi:
 * le quantità non possono mai diventare negative.
 */
export async function transferStock(
  variantId: string,
  direzione: TransferDirezione,
  quantita: number,
  userId: string,
  note?: string,
  motivo?: string,
) {
  if (quantita <= 0) throw badRequest('La quantità da trasferire deve essere maggiore di zero')

  return prisma.$transaction(async (tx) => {
    await bloccaRisorsa(tx, 'inventory_record', variantId)
    const record = await tx.inventoryRecord.findUnique({ where: { variantId } })
    if (!record) throw notFound('Record di inventario non trovato per questa variante')

    const versoLaboratorio = direzione === 'to_lab'
    const disponibile = versoLaboratorio ? record.qtaMagazzino : record.qtaLaboratorio
    if (quantita > disponibile) {
      throw badRequest(
        versoLaboratorio
          ? `In magazzino ci sono ${disponibile} pezzi: non se ne possono inviare ${quantita}`
          : `In laboratorio ci sono ${disponibile} pezzi: non se ne possono riportare ${quantita}`,
      )
    }

    const qtaMagazzino = record.qtaMagazzino + (versoLaboratorio ? -quantita : quantita)
    const qtaLaboratorio = record.qtaLaboratorio + (versoLaboratorio ? quantita : -quantita)
    // Un trasferimento sposta capi fra due giacenze interne: il totale non cambia, e con
    // esso non cambiano né lo stato né la divergenza Shopify.
    const calcolo = calcolaDisponibilita({ ...record, qtaMagazzino, qtaLaboratorio })
    const updated = await tx.inventoryRecord.update({
      where: { variantId },
      data: { qtaMagazzino, qtaLaboratorio, stato: calcolo.stato, divergenzaShopify: calcolo.divergenzaShopify },
    })
    // La variante segue il record (FR-03/FR-INV-01). `stockDisponibile` è il totale
    // magazzino + laboratorio: un trasferimento interno non cambia i capi disponibili.
    await tx.productVariant.update({
      where: { id: variantId },
      data: { stockDisponibile: calcolo.disponibileTotale, statoDisponibilita: calcolo.stato },
    })
    await logStockMovement(tx, {
      variantId, tipo: 'trasferimento', quantita, daMagazzino: versoLaboratorio, userId, note,
      motivo: motivo ?? (versoLaboratorio ? 'Reintegro laboratorio' : 'Rientro in magazzino'),
    })
    await logActivity(tx, {
      userId,
      azione: versoLaboratorio ? 'invio_laboratorio' : 'rientro_magazzino',
      entita: 'inventory_record',
      entitaId: record.id,
      valorePrecedente: `magazzino ${record.qtaMagazzino} · laboratorio ${record.qtaLaboratorio}`,
      valoreNuovo: `magazzino ${qtaMagazzino} · laboratorio ${qtaLaboratorio}`,
    })
    return updated
  })
}

export function listStockMovements(variantId: string) {
  return prisma.inventoryMovement.findMany({
    where: { variantId },
    orderBy: { createdAt: 'desc' },
    include: { locationFrom: true, locationTo: true, creatoDa: { select: { nome: true, email: true } } },
  })
}

// --- Capi in produzione: giacenza separata dal laboratorio (DEC-047) ---

/**
 * Avvia una lavorazione: i capi **escono dalla giacenza di laboratorio** e passano nella
 * giacenza "in produzione", che è una posizione a sé (DEC-047). In laboratorio si contano
 * solo capi finiti, quindi un capo ci rientra quando la lavorazione è terminata.
 */
export async function mandaInProduzione(
  variantId: string,
  input: { quantita: number; productId?: string; stepId?: string; note?: string },
  userId: string,
) {
  if (input.quantita <= 0) throw badRequest('La quantità da mandare in produzione deve essere maggiore di zero')

  return prisma.$transaction(async (tx) => {
    await bloccaRisorsa(tx, 'inventory_record', variantId)
    const record = await tx.inventoryRecord.findUnique({ where: { variantId } })
    if (!record) throw notFound('Record di inventario non trovato per questa variante')

    if (input.quantita > record.qtaLaboratorio) {
      throw badRequest(
        `In laboratorio ci sono ${record.qtaLaboratorio} pezzi: non se ne possono mandare in lavorazione ${input.quantita}.`,
      )
    }

    const qtaLaboratorio = record.qtaLaboratorio - input.quantita
    const calcolo = calcolaDisponibilita({ ...record, qtaLaboratorio })
    const creato = await tx.stockCommitment.create({
      data: { variantId, quantita: input.quantita, productId: input.productId, stepId: input.stepId, note: input.note, createdBy: userId },
    })
    // La giacenza di laboratorio cala: i capi non sono più lì come capi finiti.
    await tx.inventoryRecord.update({
      where: { variantId },
      data: { qtaLaboratorio, stato: calcolo.stato, divergenzaShopify: calcolo.divergenzaShopify },
    })
    await tx.productVariant.update({
      where: { id: variantId },
      data: { stockDisponibile: calcolo.disponibileTotale, statoDisponibilita: calcolo.stato },
    })
    await logStockMovement(tx, {
      variantId, tipo: 'scarico', quantita: input.quantita, daMagazzino: false, userId,
      motivo: 'Avvio lavorazione', note: input.note,
    })
    await logActivity(tx, {
      userId, azione: 'manda_in_produzione', entita: 'stock_commitment', entitaId: creato.id,
      valorePrecedente: `laboratorio ${record.qtaLaboratorio}`,
      valoreNuovo: `${input.quantita} pezzi in lavorazione · laboratorio ${qtaLaboratorio}`,
    })
    return creato
  })
}

/**
 * Chiude una lavorazione. In **entrambi** gli esiti i capi rientrano nella giacenza di
 * laboratorio, perché da lì erano usciti all'avvio (DEC-047): `terminato` significa che il
 * capo è finito ed è tornato disponibile, `annullato` che la lavorazione è decaduta e i
 * capi rientrano com'erano. Cambia il significato, non l'aritmetica — ed è la ragione per
 * cui i due esiti restano distinti nello storico.
 */
export async function chiudiLavorazione(
  id: string,
  esito: 'terminato' | 'annullato',
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const lavorazione = await tx.stockCommitment.findUnique({ where: { id } })
    if (!lavorazione) throw notFound('Lavorazione non trovata')
    if (lavorazione.stato !== 'in_produzione') {
      throw badRequest(`Questa lavorazione risulta già ${lavorazione.stato}.`)
    }

    await bloccaRisorsa(tx, 'inventory_record', lavorazione.variantId)
    const record = await tx.inventoryRecord.findUnique({ where: { variantId: lavorazione.variantId } })
    if (!record) throw notFound('Record di inventario non trovato')

    const qtaLaboratorio = record.qtaLaboratorio + lavorazione.quantita
    const calcolo = calcolaDisponibilita({ ...record, qtaLaboratorio })
    await tx.stockCommitment.update({
      where: { id },
      data: { stato: esito, chiusoIl: new Date() },
    })
    await tx.inventoryRecord.update({
      where: { variantId: lavorazione.variantId },
      data: { qtaLaboratorio, stato: calcolo.stato, divergenzaShopify: calcolo.divergenzaShopify },
    })
    await tx.productVariant.update({
      where: { id: lavorazione.variantId },
      data: { stockDisponibile: calcolo.disponibileTotale, statoDisponibilita: calcolo.stato },
    })
    await logStockMovement(tx, {
      variantId: lavorazione.variantId, tipo: 'carico', quantita: lavorazione.quantita,
      daMagazzino: false, userId,
      motivo: esito === 'terminato' ? 'Lavorazione terminata' : 'Lavorazione annullata',
      note: lavorazione.note ?? undefined,
    })
    await logActivity(tx, {
      userId, azione: esito === 'terminato' ? 'termina_lavorazione' : 'annulla_lavorazione',
      entita: 'stock_commitment', entitaId: id,
      valorePrecedente: `laboratorio ${record.qtaLaboratorio}`,
      valoreNuovo: `${lavorazione.quantita} pezzi rientrati in laboratorio (${esito}) · laboratorio ${qtaLaboratorio}`,
    })
    return { id, stato: esito }
  })
}

// Accetta il client della transazione in corso: chiamata da dentro una transazione deve
// leggere ciò che quella transazione sta vedendo, non lo stato esterno.
async function sommaInProduzione(variantId: string, db: Db = prisma): Promise<number> {
  const somma = await db.stockCommitment.aggregate({
    where: { variantId, stato: 'in_produzione' },
    _sum: { quantita: true },
  })
  return somma._sum.quantita ?? 0
}

/**
 * Vista di dettaglio del laboratorio per una variante: quanto c'è di finito, cosa è
 * arrivato dal magazzino, cosa è uscito verso una lavorazione e cosa è in lavorazione
 * adesso (giacenza a sé, DEC-047).
 */
export async function getLabDetail(variantId: string) {
  const record = await prisma.inventoryRecord.findUnique({
    where: { variantId },
    include: { variant: { include: { product: true } } },
  })
  if (!record) throw notFound('Record di inventario non trovato per questa variante')

  const [movimenti, lavorazioni] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { locationFrom: true, locationTo: true, creatoDa: { select: { nome: true, email: true } } },
    }),
    prisma.stockCommitment.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { product: { select: { nome: true, codiceProdotto: true } }, creatoDa: { select: { nome: true, email: true } } },
    }),
  ])

  const inProduzione = lavorazioni.filter((i) => i.stato === 'in_produzione')
  const qtaInProduzione = inProduzione.reduce((s, i) => s + i.quantita, 0)

  return {
    variantId,
    sku: record.variant.sku,
    prodotto: record.variant.product?.nome ?? '',
    taglia: record.variant.taglia,
    colore: record.variant.colore,
    qtaLaboratorio: record.qtaLaboratorio,
    qtaMagazzino: record.qtaMagazzino,
    disponibileTotale: record.qtaMagazzino + record.qtaLaboratorio,
    qtaInProduzione,
    // I capi in lavorazione sono già usciti dalla giacenza (DEC-047): quella di laboratorio
    // è tutta utilizzabile.
    disponibileInLaboratorio: record.qtaLaboratorio,
    sogliaMinimaLaboratorio: record.sogliaMinimaLaboratorio,
    sottoSoglia:
      record.migrazioneCompletata &&
      record.sogliaMinimaLaboratorio > 0 &&
      record.qtaLaboratorio < record.sogliaMinimaLaboratorio,
    ...statoMigrazione(record),
    migrazioneCompletata: record.migrazioneCompletata,
    reintegro: calcolaReintegro(record),
    movimenti,
    // Reintegri = arrivi dal magazzino; uscite = capi partiti verso una lavorazione.
    reintegri: movimenti.filter((m) => m.tipo === 'trasferimento' && m.locationTo?.codice === LOCATION_LABORATORIO),
    usciteLavorazione: movimenti.filter((m) => m.tipo === 'scarico'),
    inProduzione,
    storicoLavorazioni: lavorazioni.filter((i) => i.stato !== 'in_produzione'),
  }
}

export interface InventoryPatch {
  qtaMagazzino?: number
  qtaLaboratorio?: number
  qtaRiservata?: number
  qtaVenduta?: number
  sogliaMinima?: number
  sogliaMinimaLaboratorio?: number
}

/**
 * Finché la distribuzione iniziale non è confermata, scrivere una quantità in un'ubicazione
 * è ambiguo (capi già compresi nel totale o capi mai contati?): deve passare da
 * `migrationAdjust`, dove il significato viene dichiarato. Soglie e riservato restano
 * modificabili: non spostano capi.
 *
 * Vive qui in un posto solo perché le quantità si possono scrivere da **due** rotte —
 * `PATCH /inventory/:id` e `PATCH /variants/:id/quantities`. Finché il controllo stava
 * dentro la prima, la seconda lasciava aggirare la domanda scrivendo dal dettaglio prodotto.
 */
export function verificaMigrazione(
  before: { qtaMagazzino: number; qtaLaboratorio: number; migrazioneCompletata: boolean },
  patch: { qtaMagazzino?: number; qtaLaboratorio?: number },
) {
  if (before.migrazioneCompletata) return
  const cambiaQuantita =
    (patch.qtaMagazzino !== undefined && patch.qtaMagazzino !== before.qtaMagazzino) ||
    (patch.qtaLaboratorio !== undefined && patch.qtaLaboratorio !== before.qtaLaboratorio)
  if (!cambiaQuantita) return
  throw badRequest(
    'Questa variante è ancora in distribuzione iniziale: usa "Sistema la distribuzione" per dire se i capi erano già compresi nel totale o vanno aggiunti.',
  )
}

export async function updateInventoryRecord(id: string, patch: InventoryPatch, userId: string) {
  const before = await prisma.inventoryRecord.findUnique({ where: { id } })
  if (!before) throw notFound('Record di inventario non trovato')

  verificaMigrazione(before, patch)

  const qtaMagazzino = patch.qtaMagazzino ?? before.qtaMagazzino
  const qtaLaboratorio = patch.qtaLaboratorio ?? before.qtaLaboratorio
  const qtaRiservata = patch.qtaRiservata ?? before.qtaRiservata
  const sogliaMinima = patch.sogliaMinima ?? before.sogliaMinima
  const calcolo = calcolaDisponibilita({ qtaMagazzino, qtaLaboratorio, sogliaMinima, stockShopify: before.stockShopify })

  return prisma.$transaction(async (tx) => {
    const updated = await tx.inventoryRecord.update({
      where: { id },
      data: {
        qtaMagazzino,
        qtaLaboratorio,
        qtaRiservata,
        qtaVenduta: patch.qtaVenduta ?? before.qtaVenduta,
        sogliaMinima,
        sogliaMinimaLaboratorio: patch.sogliaMinimaLaboratorio ?? before.sogliaMinimaLaboratorio,
        stato: calcolo.stato,
        divergenzaShopify: calcolo.divergenzaShopify,
      },
    })
    // La variante segue il record: sono due facce dello stesso dato (FR-03/FR-INV-01).
    await tx.productVariant.update({
      where: { id: before.variantId },
      data: {
        stockDisponibile: calcolo.disponibileTotale,
        stockRiservato: qtaRiservata,
        statoDisponibilita: calcolo.stato,
      },
    })
    await registraRettifiche(tx, before.variantId, before, { qtaMagazzino, qtaLaboratorio }, userId)
    await logActivity(tx, {
      userId, azione: 'update', entita: 'inventory_record', entitaId: id,
      valorePrecedente: `magazzino ${before.qtaMagazzino} · laboratorio ${before.qtaLaboratorio}`,
      valoreNuovo: `magazzino ${qtaMagazzino} · laboratorio ${patch.qtaLaboratorio ?? before.qtaLaboratorio}`,
    })
    return updated
  })
}

/** Una modifica manuale delle quantità entra nello storico come rettifica, per ubicazione. */
export async function registraRettifiche(
  tx: Prisma.TransactionClient,
  variantId: string,
  prima: { qtaMagazzino: number; qtaLaboratorio: number },
  dopo: { qtaMagazzino: number; qtaLaboratorio: number },
  userId: string,
) {
  const deltaMagazzino = dopo.qtaMagazzino - prima.qtaMagazzino
  const deltaLaboratorio = dopo.qtaLaboratorio - prima.qtaLaboratorio
  if (deltaMagazzino !== 0) {
    await logStockMovement(tx, {
      variantId, tipo: 'rettifica', quantita: deltaMagazzino, daMagazzino: true, userId,
      note: `Modifica manuale magazzino: ${prima.qtaMagazzino} → ${dopo.qtaMagazzino}`,
    })
  }
  if (deltaLaboratorio !== 0) {
    await logStockMovement(tx, {
      variantId, tipo: 'rettifica', quantita: deltaLaboratorio, daMagazzino: false, userId,
      note: `Modifica manuale laboratorio: ${prima.qtaLaboratorio} → ${dopo.qtaLaboratorio}`,
    })
  }
}
