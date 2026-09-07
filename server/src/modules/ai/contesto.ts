// Il contesto che l'AI Assistant riceve: i dati veri del gestionale, filtrati dai permessi
// di chi sta chiedendo (2026-09-07).
//
// **Perché questo file esiste.** L'AI Assistant era una pagina che riconosceva quattro
// frasi con una catena di `if` sul testo della domanda e rispondeva con frasi scritte a
// mano — compresi due identificativi di prodotto del prototipo (`prod-05`, `prod-06`) che
// nel database non esistono più. Non leggeva niente: sembrava un assistente e non lo era.
//
// Qui c'è l'altra metà del problema, quella che vale a prescindere da quale modello si
// userà: **cosa mandare**. Un modello linguistico non ha accesso al database, e mandargli
// tutto sarebbe insieme costoso, lento e pericoloso. Serve una fotografia:
//
//   1. **compatta** — numeri e righe già aggregate, non tabelle intere;
//   2. **vera** — calcolata dalle stesse funzioni che alimentano le pagine (margini,
//      giacenze, alert), così l'assistente non può dire un numero diverso da quello che
//      si legge a schermo;
//   3. **filtrata dai permessi** — chi non vede Costi e margini non deve poter aggirare
//      il divieto chiedendolo all'assistente. Il filtro è **qui**, alla fonte: i dati
//      esclusi non entrano nel contesto, quindi non partono nemmeno verso OpenAI.
//
// Il punto 3 è la ragione per cui questo non è un dettaglio di interfaccia. Un assistente
// che legge il database è un canale di lettura come tutti gli altri, e passa dalla stessa
// matrice dei permessi.
import type { Role } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { canAccessModule } from '../../core/permissions.js'
import { computeAllMargins, riepilogoCostiFissi } from '../margins/service.js'
import { FASI_PIPELINE, stageLabel } from '../production/service.js'
import { campiMancanti } from '../suppliers/service.js'

const r2 = (n: number) => Math.round(n * 100) / 100

/** Quante righe al massimo per elenco: il contesto deve restare leggibile e poco costoso. */
const MAX_RIGHE = 15

export interface ContestoApp {
  generatoIl: string
  ruolo: Role
  /** Moduli che questo ruolo non vede: elencati perché l'AI possa dirlo invece di tacere. */
  sezioniNonVisibili: string[]
  azienda: { prodotti: number; varianti: number; fornitori: number; clienti: number }
  inventario?: ContestoInventario
  produzione?: ContestoProduzione
  economia?: ContestoEconomia
  fornitori?: ContestoFornitori
  anomalie: Anomalia[]
}

export interface ContestoInventario {
  capiInMagazzino: number
  capiInLaboratorio: number
  capiInLavorazione: number
  capiDisponibili: number
  varianteEsaurite: number
  /** Varianti sotto la soglia minima o esaurite, dalla più critica. */
  stockBasso: { sku: string; prodotto: string; taglia: string; colore: string; disponibile: number; soglia: number; stato: string }[]
  laboratorioDaReintegrare: { sku: string; prodotto: string; inLaboratorio: number; sogliaLaboratorio: number }[]
  materialiSottoSoglia: { nome: string; codice: string; stato: string; disponibile: number; soglia: number; unita: string }[]
  accessoriSottoSoglia: { nome: string; codice: string; stato: string; disponibile: number; soglia: number; unita: string }[]
  /** Il valore dello stock, nei due modi in cui ha senso chiederlo. */
  valore: {
    aPrezzoDiVendita: number
    aCostoDiretto: number
    /** Capi le cui varianti non hanno un costo diretto: il valore a costo li esclude. */
    capiSenzaCosto: number
    nota: string
  }
}

export interface ContestoProduzione {
  inPipeline: number
  perFase: { fase: string; capi: number }[]
  capi: { nome: string; codice: string; fase: string; schedaTecnica: boolean; campioneApprovato: boolean; bloccata: boolean }[]
  fuoriPipeline: number
  nota: string
}

