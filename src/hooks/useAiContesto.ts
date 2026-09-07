import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'

// I dati che l'AI Assistant legge, letti anche dalla pagina (2026-09-07).
//
// È lo **stesso** oggetto che il server manda al modello (`server/src/modules/ai/contesto.ts`),
// non una seconda lettura fatta apposta per l'interfaccia: se la pagina mostrasse numeri
// diversi da quelli che riceve l'AI, una delle due starebbe mentendo e non si saprebbe
// quale. È anche il motivo per cui la pagina resta utile quando OpenAI non è collegato:
// i dati ci sono comunque, manca solo chi li commenta a parole.

export interface AnomaliaAi {
  chiave: string
  gravita: 'critica' | 'attenzione'
  quanti: number
  descrizione: string
  dove: string
}

export interface ContestoAi {
  generatoIl: string
  ruolo: string
  sezioniNonVisibili: string[]
  azienda: { prodotti: number; varianti: number; fornitori: number; clienti: number }
  inventario?: {
    capiInMagazzino: number
    capiInLaboratorio: number
    capiInLavorazione: number
    capiDisponibili: number
    varianteEsaurite: number
    stockBasso: { sku: string; prodotto: string; taglia: string; colore: string; disponibile: number; soglia: number; stato: string }[]
    laboratorioDaReintegrare: { sku: string; prodotto: string; inLaboratorio: number; sogliaLaboratorio: number }[]
    materialiSottoSoglia: { nome: string; codice: string; stato: string; disponibile: number; soglia: number; unita: string }[]
    accessoriSottoSoglia: { nome: string; codice: string; stato: string; disponibile: number; soglia: number; unita: string }[]
    valore: { aPrezzoDiVendita: number; aCostoDiretto: number; capiSenzaCosto: number; nota: string }
  }
  produzione?: {
    inPipeline: number
    perFase: { fase: string; capi: number }[]
    capi: { nome: string; codice: string; fase: string; schedaTecnica: boolean; campioneApprovato: boolean; bloccata: boolean }[]
    fuoriPipeline: number
    nota: string
  }
  economia?: {
    sogliaMarginePercent: number
    quotaPerCapo: number
    quotaCalcolabile: boolean
    costiFissiAnnui: number
    costiFissiMensili: number
    vociCostoFissoPrincipali: { nome: string; importoAnnuo: number; percentuale: number }[]
    prodottiSottoSoglia: number
    prodottiInPerdita: number
    marginiPeggiori: { prodotto: string; marginePercentuale: number; prezzoNettoIva: number; costoTotale: number; sottoSoglia: boolean }[]
    senzaCostoDiretto: number
    nota: string
  }
  fornitori?: {
    totale: number
    completi: number
    incompleti: { nome: string; categoria: string; mancano: string[] }[]
  }
  anomalie: AnomaliaAi[]
}

export interface RispostaAi {
  sessionId: string
  domanda: string
  risposta: string
  contesto: ContestoAi
  modello: string
}

export function useAiContesto() {
  const [contesto, setContesto] = useState<ContestoAi | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const ricarica = useCallback(async () => {
    setCaricamento(true)
    try {
      setContesto(await api.get<ContestoAi>('/ai/contesto'))
      setErrore(null)
    } catch (e) {
      if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) {
        setContesto(null)
        setErrore(null)
      } else {
        setErrore(e instanceof Error ? e.message : 'Dati non caricati')
      }
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => { void ricarica() }, [ricarica])

  /**
   * Manda la domanda. Il contesto lo ricostruisce il server al momento della richiesta,
   * non si spedisce da qui: quello che il browser ha in mano può avere qualche minuto, e
   * soprattutto un contesto costruito dal client sarebbe filtrabile dal client — cioè non
   * sarebbe un filtro.
   */
  const chiedi = useCallback(async (domanda: string, sessionId?: string) => {
    const esito = await api.post<RispostaAi>('/ai/domanda', { domanda, sessionId })
    // La risposta porta con sé il contesto usato: aggiornarlo qui tiene allineato ciò che
    // si legge a schermo con ciò su cui l'AI ha risposto.
    setContesto(esito.contesto)
    return esito
  }, [])

  return { contesto, caricamento, errore, ricarica, chiedi }
}
