import { useEffect, useState } from 'react'
import { useMockStore } from '../context/MockStore'
import { api, ApiError } from '../lib/api'
import type { AlertItem } from '../types'

// Fase 13: gli alert arrivano da GET /alerts. Il server applica gli stessi criteri di
// lib/alerts.ts e filtra già per ruolo (canSeeAlertModulo), quindi il client non deve
// più né calcolarli né nasconderli: mostra quello che riceve.
// Si ricarica quando cambiano i dati dello store, così un tessuto appena sceso sotto
// soglia fa comparire subito il suo alert.
export function useServerAlerts(): AlertItem[] {
  const { materials, accessories, invoices, orders, products, cashClosures } = useMockStore()
  const [alerts, setAlerts] = useState<AlertItem[]>([])

  useEffect(() => {
    let annullato = false
    api
      .get<AlertItem[]>('/alerts')
      .then((rows) => { if (!annullato) setAlerts(rows) })
      .catch((e) => {
        if (annullato) return
        if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) setAlerts([])
      })
    return () => { annullato = true }
  }, [materials, accessories, invoices, orders, products, cashClosures])

  return alerts
}
