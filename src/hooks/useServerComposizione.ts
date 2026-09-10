import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'

// La composizione ricavata dai tessuti del capo (regola 2026-09-10). La costruisce il
// server (`products/composizioneAutomatica.ts`): l'informazione sta già nella scheda tecnica
// e nelle righe di magazzino, e riscriverla a mano è il modo in cui la stessa lana finisce
// scritta in quattro modi diversi su quattro capi.

export interface ComposizioneDelCapo {
  composizione: string
  /** I tessuti da cui è stata ricavata. */
  fonti: string[]
  /** Più tessuti diversi: le percentuali non si sommano, va guardata da una persona. */
  daConfermare: boolean
  fonte: 'scheda' | 'magazzino' | 'tabella_tessuti' | 'nessuna'
}

export const FONTE_COMPOSIZIONE_LABEL: Record<ComposizioneDelCapo['fonte'], string> = {
  scheda: 'materiali della scheda tecnica',
  magazzino: 'tessuti collegati in magazzino',
  tabella_tessuti: 'tabella tessuti approvata',
  nessuna: 'nessuna fonte',
}

export function useServerComposizione(productId: string | undefined) {
  const [composizione, setComposizione] = useState<ComposizioneDelCapo | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const ricarica = useCallback(async () => {
    if (!productId) return
    try {
      setComposizione(await api.get<ComposizioneDelCapo>(`/products/${productId}/composizione`))
    } catch (e) {
      // 403/401: il ruolo non vede il modulo. Niente composizione ricavata, nessun errore
      // tecnico a schermo — stessa regola degli altri hook.
      if (!(e instanceof ApiError && (e.isForbidden || e.isAuthError))) setComposizione(null)
    }
  }, [productId])

  useEffect(() => { void ricarica() }, [ricarica])

  /** Scrive la composizione ricavata sul capo, anche sopra un testo scritto a mano. */
  const applica = useCallback(async () => {
    if (!productId) throw new Error('Nessun prodotto')
    setInCorso(true)
    try {
      const esito = await api.post<ComposizioneDelCapo & { applicata: boolean }>(
        `/products/${productId}/composizione/applica`,
        {},
      )
      setComposizione(esito)
      return esito
    } finally {
      setInCorso(false)
    }
  }, [productId])

  return { composizione, inCorso, ricarica, applica }
}
