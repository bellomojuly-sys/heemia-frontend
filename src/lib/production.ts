import { PRODUCT_STAGES, type ProductionStep, type ProductStage } from '../types'
import { technicalSheets } from '../mock/technicalSheets'

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

export function checkAdvance(step: Pick<ProductionStep, 'fase' | 'productId'>): AdvanceCheck {
  const next = nextStage(step.fase)
  if (!next) return { ok: false, next: null, reason: 'Il prodotto ha già raggiunto l\'ultima fase della pipeline.' }
  if (STAGES_REQUIRING_TECH_SHEET.includes(next) && !technicalSheets.some((ts) => ts.productId === step.productId)) {
    return { ok: false, next, reason: `Scheda tecnica assente: impossibile avanzare a "${stageLabel(next)}".` }
  }
  return { ok: true, next }
}
