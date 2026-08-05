import { useCallback, useState } from 'react'
import { ApiError } from '../lib/api'
import { useGoatAlert } from '../context/GoatAlertContext'
import type { TipoAlert } from '../lib/goatMessages'

/**
 * Traduce l'errore del server nel tipo di avviso giusto. La ragione precisa
 * ("codice già esistente", "materiale esaurito") viaggia comunque dentro
 * l'avviso: la frase della capretta dà il tono, non sostituisce l'informazione.
 */
function tipoPerErrore(e: unknown): TipoAlert {
  if (!(e instanceof ApiError)) return 'salvataggio'
  if (e.code === 'NETWORK') return 'connessione'
  if (e.isForbidden || e.isAuthError) return 'permesso'
  if (e.status >= 400 && e.status < 500) return 'dati-incompleti'
  return 'salvataggio'
}

/**
 * Fase 14 — invio dei form: validazione, attesa del server, errore visibile.
 *
 * Il problema che risolve. Fino alla Fase 13 ogni form faceva così:
 *
 *     const submit = () => { onSubmit(datiRaccolti); onClose() }
 *
 * `onSubmit` è una funzione asincrona che scrive sul server, ma nessuno la
 * attendeva: il modale si chiudeva subito e, se il server rifiutava (codice
 * prodotto duplicato, campo non valido, sessione scaduta, backend spento),
 * l'errore finiva in una promise rifiutata che nessuno leggeva. Per chi usa
 * l'app il salvataggio sembrava riuscito e il dato non c'era.
 *
 * Come si usa:
 *
 *     const { errori, inCorso, submit } = useFormSubmit(
 *       () => ({ nome: form.nome.trim() ? undefined : 'Il nome è obbligatorio.' }),
 *       async () => { await onSubmit(datiRaccolti); onClose() },
 *     )
 *
 * `valida` restituisce un messaggio per ogni campo sbagliato (o `undefined` se
 * il campo va bene). Se ne restituisce almeno uno il server non viene nemmeno
 * chiamato. La chiusura del modale sta dentro `esegui`, così avviene solo
 * quando il salvataggio è andato davvero a buon fine.
 *
 * Gli errori di invio non tornano più al chiamante: li annuncia la capretta
 * (`GoatAlertContext`). Sotto i campi restano solo i messaggi di validazione,
 * che devono restare sotto gli occhi mentre si corregge.
 */
export function useFormSubmit<C extends string>(
  valida: () => Partial<Record<C, string | undefined>>,
  esegui: () => Promise<void>,
) {
  const [errori, setErrori] = useState<Partial<Record<C, string>>>({})
  const [inCorso, setInCorso] = useState(false)
  const { avvisa } = useGoatAlert()

  const submit = useCallback(async () => {
    if (inCorso) return

    const trovati = valida()
    const soloCompilati = Object.fromEntries(
      Object.entries(trovati).filter(([, v]) => Boolean(v)),
    ) as Partial<Record<C, string>>

    setErrori(soloCompilati)
    const mancanti = Object.keys(soloCompilati).length
    if (mancanti > 0) {
      // Il popup dice che il salvataggio è stato fermato; i messaggi sotto i campi
      // restano e dicono quale campo e perché — quelli devono persistere mentre si
      // corregge, il popup no.
      avvisa(mancanti === 1 ? 'campi-obbligatori' : 'dati-incompleti', {
        testo:
          mancanti === 1
            ? Object.values<string>(soloCompilati as Record<string, string>)[0]
            : `Ci sono ${mancanti} campi da sistemare, te li ho segnati in rosso.`,
      })
      return
    }

    setInCorso(true)
    try {
      await esegui()
    } catch (e) {
      // ApiError porta già un messaggio in italiano deciso dal backend (o
      // "impossibile contattare il server" se la rete è giù). Tutto il resto è
      // un difetto nostro: lo si dice senza travestirlo da problema dell'utente.
      avvisa(tipoPerErrore(e), {
        testo:
          e instanceof ApiError
            ? e.message
            : 'Salvataggio non riuscito per un errore imprevisto. Riprova; se continua, segnalalo.',
      })
    } finally {
      setInCorso(false)
    }
  }, [avvisa, esegui, inCorso, valida])

  /** Da chiamare quando si modifica un campo: toglie il rosso mentre si corregge. */
  const pulisci = useCallback((campo: C) => {
    setErrori((prec) => {
      if (!prec[campo]) return prec
      const copia = { ...prec }
      delete copia[campo]
      return copia
    })
  }, [])

  return { errori, inCorso, submit, pulisci }
}

/** Validatori riusati da più form. */
export const regole = {
  obbligatorio: (v: string, nome: string) => (v.trim() ? undefined : `${nome} è obbligatorio.`),
  email: (v: string) =>
    !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? undefined : 'Indirizzo email non valido.',
  numeroPositivo: (v: string, nome: string) => {
    if (!v.trim()) return undefined
    const n = Number(v)
    if (Number.isNaN(n)) return `${nome} deve essere un numero.`
    return n < 0 ? `${nome} non può essere negativo.` : undefined
  },
  numeroRichiesto: (v: string, nome: string) => {
    if (!v.trim()) return `${nome} è obbligatorio.`
    const n = Number(v)
    if (Number.isNaN(n)) return `${nome} deve essere un numero.`
    return n < 0 ? `${nome} non può essere negativo.` : undefined
  },
}
