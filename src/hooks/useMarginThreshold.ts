import { useEffect, useState } from 'react'
import { useDataStore } from '../context/DataStore'
import { api, ApiError, num } from '../lib/api'

/**
 * Soglia margine configurata (DEC-022), letta dalle impostazioni sul server.
 * Prima era la costante 35 scritta nel codice: se la soglia veniva cambiata, le etichette
 * ("margine sotto soglia (35%)") mostravano un valore diverso da quello davvero applicato.
 * Il 35 resta solo come valore di partenza finché la risposta non arriva.
 */
export function useMarginThreshold(): number {
  const { fixedCostItems, capiProdottiAnnui } = useDataStore()
  const [soglia, setSoglia] = useState(35)

  useEffect(() => {
    let annullato = false
    api
      .get<{ sogliaMarginePercent?: number }>('/margins/quota')
      .then((q) => {
        if (!annullato && q.sogliaMarginePercent !== undefined) setSoglia(num(q.sogliaMarginePercent))
      })
      .catch((e) => {
        // Ruoli senza accesso ai costi: resta il valore di default, non è un errore.
        if (!(e instanceof ApiError && (e.isForbidden || e.isAuthError))) throw e
      })
    return () => { annullato = true }
  }, [fixedCostItems, capiProdottiAnnui])

  return soglia
}
