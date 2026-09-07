// FR-05 / FR-07 — pipeline di produzione con gating server-side.
// Porting fedele di src/lib/production.ts (prototipo frontend): l'autorita del blocco
// vive qui, il client replica la regola solo per disabilitare il pulsante.
import type { ProductStage } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'

// Ordine delle fasi: stesso di PRODUCT_STAGES in src/types (client). È **questa** la
// sequenza autorevole, non l'ordine interno dell'enum Postgres, che è storico.
//
// 2026-09-07 — il percorso di un capo è diviso in due tratti, e la divisione non è
// grafica: decide chi sta nella pipeline e chi no.
//
//   idea → … → produzione        lavorazione in corso: è QUI che vive la pipeline
//   completato                   la produzione è finita, il capo è nello stock
//   foto_contenuti → … → archivio  lavoro commerciale su un capo già prodotto
//
// «In vendita» non è più una fase (vedi la migrazione 20260907140000): essere in vendita
// è il risultato di giacenza più attributi commerciali, non una lavorazione che qualcuno
// esegue. Il valore è stato rinominato in `completato`, che dice l'unica cosa vera del
// momento in cui un capo esce dalla pipeline.
export const PRODUCT_STAGES: { id: ProductStage; label: string }[] = [
  { id: 'idea', label: 'Idea' },
  { id: 'concept', label: 'Concept' },
  { id: 'sviluppo_modello', label: 'Sviluppo modello' },
  { id: 'scelta_tessuto', label: 'Scelta tessuto' },
  { id: 'scelta_accessori', label: 'Scelta accessori' },
  { id: 'prototipo', label: 'Prototipo' },
  { id: 'campionario', label: 'Campionario' },
  { id: 'produzione', label: 'Produzione' },
  { id: 'completato', label: 'Produzione completata' },
  { id: 'foto_contenuti', label: 'Foto e contenuti' },
  { id: 'scheda_ecommerce', label: 'Scheda e-commerce' },
  { id: 'pubblicato_shopify', label: 'Pubblicato su Shopify' },
  { id: 'archivio', label: 'Archivio' },
]

/**
 * Le fasi che stanno nella pipeline di produzione: quelle in cui c'è una lavorazione in
 * corso. Un capo che le ha superate è finito, è entrato nello stock ed è consultabile
 * dall'inventario e dall'anagrafica — dalla pipeline esce.
 */
export const FASI_PIPELINE: ProductStage[] = [
  'idea', 'concept', 'sviluppo_modello', 'scelta_tessuto', 'scelta_accessori',
  'prototipo', 'campionario', 'produzione',
]

/** Ultima fase della pipeline: chi la completa esce. */
export const ULTIMA_FASE_PIPELINE: ProductStage = 'produzione'

/** Prima fase fuori dalla pipeline: il capo è prodotto e disponibile allo stock. */
export const FASE_USCITA_PIPELINE: ProductStage = 'completato'

export function inPipeline(fase: ProductStage): boolean {
  return FASI_PIPELINE.includes(fase)
}

// FR-07: blocco se mancano dati critici. La scheda tecnica preliminare nasce prima della
// produzione (FR-14), quindi deve esistere gia all'ingresso in prototipo/campionario.
const STAGES_REQUIRING_TECH_SHEET: ProductStage[] = ['prototipo', 'campionario', 'produzione']

export function stageLabel(stage: ProductStage): string {
  return PRODUCT_STAGES.find((s) => s.id === stage)?.label ?? stage
}

export function nextStage(current: ProductStage): ProductStage | null {
  const idx = PRODUCT_STAGES.findIndex((s) => s.id === current)
  if (idx === -1 || idx === PRODUCT_STAGES.length - 1) return null
  return PRODUCT_STAGES[idx + 1].id
}

export interface AdvanceCheck {
  ok: boolean
  next: ProductStage | null
  reason?: string
}

