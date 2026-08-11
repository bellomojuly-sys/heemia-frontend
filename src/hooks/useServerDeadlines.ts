import { useEffect, useState } from 'react'
import { useDataStore } from '../context/DataStore'
import { api, ApiError, isoDate, num } from '../lib/api'
import type { Deadline } from '../types'

// Fase 13: le scadenze arrivano da GET /deadlines. Il server unisce quelle registrate in
// tabella e quelle derivate dalle fatture da pagare, e calcola "in ritardo" sulla data
// reale — nel prototipo erano un elenco fisso con una data di riferimento finta.
export function useServerDeadlines(): Deadline[] {
  const { invoices } = useDataStore()
  const [deadlines, setDeadlines] = useState<Deadline[]>([])

  useEffect(() => {
    let annullato = false
    api
      .get<Record<string, unknown>[]>('/deadlines')
      .then((rows) => {
        if (annullato) return
        setDeadlines(
          rows.map((d) => ({
            id: String(d.id),
            tipo: d.tipo as Deadline['tipo'],
            descrizione: String(d.descrizione ?? ''),
            data: isoDate(d.data),
            importo: d.importo === null || d.importo === undefined ? undefined : num(d.importo),
            stato: d.stato as Deadline['stato'],
            // Il server chiama `invoiceId` il collegamento alla fattura, il tipo lato client
            // lo chiama `collegatoA`: senza questa riga la colonna "Collegata a" delle
            // Scadenze restava sempre a "–" (il cast qui sotto nascondeva la differenza).
            collegatoA: d.invoiceId ? String(d.invoiceId) : undefined,
          })) as Deadline[],
        )
      })
      .catch((e) => {
        // Il modulo scadenze è riservato ad Admin/CEO: per gli altri lista vuota, non un errore.
        if (annullato) return
        if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) setDeadlines([])
      })
    return () => { annullato = true }
  }, [invoices])

  return deadlines
}
