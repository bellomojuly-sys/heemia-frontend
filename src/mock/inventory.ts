import type { InventoryRecord } from '../types'

// Residuo del prototipo: dalla Fase 13 l'inventario arriva dal database e nessuna pagina
// importa più questo file. Resta come riferimento della forma dei dati.
//
// `disponibileTotale`, `qtaInProduzione`, `disponibileReale` e `laboratorioSottoSoglia` li calcola
// il server (inventory/service.ts): qui sono scritti a mano solo per coerenza col tipo.
const record = (
  r: Omit<
    InventoryRecord,
    | 'disponibileTotale'
    | 'disponibileReale'
    | 'laboratorioSottoSoglia'
    | 'totaleDichiarato'
    | 'totaleDistribuito'
    | 'differenzaMigrazione'
    | 'migrazioneCompletata'
    | 'migrazioneConfermabile'
    | 'reintegro'
  >,
): InventoryRecord => ({
  ...r,
  disponibileTotale: r.qtaMagazzino + r.qtaLaboratorio,
  disponibileReale: Math.max(0, r.qtaMagazzino + r.qtaLaboratorio - r.qtaInProduzione),
  laboratorioSottoSoglia: r.sogliaMinimaLaboratorio > 0 && r.qtaLaboratorio <= r.sogliaMinimaLaboratorio,
  // Righe di riferimento: distribuzione iniziale già chiusa, come per le varianti create
  // dall'app (FR-49). La migrazione riguarda solo i dati che arrivano dall'import.
  totaleDichiarato: r.qtaMagazzino + r.qtaLaboratorio,
  totaleDistribuito: r.qtaMagazzino + r.qtaLaboratorio,
  differenzaMigrazione: 0,
  migrazioneCompletata: true,
  migrazioneConfermabile: false,
  reintegro: null,
})

export const inventoryRecords: InventoryRecord[] = [
  record({ id: 'inv-rec-01', variantId: 'var-01', qtaMagazzino: 24, qtaLaboratorio: 0, qtaRiservata: 2, qtaVenduta: 140, sogliaMinima: 10, sogliaMinimaLaboratorio: 0, qtaInProduzione: 0, stato: 'disponibile', stockShopify: 24, divergenzaShopify: false }),
  record({ id: 'inv-rec-02', variantId: 'var-02', qtaMagazzino: 3, qtaLaboratorio: 0, qtaRiservata: 0, qtaVenduta: 61, sogliaMinima: 10, sogliaMinimaLaboratorio: 0, qtaInProduzione: 0, stato: 'low_stock', stockShopify: 5, divergenzaShopify: true }),
  record({ id: 'inv-rec-03', variantId: 'var-03', qtaMagazzino: 0, qtaLaboratorio: 0, qtaRiservata: 0, qtaVenduta: 38, sogliaMinima: 5, sogliaMinimaLaboratorio: 0, qtaInProduzione: 0, stato: 'esaurito', stockShopify: 2, divergenzaShopify: true }),
  record({ id: 'inv-rec-04', variantId: 'var-04', qtaMagazzino: 12, qtaLaboratorio: 4, qtaRiservata: 1, qtaVenduta: 45, sogliaMinima: 8, sogliaMinimaLaboratorio: 2, qtaInProduzione: 1, stato: 'disponibile', stockShopify: 16, divergenzaShopify: false }),
  record({ id: 'inv-rec-05', variantId: 'var-05', qtaMagazzino: 8, qtaLaboratorio: 0, qtaRiservata: 0, qtaVenduta: 29, sogliaMinima: 8, sogliaMinimaLaboratorio: 0, qtaInProduzione: 0, stato: 'disponibile', stockShopify: 8, divergenzaShopify: false }),
  record({ id: 'inv-rec-06', variantId: 'var-06', qtaMagazzino: 15, qtaLaboratorio: 2, qtaRiservata: 3, qtaVenduta: 52, sogliaMinima: 6, sogliaMinimaLaboratorio: 4, qtaInProduzione: 0, stato: 'disponibile', stockShopify: 17, divergenzaShopify: false }),
]
