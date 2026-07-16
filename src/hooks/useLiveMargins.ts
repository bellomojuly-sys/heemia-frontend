import { useMemo } from 'react'
import { useMockStore } from '../context/MockStore'
import { computeQuotaPerCapo, recomputeMargin } from '../lib/margins'
import { margins, MARGIN_THRESHOLD_PERCENT } from '../mock'
import type { Margin } from '../types'

// Margini ricalcolati con la quota costi fissi corrente (voci + capi/anno dal MockStore).
// Da usare ovunque si mostrino margini/alert, così Dashboard, Alert e Costi e margini
// restano coerenti quando la founder modifica le voci di costo fisso.
export function useLiveMargins(): Margin[] {
  const { fixedCostItems, capiProdottiAnnui } = useMockStore()
  return useMemo(() => {
    const quota = computeQuotaPerCapo(fixedCostItems, capiProdottiAnnui)
    return margins.map((m) => recomputeMargin(m, quota, MARGIN_THRESHOLD_PERCENT))
  }, [fixedCostItems, capiProdottiAnnui])
}
