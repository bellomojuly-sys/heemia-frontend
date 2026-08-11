import { useEffect, useState } from 'react'
import { useDataStore } from '../context/DataStore'
import { api, ApiError, num } from '../lib/api'
import type { Margin } from '../types'

// Fase 13: i margini li calcola il server (GET /margins), con la stessa formula del prototipo
// — quota costi fissi (DEC-022) + costo diretto dalla scheda tecnica. Il ricalcolo locale sui
// mock è stato rimosso: la fonte di verità è una sola.
// Si aggiorna quando cambiano voci di costo fisso o capi/anno, perché entrambe modificano la quota.
export function useLiveMargins(): Margin[] {
  const { fixedCostItems, capiProdottiAnnui } = useDataStore()
  const [margins, setMargins] = useState<Margin[]>([])

  useEffect(() => {
    let annullato = false
    api
      .get<Record<string, unknown>[]>('/margins')
      .then((rows) => {
        if (annullato) return
        setMargins(
          rows.map((m) => ({
            productId: String(m.productId),
            costoDiretto: num(m.costoDiretto),
            costoIndirettoAllocato: num(m.costoIndirettoAllocato),
            costoTotale: num(m.costoTotale),
            // Il server calcola tutto sul prezzo al netto dell'IVA: qui va in entrambi
            // i campi che l'interfaccia mostra (senza, "Prezzo netto IVA" restava NaN).
            prezzoVendita: num(m.prezzoNettoIva),
            prezzoNettoIva: num(m.prezzoNettoIva),
            margineLordo: num(m.margineLordo),
            margineNettoStimato: num(m.margineNettoStimato),
            marginePercentuale: num(m.marginePercentuale),
            breakEvenPrice: num(m.breakEvenPrice),
            prezzoMinimoConsigliato: num(m.prezzoMinimoConsigliato),
            // "reale" se il costo diretto viene da una scheda tecnica compilata,
            // "stimato" se la scheda non c'è ancora e il costo risulta a zero.
            tipoDato: num(m.costoDiretto) > 0 ? ('reale' as const) : ('stimato' as const),
            sottoSoglia: Boolean(m.sottoSoglia),
          })) as Margin[],
        )
      })
      .catch((e) => {
        // I ruoli senza modulo costi-margini non vedono i margini: lista vuota, non un errore.
        if (annullato) return
        if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) setMargins([])
      })
    return () => { annullato = true }
  }, [fixedCostItems, capiProdottiAnnui])

  return margins
}
