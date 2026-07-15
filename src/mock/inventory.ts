import type { InventoryRecord } from '../types'

export const inventoryRecords: InventoryRecord[] = [
  { id: 'inv-rec-01', variantId: 'var-01', qtaMagazzino: 24, qtaLaboratorio: 0, qtaRiservata: 2, qtaVenduta: 140, sogliaMinima: 10, stato: 'disponibile', stockShopify: 24, divergenzaShopify: false },
  { id: 'inv-rec-02', variantId: 'var-02', qtaMagazzino: 3, qtaLaboratorio: 0, qtaRiservata: 0, qtaVenduta: 61, sogliaMinima: 10, stato: 'low_stock', stockShopify: 5, divergenzaShopify: true },
  { id: 'inv-rec-03', variantId: 'var-03', qtaMagazzino: 0, qtaLaboratorio: 0, qtaRiservata: 0, qtaVenduta: 38, sogliaMinima: 5, stato: 'esaurito', stockShopify: 2, divergenzaShopify: true },
  { id: 'inv-rec-04', variantId: 'var-04', qtaMagazzino: 12, qtaLaboratorio: 4, qtaRiservata: 1, qtaVenduta: 45, sogliaMinima: 8, stato: 'disponibile', stockShopify: 12, divergenzaShopify: false },
  { id: 'inv-rec-05', variantId: 'var-05', qtaMagazzino: 8, qtaLaboratorio: 0, qtaRiservata: 0, qtaVenduta: 29, sogliaMinima: 8, stato: 'disponibile', stockShopify: 8, divergenzaShopify: false },
  { id: 'inv-rec-06', variantId: 'var-06', qtaMagazzino: 15, qtaLaboratorio: 2, qtaRiservata: 3, qtaVenduta: 52, sogliaMinima: 6, stato: 'disponibile', stockShopify: 15, divergenzaShopify: false },
]