export interface ContestoEconomia {
  sogliaMarginePercent: number
  quotaPerCapo: number
  quotaCalcolabile: boolean
  costiFissiAnnui: number
  costiFissiMensili: number
  vociCostoFissoPrincipali: { nome: string; importoAnnuo: number; percentuale: number }[]
  prodottiSottoSoglia: number
  prodottiInPerdita: number
  marginiPeggiori: { prodotto: string; marginePercentuale: number; prezzoNettoIva: number; costoTotale: number; sottoSoglia: boolean }[]
  senzaCostoDiretto: number
  nota: string
}

export interface ContestoFornitori {
  totale: number
  completi: number
  incompleti: { nome: string; categoria: string; mancano: string[] }[]
}

export interface Anomalia {
  chiave: string
  gravita: 'critica' | 'attenzione'
  quanti: number
  descrizione: string
  dove: string
}

/**
 * Costruisce la fotografia. Ogni sezione è dietro il permesso del modulo a cui appartiene:
 * assente significa «non visibile a questo ruolo», ed è diverso da «vuoto».
 */
export async function costruisciContesto(role: Role): Promise<ContestoApp> {
  const [vedeInventario, vedeProduzione, vedeEconomia, vedeFornitori, vedeProdotti] = await Promise.all([
    canAccessModule(role, 'inventario'),
    canAccessModule(role, 'produzione'),
    canAccessModule(role, 'costi-margini'),
    canAccessModule(role, 'fornitori'),
    canAccessModule(role, 'prodotti'),
  ])

  const [prodotti, varianti, numeroFornitori, numeroClienti] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.supplier.count(),
    prisma.customer.count(),
  ])

  const contesto: ContestoApp = {
    generatoIl: new Date().toISOString(),
    ruolo: role,
    sezioniNonVisibili: [
      ...(vedeInventario ? [] : ['inventario']),
      ...(vedeProduzione ? [] : ['produzione']),
      ...(vedeEconomia ? [] : ['costi e margini']),
      ...(vedeFornitori ? [] : ['fornitori']),
    ],
    azienda: { prodotti, varianti, fornitori: numeroFornitori, clienti: numeroClienti },
    anomalie: [],
  }

  if (vedeInventario) contesto.inventario = await sezioneInventario()
  if (vedeProduzione) contesto.produzione = await sezioneProduzione()
  if (vedeEconomia) contesto.economia = await sezioneEconomia()
  if (vedeFornitori) contesto.fornitori = await sezioneFornitori()
  contesto.anomalie = await sezioneAnomalie({ vedeEconomia, vedeFornitori, vedeInventario, vedeProdotti })

  return contesto
}

