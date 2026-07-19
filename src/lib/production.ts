import { PRODUCT_STAGES, type Accessory, type Material, type ProductionStep, type ProductStage } from '../types'
import { technicalSheets } from '../mock/technicalSheets'
import { materials as staticMaterials, accessories as staticAccessories } from '../mock/materials'

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

// Sorgenti dati per il controllo materiali: di default i mock statici; il MockStore passa
// il proprio stato per riflettere tessuti/accessori creati o modificati in sessione.
export interface AdvanceContext {
  materials?: Material[]
  accessories?: Accessory[]
}

export function checkAdvance(step: Pick<ProductionStep, 'fase' | 'productId'>, ctx: AdvanceContext = {}): AdvanceCheck {
  const next = nextStage(step.fase)
  if (!next) return { ok: false, next: null, reason: 'Il prodotto ha già raggiunto l\'ultima fase della pipeline.' }
  const sheets = technicalSheets.filter((ts) => ts.productId === step.productId)
  if (STAGES_REQUIRING_TECH_SHEET.includes(next) && sheets.length === 0) {
    return { ok: false, next, reason: `Scheda tecnica assente: impossibile avanzare a "${stageLabel(next)}".` }
  }

  // FR-05: "materiale segnato come non disponibile → blocco fase produzione successiva".
  // Verifica i materiali collegati dalla scheda tecnica quando si entra in Produzione.
  if (next === 'produzione' && sheets.length > 0) {
    const mats = ctx.materials ?? staticMaterials
    const accs = ctx.accessories ?? staticAccessories
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

  return { ok: true, next }
}
