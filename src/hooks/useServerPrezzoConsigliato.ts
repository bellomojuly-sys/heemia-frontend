import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'

// Il prezzo calcolato di un capo (regola 2026-09-10): lo decide il server, che legge i costi
// della scheda tecnica e la soglia di margine dell'azienda. Qui si legge e si applica; il
// conto non si rifà nel browser, perché due conti sono due prezzi che possono divergere.

export interface CostoCapo {
  costoDiretto: number
  costoMateriali: number
  costoAccessori: number
  costoLavorazioni: number
  quotaSviluppo: number
  altriCosti: number
  fonte: 'scheda_righe' | 'scheda_voci' | 'censimento' | 'sconosciuto'
  costoNoto: boolean
}

export interface PrezzoConsigliato {
  productId: string
  /** Costo del capo dalla scheda tecnica: è la base del prezzo. */
  costo: CostoCapo
  /**
   * Quota di costi fissi per capo (DEC-022). Arriva dal server ma **non si mostra nella
   * scheda del capo**: non entra nel prezzo, e il posto dove serve è Costi e margini
   * (Giulia, 2026-09-10). Resta nel tipo perché il server continua a calcolarla.
   */
  quotaCostiFissi: number
  /** Costo del capo + quota fissi. Come sopra: calcolato, ma non è la base del prezzo. */
  costoPieno: number
  marginePercentuale: number
  calcolato: {
    costoTotale: number
    marginePercentuale: number
    prezzoNettoIva: number
    prezzoVendita: number
    prezzoShowroom: number
  }
  attuale: { prezzoVendita: number; prezzoNettoIva: number; prezzoShowroom: number }
  calcolabile: boolean
  daAllineare: boolean
  motivo?: string
}

export const FONTE_COSTO_LABEL: Record<CostoCapo['fonte'], string> = {
  scheda_righe: 'materiali e voci di costo della scheda tecnica',
  scheda_voci: 'voci di costo della scheda tecnica',
  censimento: 'costo di riferimento del censimento',
  sconosciuto: 'nessuna fonte',
}

export function useServerPrezzoConsigliato(productId: string | undefined) {
  const [prezzo, setPrezzo] = useState<PrezzoConsigliato | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const ricarica = useCallback(async () => {
    if (!productId) return
    setCaricamento(true)
    try {
      setPrezzo(await api.get<PrezzoConsigliato>(`/products/${productId}/prezzo-consigliato`))
      setErrore(null)
    } catch (e) {
      // Chi non può vedere il modulo riceve 403: qui diventa "niente prezzo calcolato",
      // non un errore tecnico — stessa regola degli altri hook.
      if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) {
        setPrezzo(null)
        setErrore(null)
      } else {
        setErrore(e instanceof Error ? e.message : 'Prezzo calcolato non disponibile')
      }
    } finally {
      setCaricamento(false)
    }
  }, [productId])

  useEffect(() => { void ricarica() }, [ricarica])

  /** Scrive sul capo i prezzi calcolati. Restituisce l'esito, che dice se ha davvero scritto. */
  const applica = useCallback(async () => {
    if (!productId) throw new Error('Nessun prodotto')
    const esito = await api.post<PrezzoConsigliato & { applicato: boolean }>(
      `/products/${productId}/prezzo/applica`,
      {},
    )
    setPrezzo(esito)
    return esito
  }, [productId])

  return { prezzo, caricamento, errore, ricarica, applica }
}