async function sezioneInventario(): Promise<ContestoInventario> {
  const [records, materials, accessories, margini, lavorazioni] = await Promise.all([
    prisma.inventoryRecord.findMany({ include: { variant: { include: { product: true } } } }),
    prisma.material.findMany({ where: { stato: { in: ['sotto_soglia', 'esaurito'] } } }),
    prisma.accessory.findMany({ where: { stato: { in: ['sotto_soglia', 'esaurito'] } } }),
    computeAllMargins(),
    // I capi in lavorazione sono una giacenza a sé (DEC-047) e non stanno su
    // `inventory_records`: si contano dagli impegni aperti, come fa inventory/service.ts.
    prisma.stockCommitment.aggregate({ where: { stato: 'in_produzione' }, _sum: { quantita: true } }),
  ])

  const costoPerProdotto = new Map(margini.map((m) => [m.productId, m.costoDiretto]))

  let aPrezzo = 0
  let aCosto = 0
  const senzaCosto = new Set<string>()
  for (const r of records) {
    const prodotto = r.variant?.product
    if (!prodotto) continue
    // Il valore si calcola sui capi **in casa**: magazzino più laboratorio. I capi in
    // lavorazione sono fuori (DEC-047) e i venduti non sono più stock.
    const pezzi = r.qtaMagazzino + r.qtaLaboratorio
    if (pezzi <= 0) continue
    aPrezzo += pezzi * Number(prodotto.prezzoNettoIva)
    const costo = costoPerProdotto.get(prodotto.id) ?? 0
    if (costo > 0) aCosto += pezzi * costo
    else senzaCosto.add(prodotto.id)
  }

  const stockBasso = records
    .filter((r) => r.stato === 'esaurito' || r.stato === 'low_stock')
    .sort((a, b) => (a.stato === 'esaurito' ? -1 : 1) - (b.stato === 'esaurito' ? -1 : 1))
    .slice(0, MAX_RIGHE)
    .map((r) => ({
      sku: r.variant?.sku ?? '—',
      prodotto: r.variant?.product?.nome ?? '—',
      taglia: r.variant?.taglia ?? '—',
      colore: r.variant?.colore ?? '—',
      disponibile: r.qtaMagazzino + r.qtaLaboratorio,
      soglia: r.sogliaMinima,
      stato: r.stato,
    }))

  const daReintegrare = records
    .filter((r) => r.migrazioneCompletata && r.qtaLaboratorio < r.sogliaMinimaLaboratorio)
    .slice(0, MAX_RIGHE)
    .map((r) => ({
      sku: r.variant?.sku ?? '—',
      prodotto: r.variant?.product?.nome ?? '—',
      inLaboratorio: r.qtaLaboratorio,
      sogliaLaboratorio: r.sogliaMinimaLaboratorio,
    }))

  return {
    capiInMagazzino: records.reduce((s, r) => s + r.qtaMagazzino, 0),
    capiInLaboratorio: records.reduce((s, r) => s + r.qtaLaboratorio, 0),
    capiInLavorazione: lavorazioni._sum.quantita ?? 0,
    capiDisponibili: records.reduce((s, r) => s + r.qtaMagazzino + r.qtaLaboratorio, 0),
    varianteEsaurite: records.filter((r) => r.stato === 'esaurito').length,
    stockBasso,
    laboratorioDaReintegrare: daReintegrare,
    materialiSottoSoglia: materials.slice(0, MAX_RIGHE).map((m) => ({
      nome: m.nome, codice: m.codice, stato: m.stato,
      disponibile: r2(Number(m.metriAcquistati) - Number(m.metriUtilizzati)),
      soglia: Number(m.sogliaMinima), unita: m.unitaMisura,
    })),
    accessoriSottoSoglia: accessories.slice(0, MAX_RIGHE).map((a) => ({
      nome: a.nome, codice: a.codice, stato: a.stato,
      disponibile: r2(Number(a.quantitaAcquistata) - Number(a.quantitaUtilizzata)),
      soglia: Number(a.sogliaMinima), unita: a.unitaMisura,
    })),
    valore: {
      aPrezzoDiVendita: r2(aPrezzo),
      aCostoDiretto: r2(aCosto),
      capiSenzaCosto: senzaCosto.size,
      nota:
        'Valore dei capi in casa (magazzino + laboratorio). I capi in lavorazione esterna non sono contati. ' +
        'Il valore a costo esclude i capi senza costo diretto in scheda tecnica.',
    },
  }
}

