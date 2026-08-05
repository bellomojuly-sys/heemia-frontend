import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { GoatAlertStack, type GoatAlertData } from '../components/ui/GoatAlert'
import { DURATA_PREDEFINITA, testoAlert, type LivelloAlert, type TipoAlert } from '../lib/goatMessages'
import { playGoatBleat } from '../lib/goatSound'

/**
 * Avvisi della capretta — un solo punto da cui farli comparire.
 *
 *     const { avvisa } = useGoatAlert()
 *     avvisa('campi-obbligatori')
 *     avvisa('salvataggio', { testo: e.message })   // la ragione vera del server
 *
 * Regola d'uso: si chiama **solo quando un'azione viene davvero bloccata**, non
 * per informare. Un avviso che compare quando non è successo niente insegna a
 * ignorarlo, e la volta che conta non lo guarda più nessuno.
 *
 * Ogni voce può sovrascrivere titolo, testo, livello e durata: i valori di
 * partenza vengono da `lib/goatMessages.ts`, che è l'unico file da toccare per
 * cambiare le frasi o aggiungere una lingua.
 */
export interface OpzioniAvviso {
  titolo?: string
  testo?: string
  livello?: LivelloAlert
  durata?: number
}

interface GoatAlertValue {
  avvisa: (tipo: TipoAlert, opzioni?: OpzioniAvviso) => void
}

const GoatAlertContext = createContext<GoatAlertValue | undefined>(undefined)

export function GoatAlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<GoatAlertData[]>([])
  const prossimoId = useRef(1)

  const chiudi = useCallback((id: number) => {
    setAlerts((prec) => prec.filter((a) => a.id !== id))
  }, [])

  const avvisa = useCallback((tipo: TipoAlert, opzioni: OpzioniAvviso = {}) => {
    const base = testoAlert(tipo)
    const livello = opzioni.livello ?? base.livello
    const nuovo: GoatAlertData = {
      id: prossimoId.current++,
      titolo: opzioni.titolo ?? base.titolo,
      testo: opzioni.testo ?? base.testo,
      livello,
      durata: opzioni.durata ?? DURATA_PREDEFINITA[livello],
    }
    // Al massimo tre in pila: oltre, la colonna coprirebbe metà schermo e
    // nessuno leggerebbe più niente. Escono i più vecchi.
    setAlerts((prec) => [...prec, nuovo].slice(-3))
    playGoatBleat()
  }, [])

  const value = useMemo(() => ({ avvisa }), [avvisa])

  return (
    <GoatAlertContext.Provider value={value}>
      {children}
      <GoatAlertStack alerts={alerts} onClose={chiudi} />
    </GoatAlertContext.Provider>
  )
}

export function useGoatAlert(): GoatAlertValue {
  const ctx = useContext(GoatAlertContext)
  if (!ctx) throw new Error('useGoatAlert va usato dentro GoatAlertProvider')
  return ctx
}
