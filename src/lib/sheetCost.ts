import type {
  Accessory,
  CostSource,
  Invoice,
  Material,
  SheetCostVoce,
  TechnicalSheet,
} from '../types'

// Calcolo del costo complessivo unitario del capo e del prezzo di break-even (spec §4 e §5).
// Il costo è DERIVATO dai dati della scheda a ogni render, quindi sempre allineato a materiali,
// lavorazioni e fatture correnti. Ogni riga porta la propria fonte per la tracciabilità (§6).

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Quantità di materiale effettivamente usata: confermata dall'utente se presente, altrimenti suggerita. */
export function quantitaEffettiva(m: { quantitaConfermata?: number; quantitaSuggerita: number }): number {
  return m.quantitaConfermata ?? m.quantitaSuggerita
}

export interface CostRow {
  id: string
  label: string
  /** 'materiali' | 'accessori' | 'lavorazioni' | 'sviluppo' | 'altri' — bucket per il riepilogo. */
  gruppo: 'materiali' | 'accessori' | 'lavorazioni' | 'sviluppo' | 'altri'
  quantita?: number
  unitaMisura?: string
  costoUnitario?: number
  percentualeScarto?: number
  fonte: CostSource
  fatturaId?: string
  aggiornatoIl?: string
  /** Costo attribuito al singolo capo per questa riga. */
  costoTotale: number
  ammortizzato?: boolean
  quantitaPrevista?: number
}

export interface SheetCostResult {
  righe: CostRow[]
  costoMateriali: number
  costoAccessori: number
  costoLavorazioni: number
  quotaSviluppo: number
  altriCosti: number
  costoTotaleUnitario: number
  prezzoBreakEven: number
  margineEuro: number
  marginePercentuale: number
}

// Etichette leggibili delle voci di costo aggiuntive (spec §4).
export const VOCE_LABEL: Record<SheetCostVoce, string> = {
  accessori: 'Accessori',
  lavorazioni: 'Lavorazioni',
  taglio: 'Taglio',
  confezione: 'Confezione',
  ricamo_stampa: 'Ricamo / stampa',
  sviluppo_modello: 'Sviluppo modello',
  disegno: 'Disegno',
  scheda_tecnica: 'Scheda tecnica',
  prototipazione: 'Prototipazione',
  logistica: 'Logistica',
  altro: 'Altri costi variabili',
}

// A quale bucket del riepilogo appartiene ogni voce di costo diretto.
const VOCE_GRUPPO: Record<SheetCostVoce, 'accessori' | 'lavorazioni' | 'altri'> = {
  accessori: 'accessori',
  lavorazioni: 'lavorazioni',
  taglio: 'lavorazioni',
  confezione: 'lavorazioni',
  ricamo_stampa: 'lavorazioni',
  logistica: 'altri',
  altro: 'altri',
  // le seguenti sono tipicamente ammortizzate → gruppo 'sviluppo' gestito a parte
  sviluppo_modello: 'altri',
  disegno: 'altri',
  scheda_tecnica: 'altri',
  prototipazione: 'altri',
}

/**
 * Costo unitario completo del capo. Se la scheda non ha dati strutturati (materiali/costiAggiuntivi),
 * ripiega sui vecchi campi flat (costoTessuto/costoManodopera/…) così le schede demo esistenti
 * restano coerenti.
 */
export function computeSheetCost(
  sheet: TechnicalSheet,
  ctx: { materials: Material[]; accessories: Accessory[]; invoices: Invoice[] },
): SheetCostResult {
  const righe: CostRow[] = []
  const hasStructured = (sheet.materiali?.length ?? 0) > 0 || (sheet.costiAggiuntivi?.length ?? 0) > 0

  if (!hasStructured) {
    // Fallback schede legacy: costi diretti dai campi flat.
    const legacy: CostRow[] = [
      { id: 'legacy-tessuto', label: 'Tessuto', gruppo: 'materiali', fonte: 'stimato', costoTotale: sheet.costoTessuto },
      { id: 'legacy-accessori', label: 'Accessori', gruppo: 'accessori', fonte: 'stimato', costoTotale: sheet.costoAccessori },
      { id: 'legacy-manodopera', label: 'Manodopera', gruppo: 'lavorazioni', fonte: 'stimato', costoTotale: sheet.costoManodopera },
      { id: 'legacy-packaging', label: 'Packaging', gruppo: 'altri', fonte: 'stimato', costoTotale: sheet.costoPackaging },
      { id: 'legacy-altri', label: 'Altri costi diretti', gruppo: 'altri', fonte: 'stimato', costoTotale: sheet.altriCostiDiretti },
    ]
    righe.push(...legacy.filter((r) => r.costoTotale > 0))
  } else {
    // Righe materiali (spec §3): quantità × costo unitario × (1 + scarto).
    for (const m of sheet.materiali ?? []) {
      const qta = quantitaEffettiva(m)
      const costo = round2(qta * m.costoUnitario * (1 + Math.max(0, m.percentualeScarto) / 100))
      const nome =
        m.descrizione ||
        (m.materialId ? ctx.materials.find((x) => x.id === m.materialId)?.nome : undefined) ||
        (m.accessoryId ? ctx.accessories.find((x) => x.id === m.accessoryId)?.nome : undefined) ||
        'Materiale'
      righe.push({
        id: m.id,
        label: nome,
        gruppo: m.accessoryId ? 'accessori' : 'materiali',
        quantita: qta,
        unitaMisura: m.unitaMisura,
        costoUnitario: m.costoUnitario,
        percentualeScarto: m.percentualeScarto,
        fonte: m.fonteCosto,
        fatturaId: m.fatturaCostoId,
        aggiornatoIl: m.costoUnitarioAggiornatoIl,
        costoTotale: costo,
      })
    }

    // Voci di costo aggiuntive (spec §4): dirette a pieno, ammortizzate divise per i capi previsti.
    for (const c of sheet.costiAggiuntivi ?? []) {
      const isAmm = c.ammortizzabile || c.kind === 'sviluppo_ammortizzato'
      const divisore = isAmm ? Math.max(1, c.quantitaPrevista ?? sheet.quantitaPrevistaProduzione ?? 1) : 1
      const costo = round2(c.importo / divisore)
      righe.push({
        id: c.id,
        label: c.label || VOCE_LABEL[c.voce],
        gruppo: isAmm ? 'sviluppo' : VOCE_GRUPPO[c.voce],
        fonte: c.fonte,
        fatturaId: c.fatturaId,
        costoTotale: costo,
        ammortizzato: isAmm,
        quantitaPrevista: isAmm ? divisore : undefined,
      })
    }
  }

  const sumBy = (g: CostRow['gruppo']) => round2(righe.filter((r) => r.gruppo === g).reduce((s, r) => s + r.costoTotale, 0))
  const costoMateriali = sumBy('materiali')
  const costoAccessori = sumBy('accessori')
  const costoLavorazioni = sumBy('lavorazioni')
  const quotaSviluppo = sumBy('sviluppo')
  const altriCosti = sumBy('altri')
  const costoTotaleUnitario = round2(costoMateriali + costoAccessori + costoLavorazioni + quotaSviluppo + altriCosti)

  return {
    righe,
    costoMateriali,
    costoAccessori,
    costoLavorazioni,
    quotaSviluppo,
    altriCosti,
    costoTotaleUnitario,
    // Spec §5: il break-even copre esclusivamente i costi. Nessun margine.
    prezzoBreakEven: costoTotaleUnitario,
    margineEuro: 0,
    marginePercentuale: 0,
  }
}