async function sezioneProduzione(): Promise<ContestoProduzione> {
  const [inPipeline, fuori] = await Promise.all([
    prisma.product.findMany({
      where: { stato: { in: FASI_PIPELINE } },
      include: {
        technicalSheets: { where: { archiviata: false }, select: { id: true } },
        productionSteps: { orderBy: { createdAt: 'desc' }, take: 1, select: { bloccata: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.product.count({ where: { stato: { notIn: FASI_PIPELINE } } }),
  ])

  const perFase = new Map<string, number>()
  for (const p of inPipeline) perFase.set(p.stato, (perFase.get(p.stato) ?? 0) + 1)

  return {
    inPipeline: inPipeline.length,
    perFase: [...perFase.entries()].map(([fase, capi]) => ({ fase: stageLabel(fase as never), capi })),
    capi: inPipeline.slice(0, MAX_RIGHE).map((p) => ({
      nome: p.nome,
      codice: p.codiceProdotto,
      fase: stageLabel(p.stato),
      schedaTecnica: p.technicalSheets.length > 0,
      campioneApprovato: p.campioneApprovatoIl !== null,
      bloccata: p.productionSteps[0]?.bloccata ?? false,
    })),
    fuoriPipeline: fuori,
    nota:
      'Sono in produzione SOLO i capi elencati qui: quelli che stanno attraversando una lavorazione. ' +
      `Gli altri ${fuori} capi hanno finito la produzione e stanno nello stock — non vanno mai descritti come «in produzione».`,
  }
}

async function sezioneEconomia(): Promise<ContestoEconomia> {
  const [margini, costiFissi, soglia] = await Promise.all([
    computeAllMargins(),
    riepilogoCostiFissi(),
    prisma.appSetting.findUnique({ where: { chiave: 'soglia_margine_percent' } }),
  ])

  // Un capo senza costo diretto in scheda ha margine «100%», che è falso: non è un capo
  // redditizio, è un capo di cui non si conosce il costo. Va tenuto fuori dalla classifica
  // dei margini peggiori, altrimenti la domanda «qual è il margine più basso» riceve una
  // risposta calcolata su un dato che non c'è.
  const conCosto = margini.filter((m) => m.costoDiretto > 0)
  const senzaCosto = margini.length - conCosto.length

  return {
    sogliaMarginePercent: Number(soglia?.valore ?? 35),
    quotaPerCapo: costiFissi.quotaPerCapo,
    quotaCalcolabile: costiFissi.quotaCalcolabile,
    costiFissiAnnui: costiFissi.totaleAnnuo,
    costiFissiMensili: costiFissi.totaleMensile,
    vociCostoFissoPrincipali: costiFissi.voci.slice(0, 5).map((v) => ({
      nome: v.nome, importoAnnuo: v.importoAnnuo, percentuale: v.percentuale,
    })),
    prodottiSottoSoglia: conCosto.filter((m) => m.sottoSoglia).length,
    prodottiInPerdita: conCosto.filter((m) => m.margineNettoStimato < 0).length,
    marginiPeggiori: [...conCosto]
      .sort((a, b) => a.marginePercentuale - b.marginePercentuale)
      .slice(0, MAX_RIGHE)
      .map((m) => ({
        prodotto: m.nome,
        marginePercentuale: m.marginePercentuale,
        prezzoNettoIva: m.prezzoNettoIva,
        costoTotale: m.costoTotale,
        sottoSoglia: m.sottoSoglia,
      })),
    senzaCostoDiretto: senzaCosto,
    nota:
      `${senzaCosto} capi non hanno un costo diretto in scheda tecnica: per loro il margine NON è calcolabile ` +
      'e sono esclusi dalla classifica. Non vanno descritti come capi ad alto margine.' +
      (costiFissi.quotaCalcolabile
        ? ''
        : ' Attenzione: «capi prodotti annui» non è impostato, quindi la quota di costi fissi per capo è zero e tutti i margini risultano più alti del reale.'),
  }
}

async function sezioneFornitori(): Promise<ContestoFornitori> {
  const fornitori = await prisma.supplier.findMany({ orderBy: { nome: 'asc' } })
  const conMancanti = fornitori
    .map((f) => ({ f, mancano: campiMancanti(f as unknown as Record<string, unknown>) }))
    .filter((x) => x.mancano.length > 0)

  return {
    totale: fornitori.length,
    completi: fornitori.length - conMancanti.length,
    incompleti: conMancanti
      // Prima chi ha più buchi: è lì che manca di più per poter lavorare.
      .sort((a, b) => b.mancano.length - a.mancano.length)
      .slice(0, MAX_RIGHE)
      .map((x) => ({ nome: x.f.nome, categoria: x.f.categoria, mancano: x.mancano.map((m) => m.etichetta) })),
  }
}

/**
 * Anomalie: dati incoerenti o mancanti che rendono sbagliato un altro numero.
 * Non sono «alert operativi» (quelli hanno già la loro pagina): sono i punti in cui il
 * database dice qualcosa che non può essere vero, o non dice ciò che serve per calcolare.
 */
async function sezioneAnomalie(visibilita: {
  vedeEconomia: boolean
  vedeFornitori: boolean
  vedeInventario: boolean
  vedeProdotti: boolean
}): Promise<Anomalia[]> {
  const anomalie: Anomalia[] = []

  if (visibilita.vedeProdotti) {
    const [senzaPrezzo, senzaScheda, senzaVarianti] = await Promise.all([
      prisma.product.count({
        where: { stato: { notIn: ['idea', 'archivio'] }, prezzoVendita: { lte: 0 } },
      }),
      prisma.product.count({
        where: { stato: { notIn: ['idea', 'archivio'] }, technicalSheets: { none: { archiviata: false } } },
      }),
      prisma.product.count({
        where: { stato: { notIn: ['idea', 'archivio'] }, variants: { none: {} } },
      }),
    ])
    if (senzaPrezzo > 0) {
      anomalie.push({
        chiave: 'prodotti_senza_prezzo', gravita: 'critica', quanti: senzaPrezzo,
        descrizione: 'capi attivi senza prezzo di vendita: non sono vendibili e falsano ogni calcolo di margine',
        dove: 'Anagrafica prodotti',
      })
    }
    if (senzaScheda > 0) {
      anomalie.push({
        chiave: 'prodotti_senza_scheda', gravita: 'attenzione', quanti: senzaScheda,
        descrizione: 'capi attivi senza scheda tecnica: senza scheda non esiste il costo diretto',
        dove: 'Anagrafica prodotti → scheda tecnica',
      })
    }
    if (senzaVarianti > 0) {
      anomalie.push({
        chiave: 'prodotti_senza_varianti', gravita: 'attenzione', quanti: senzaVarianti,
        descrizione: 'capi attivi senza nessuna variante taglia/colore: non possono avere giacenza',
        dove: 'Anagrafica prodotti → varianti',
      })
    }
  }

  if (visibilita.vedeInventario) {
    const [daDistribuire, negativi] = await Promise.all([
      prisma.inventoryRecord.count({ where: { migrazioneCompletata: false } }),
      prisma.inventoryRecord.count({ where: { OR: [{ qtaMagazzino: { lt: 0 } }, { qtaLaboratorio: { lt: 0 } }] } }),
    ])
    if (negativi > 0) {
      anomalie.push({
        chiave: 'giacenze_negative', gravita: 'critica', quanti: negativi,
        descrizione: 'varianti con giacenza negativa: un movimento è stato registrato due volte o al contrario',
        dove: 'Inventario → prodotti finiti',
      })
    }
    if (daDistribuire > 0) {
      anomalie.push({
        chiave: 'distribuzione_iniziale', gravita: 'attenzione', quanti: daDistribuire,
        descrizione:
          'varianti con la distribuzione iniziale non confermata: i pezzi risultano tutti in laboratorio ' +
          'anche se parte è in magazzino',
        dove: 'Inventario → prodotti finiti',
      })
    }
  }

  if (visibilita.vedeEconomia) {
    const margini = await computeAllMargins()
    const senzaCosto = margini.filter((m) => m.costoDiretto <= 0).length
    if (senzaCosto > 0) {
      anomalie.push({
        chiave: 'costo_diretto_mancante', gravita: 'critica', quanti: senzaCosto,
        descrizione: 'capi senza costo diretto: il loro margine non è calcolabile e risulterebbe del 100%',
        dove: 'Costi e margini',
      })
    }
    const quota = await riepilogoCostiFissi()
    if (!quota.quotaCalcolabile) {
      anomalie.push({
        chiave: 'capi_annui_mancante', gravita: 'critica', quanti: 1,
        descrizione:
          'l\'impostazione «capi prodotti annui» non è valorizzata: la quota di costi fissi per capo vale zero ' +
          'e tutti i margini risultano più alti di quanto sono',
        dove: 'Costi e margini → parametri di calcolo',
      })
    }
    const nonAssociate = await prisma.invoice.count({ where: { associata: false } })
    if (nonAssociate > 0) {
      anomalie.push({
        chiave: 'fatture_non_associate', gravita: 'attenzione', quanti: nonAssociate,
        descrizione: 'fatture non collegate a prodotti o materiali: il loro costo non entra in nessun margine',
        dove: 'Fatture',
      })
    }
  }

  if (visibilita.vedeFornitori) {
    const fornitori = await prisma.supplier.findMany()
    const senzaEmail = fornitori.filter((f) => !f.email?.trim()).length
    if (senzaEmail > 0) {
      anomalie.push({
        chiave: 'fornitori_senza_email', gravita: 'attenzione', quanti: senzaEmail,
        descrizione: 'fornitori senza email: le richieste di riordino verso di loro non possono partire',
        dove: 'Fornitori',
      })
    }
  }

  const rank = { critica: 0, attenzione: 1 }
  return anomalie.sort((a, b) => rank[a.gravita] - rank[b.gravita])
}
