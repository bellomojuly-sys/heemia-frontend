import { useCallback, useState } from 'react'
import { ApiError } from '../lib/api'

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
 *     const { errori, erroreServer, inCorso, submit } = useFormSubmit(
 *       () => ({ nome: form.nome.trim() ? undefined : 'Il nome è obbligatorio.' }),
 *       async () => { await onSubmit(datiRaccolti); onClose() },
 *     )
 *
 * `valida` restituisce un messaggio per ogni campo sbagliato (o `undefined` se
 * il campo va bene). Se ne restituisce almeno uno il server non viene nemmeno
 * chiamato. La chiusura del modale sta dentro `esegui`, così avviene solo
 * quando il salvataggio è andato davvero a buon fine.
 */
export function useFormSubmit<C extends string>(
  valida: () => Partial<Record<C, string | undefined>>,
  esegui: () => Promise<void>,
) {
  const [errori, setErrori] = useState<Partial<Record<C, string>>>({})
  const [erroreServer, setErroreServer] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const submit = useCallback(async () => {
    if (inCorso) return

    const trovati = valida()
    const soloCompilati = Object.fromEntries(
      Object.entries(trovati).filter(([, v]) => Boolean(v)),
    ) as Partial<Record<C, string>>

    setErrori(soloCompilati)
    if (Object.keys(soloCompilati).length > 0) {
      setErroreServer(null)
      return
    }

    setInCorso(true)
    setErroreServer(null)
    try {
      await esegui()
    } catch (e) {
      // ApiError porta già un messaggio in italiano deciso dal backend (o
      // "impossibile contattare il server" se la rete è giù). Tutto il resto è
      // un difetto nostro: lo si dice senza travestirlo da problema dell'utente.
      setErroreServer(
        e instanceof ApiError
          ? e.message
          : 'Salvataggio non riuscito per un errore imprevisto. Riprova; se continua, segnalalo.',
      )
    } finally {
      setInCorso(false)
    }
  }, [esegui, inCorso, valida])

  /** Da chiamare quando si modifica un campo: toglie il rosso mentre si corregge. */
  const pulisci = useCallback((campo: C) => {
    setErrori((prec) => {
      if (!prec[campo]) return prec
      const copia = { ...prec }
      delete copia[campo]
      return copia
    })
  }, [])

  return { errori, erroreServer, inCorso, submit, pulisci }
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
