import { useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { ModalitaAllocazione } from '../types'

// FR-23: ripartizione dei costi indiretti registrata per fattura. Dal 2026-07-31 arriva
// dal database (tabella `cost_allocations`) invece che da un elenco di esempio.
export interface CostAllocationView {
  id: string
  invoiceId: string
  numeroFattura?: string
  modalita: ModalitaAllocazione
  note?: string
}

export function useServerCostAllocations(): CostAllocationView[] {
  const [rows, setRows] = useState<CostAllocationView[]>([])
  useEffect(() => {
    let annullato = false
    api
      .get<Record<string, unknown>[]>('/cost-allocations')
      .then((d) => {
        if (annullato) return
        setRows(
          d.map((r) => ({
            id: String(r.id),
            invoiceId: String(r.invoiceId),
            numeroFattura: (r.invoice as { numero?: string } | null)?.numero,
            modalita: r.modalita as ModalitaAllocazione,
            note: r.note ? String(r.note) : undefined,
          })),
        )
      })
      .catch((e) => {
        if (annullato) return
        if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) setRows([])
      })
    return () => { annullato = true }
  }, [])
  return rows
}