export async function checkAdvance(productId: string): Promise<AdvanceCheck> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      technicalSheets: {
        where: { archiviata: false },
        include: {
          tessutoPrincipale: true,
          materiali: { include: { material: true } },
          accessori: { include: { accessory: true } },
        },
      },
    },
  })
  if (!product) throw notFound('Prodotto non trovato')

  const next = nextStage(product.stato)
  if (!next) return { ok: false, next: null, reason: "Il prodotto ha gia raggiunto l'ultima fase della pipeline." }

  const sheets = product.technicalSheets
  if (STAGES_REQUIRING_TECH_SHEET.includes(next) && sheets.length === 0) {
    return { ok: false, next, reason: `Scheda tecnica assente: impossibile avanzare a "${stageLabel(next)}".` }
  }

  // FR-05: materiale o accessorio esaurito blocca l'ingresso in Produzione.
  if (next === 'produzione' && sheets.length > 0) {
    const sheet = sheets.find((s) => s.versione === 'finale') ?? sheets[sheets.length - 1]
    const materiali = [
      ...(sheet.tessutoPrincipale ? [sheet.tessutoPrincipale] : []),
      ...sheet.materiali.map((m) => m.material),
    ]
    const esauritoMat = materiali.find((m) => m.stato === 'esaurito')
    if (esauritoMat) {
      return { ok: false, next, reason: `Materiale non disponibile (${esauritoMat.nome} esaurito): impossibile avanzare a "Produzione".` }
    }
    const esauritoAcc = sheet.accessori.map((a) => a.accessory).find((a) => a.stato === 'esaurito')
    if (esauritoAcc) {
      return { ok: false, next, reason: `Accessorio non disponibile (${esauritoAcc.nome} esaurito): impossibile avanzare a "Produzione".` }
    }
  }

  // Backlog "Note" §6: in produzione si entra solo dopo che il campione è stato
  // ricevuto, controllato e approvato — non basta più che esista la scheda tecnica.
  if (next === 'produzione' && !product.campioneApprovatoIl) {
    return {
      ok: false,
      next,
      reason: 'Campione non ancora approvato: usa "Approva campione e avvia produzione" nella scheda prodotto.',
    }
  }

  return { ok: true, next }
}

/** Cosa deve esserci prima di poter approvare il campione (backlog "Note" §6). */
export interface RequisitoCampione {
  chiave: 'scheda_tecnica' | 'misure' | 'documentazione_modellista' | 'piazzamento'
  etichetta: string
  soddisfatto: boolean
  dettaglio?: string
}

export async function checkRequisitiCampione(productId: string): Promise<{
  requisiti: RequisitoCampione[]
  approvabile: boolean
  giaApprovato: boolean
}> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      technicalSheets: { where: { archiviata: false }, include: { misure: true } },
      patternDocuments: true,
    },
  })
  if (!product) throw notFound('Prodotto non trovato')

  const sheets = product.technicalSheets
  const documenti = product.patternDocuments
  const piazzamenti = documenti.filter((d) => d.tipologia === 'piazzamento')

  const requisiti: RequisitoCampione[] = ([
    {
      chiave: 'scheda_tecnica',
      etichetta: 'Scheda tecnica compilata',
      soddisfatto: sheets.length > 0,
      dettaglio: sheets.length === 0 ? 'Nessuna scheda tecnica per questo prodotto.' : undefined,
    },
    {
      chiave: 'misure',
      etichetta: 'Misure tecniche indicate',
      soddisfatto: sheets.some((s) => s.misure.length > 0),
      dettaglio: 'Aggiungi le misure nella scheda tecnica (anche con "Suggerisci misure con AI").',
    },
    {
      chiave: 'documentazione_modellista',
      etichetta: 'Documentazione della modellista ricevuta',
      soddisfatto: documenti.length > 0,
      dettaglio: 'Carica cartamodello, scheda misure o revisione nella sezione Modellista.',
    },
    {
      // Il piazzamento non serve a ogni capo: se non ne è stato caricato nessuno il
      // requisito è soddisfatto, ma se c'è deve essere approvato prima del taglio.
      chiave: 'piazzamento',
      etichetta: 'Piazzamento approvato (se previsto)',
      soddisfatto: piazzamenti.length === 0 || piazzamenti.some((d) => d.statoApprovazione === 'approvato'),
      dettaglio: 'È stato caricato un piazzamento ma nessuno risulta approvato.',
    },
  ] satisfies RequisitoCampione[]).map((r) => ({ ...r, dettaglio: r.soddisfatto ? undefined : r.dettaglio }))

  return {
    requisiti,
    approvabile: requisiti.every((r) => r.soddisfatto),
    giaApprovato: product.campioneApprovatoIl !== null,
  }
}

/**
 * Approva il campione e, se richiesto, porta il prodotto in produzione.
 * Se manca qualcosa risponde 409 con l'elenco puntuale di ciò che non c'è.
 */
export async function approveSample(productId: string, userId: string, note?: string) {
  const { requisiti, approvabile } = await checkRequisitiCampione(productId)
  if (!approvabile) {
    const mancanti = requisiti.filter((r) => !r.soddisfatto).map((r) => r.etichetta)
    throw conflict(`Non si può approvare il campione: manca ${mancanti.join('; manca ')}.`)
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: productId },
      data: { campioneApprovatoIl: new Date(), campioneApprovatoDa: userId, campioneNote: note },
    })
    await logActivity(tx, {
      userId, azione: 'approve_sample', entita: 'product', entitaId: productId,
      valoreNuovo: note ? `campione approvato — ${note}` : 'campione approvato',
    })
    return updated
  })
}

