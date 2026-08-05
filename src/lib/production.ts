import { PRODUCT_STAGES, type Accessory, type Material, type Product, type ProductionStep, type ProductStage } from '../types'
import type { TechnicalSheet } from '../types'

// FR-07: "Il sistema blocca il passaggio a fasi successive se mancano dati critici
// (es. scheda tecnica assente prima di Produzione)". Estesa a Prototipo/Campionario:
// la scheda tecnica preliminare nasce "prima della produzione" (FR-14), quindi deve
// esistere già quando si entra in una di queste tre fasi.
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

// Sorgenti dati del controllo. Fase 13: arrivano tutte dallo store (quindi dal database);
// non ci sono più mock statici come default. Senza dati il controllo è permissivo: la
// decisione vera la prende comunque il server, che rifiuta con 409 e la ragione.
export interface AdvanceContext {
  materials?: Material[]
  accessories?: Accessory[]
  technicalSheets?: TechnicalSheet[]
  products?: Product[]
}

export function checkAdvance(step: Pick<ProductionStep, 'fase' | 'productId'>, ctx: AdvanceContext = {}): AdvanceCheck {
  const next = nextStage(step.fase)
  if (!next) return { ok: false, next: null, reason: 'Il prodotto ha già raggiunto l\'ultima fase della pipeline.' }
  const sheets = (ctx.technicalSheets ?? []).filter((ts) => ts.productId === step.productId)
  if (STAGES_REQUIRING_TECH_SHEET.includes(next) && sheets.length === 0) {
    return { ok: false, next, reason: `Scheda tecnica assente: impossibile avanzare a "${stageLabel(next)}".` }
  }

  // FR-05: "materiale segnato come non disponibile → blocco fase produzione successiva".
  // Verifica i materiali collegati dalla scheda tecnica quando si entra in Produzione.
  if (next === 'produzione' && sheets.length > 0) {
    const mats = ctx.materials ?? []
    const accs = ctx.accessories ?? []
    const sheet = sheets.find((s) => s.versione === 'finale') ?? sheets[sheets.length - 1]
    const materialIds = [sheet.tessutoPrincipaleId, ...sheet.tessutiSecondariId]
    const esauritoMat = materialIds
      .map((id) => mats.find((m) => m.id === id))
      .find((m) => m && m.stato === 'esaurito')
    if (esauritoMat) {
      return { ok: false, next, reason: `Materiale non disponibile (${esauritoMat.nome} esaurito): impossibile avanzare a "Produzione".` }
    }
    const esauritoAcc = sheet.accessoriIds
      .map((id) => accs.find((a) => a.id === id))
      .find((a) => a && a.stato === 'esaurito')
    if (esauritoAcc) {
      return { ok: false, next, reason: `Accessorio non disponibile (${esauritoAcc.nome} esaurito): impossibile avanzare a "Produzione".` }
    }
  }

  // Backlog "Note" §6: in produzione si entra solo con il campione approvato.
  // Il controllo completo (documenti della modellista, misure) lo fa il server.
  if (next === 'produzione') {
    const product = (ctx.products ?? []).find((p) => p.id === step.productId)
    if (product && !product.campioneApprovatoIl) {
      return {
        ok: false,
        next,
        reason: 'Campione non ancora approvato: usa "Approva campione e avvia produzione" nella scheda prodotto.',
      }
    }
  }

  return { ok: true, next }
}
