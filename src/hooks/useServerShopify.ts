import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'

// Shopify (FR-17). Tutto passa dal server: il token della custom app non deve mai arrivare
// al browser. Chi non ha il modulo riceve 403 e qui vede lo stato "non disponibile", non un
// errore tecnico — stessa regola degli altri hook.

export interface StatoShopify {
  configurato: boolean
  pubblicati: number
  nonPubblicati: number
  divergenzeStock: number
  ultimaRiconciliazione: string | null
  nota?: string
}

export interface DivergenzaShopify {
  variantId: string
  sku: string
  capo: string
  taglia: string
  colore: string
  interno: number
  shopify: number
  differenza: number
}

export interface EsitoRiconciliazione {
  eseguitaIl: string
  abbinate: number
  divergenze: { sku: string; interno: number; shopify: number }[]
  soloSuShopify: string[]
  soloInHeemia: string[]
  prodottiAggiornati: number
}

const STATO_INIZIALE: StatoShopify = {
  configurato: false,
  pubblicati: 0,
  nonPubblicati: 0,
  divergenzeStock: 0,
  ultimaRiconciliazione: null,
}

export function useServerShopify() {
  const [stato, setStato] = useState<StatoShopify>(STATO_INIZIALE)
  const [divergenze, setDivergenze] = useState<DivergenzaShopify[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const ricarica = useCallback(async () => {
    setCaricamento(true)
    try {
      const [s, d] = await Promise.all([
        api.get<StatoShopify>('/shopify/status'),
        api.get<DivergenzaShopify[]>('/shopify/divergenze'),
      ])
      setStato(s)
      setDivergenze(d)
      setErrore(null)
    } catch (e) {
      if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) {
        setStato(STATO_INIZIALE)
        setDivergenze([])
        setErrore(null)
      } else {
        setErrore(e instanceof Error ? e.message : 'Stato Shopify non caricato')
      }
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => { void ricarica() }, [ricarica])

  /** Legge Shopify e aggiorna quantità pubblicate e divergenze. Non tocca le giacenze interne. */
  const riconcilia = useCallback(async () => {
    const esito = await api.post<EsitoRiconciliazione>('/shopify/sync')
    await ricarica()
    return esito
  }, [ricarica])

  /** Scrive su Shopify la giacenza di magazzino delle varianti abbinate. */
  const pubblicaGiacenze = useCallback(async () => {
    const esito = await api.post<{ scritte: number; dettaglio: string[]; nota?: string }>('/shopify/pubblica-giacenze')
    await ricarica()
    return esito
  }, [ricarica])

  const importaOrdini = useCallback(async () => {
    return api.post<{ letti: number; creati: number; aggiornati: number; righeSenzaCorrispondenza: string[]; dal: string }>(
      '/shopify/ordini/import',
      {},
    )
  }, [])

  /** Risoluzione esplicita di una divergenza: il magazzino prende il numero di Shopify (DEC-027). */
  const allinea = useCallback(async (variantId: string) => {
    const esito = await api.post<{ sku: string; precedente: number; nuovo: number }>(
      `/shopify/divergenze/${variantId}/allinea`,
    )
    await ricarica()
    return esito
  }, [ricarica])

  return { stato, divergenze, caricamento, errore, ricarica, riconcilia, pubblicaGiacenze, importaOrdini, allinea }
}