/**
 * Kanban produzione: **solo i capi che stanno attraversando una lavorazione**.
 *
 * Prima questa funzione restituiva `findMany()` senza filtro, cioè l'intero catalogo: con
 * il censimento importato erano 93 capi finiti da tempo che comparivano nella pipeline e
 * la pagina li contava come «prodotti in produzione». Il filtro non nasconde niente —
 * quei capi si consultano dall'anagrafica e dall'inventario, che è il loro posto.
 */
export async function listProduction() {
  const products = await prisma.product.findMany({
    where: { stato: { in: FASI_PIPELINE } },
    orderBy: { updatedAt: 'desc' },
    include: {
      productionSteps: { orderBy: { createdAt: 'desc' }, take: 1 },
      technicalSheets: { where: { archiviata: false }, select: { id: true, versione: true } },
    },
  })
  return products.map((p) => ({
    productId: p.id,
    nome: p.nome,
    codiceProdotto: p.codiceProdotto,
    linea: p.linea,
    fase: p.stato,
    faseLabel: stageLabel(p.stato),
    prossimaFase: nextStage(p.stato),
    /** Vero quando il passo successivo porta il capo fuori dalla pipeline. */
    completaProduzione: p.stato === ULTIMA_FASE_PIPELINE,
    schedaTecnicaPresente: p.technicalSheets.length > 0,
    ultimoStep: p.productionSteps[0] ?? null,
  }))
}

export async function getProductionDetail(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { productionSteps: { orderBy: { createdAt: 'asc' } }, technicalSheets: { where: { archiviata: false } } },
  })
  if (!product) throw notFound('Prodotto non trovato')
  const gate = await checkAdvance(productId)
  return {
    productId: product.id,
    nome: product.nome,
    fase: product.stato,
    faseLabel: stageLabel(product.stato),
    steps: product.productionSteps,
    gate,
  }
}

// Avanzamento: consentito solo se il gate e verde. Prodotto e step aggiornati in transazione.
/**
 * Avanzamento di fase. Dal 2026-09-07 non accetta più un «responsabile»: chi ha fatto
 * cosa sta nell'activity log, che nessuno può riscrivere, mentre quel campo era una
 * stringa libera copiata a mano su ogni passaggio. La colonna resta in tabella con i
 * valori già registrati, ma non viene più valorizzata.
 */
export async function advanceProduction(
  productId: string,
  userId: string,
  opts: { note?: string } = {},
) {
  const gate = await checkAdvance(productId)
  // Convenzione API_Mapping: i blocchi di gating rispondono 409 con la ragione leggibile.
  if (!gate.ok || !gate.next) throw conflict(gate.reason ?? 'Avanzamento non consentito')
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw notFound('Prodotto non trovato')
  const target = gate.next

  return prisma.$transaction(async (tx) => {
    await tx.productionStep.updateMany({
      where: { productId, fase: product.stato, dataFine: null },
      data: { dataFine: new Date() },
    })
    const step = await tx.productionStep.create({
      data: {
        productId,
        fase: target,
        note: opts.note,
        dataInizio: new Date(),
        bloccata: false,
      },
    })
    const updated = await tx.product.update({ where: { id: productId }, data: { stato: target } })
    const uscitaDallaPipeline = inPipeline(product.stato) && !inPipeline(target)
    await logActivity(tx, {
      userId,
      azione: uscitaDallaPipeline ? 'completa_produzione' : 'advance',
      entita: 'production', entitaId: productId,
      valorePrecedente: stageLabel(product.stato),
      valoreNuovo: uscitaDallaPipeline
        ? `${stageLabel(target)} — uscito dalla pipeline, disponibile nello stock`
        : stageLabel(target),
    })
    return { product: updated, step, fasePrecedente: product.stato, faseCorrente: target, uscitaDallaPipeline }
  })
}

// Blocco manuale di una fase (motivo obbligatorio, tracciato in activity log).
export async function setStepBlock(stepId: string, bloccata: boolean, motivo: string | undefined, userId: string) {
  const step = await prisma.productionStep.findUnique({ where: { id: stepId } })
  if (!step) throw notFound('Fase di produzione non trovata')
  if (bloccata && !motivo) throw badRequest('Indicare il motivo del blocco')
  return prisma.$transaction(async (tx) => {
    const updated = await tx.productionStep.update({
      where: { id: stepId },
      data: { bloccata, motivoBlocco: bloccata ? motivo : null },
    })
    await logActivity(tx, {
      userId, azione: bloccata ? 'block' : 'unblock', entita: 'production_step', entitaId: stepId,
      valoreNuovo: bloccata ? motivo : 'sbloccata',
    })
    return updated
  })
}
