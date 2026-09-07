import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { Role } from '../types'

// Utenti e accessi (2026-08-12). Sorgente unica: /users, riservato agli admin. Chi non ha
// il modulo riceve 403 dal server e qui vede una lista vuota, non un errore tecnico —
// stessa regola degli altri hook di lettura.

export interface UtenteApp {
  id: string
  nome: string
  email: string
  role: Role
  attivo: boolean
  createdAt: string
  sessioniAttive: number
}

type Row = Record<string, unknown>

function toUtente(r: Row): UtenteApp {
  return {
    id: String(r.id),
    nome: String(r.nome ?? ''),
    email: String(r.email ?? ''),
    role: r.role as Role,
    attivo: Boolean(r.attivo),
    createdAt: String(r.createdAt ?? ''),
    sessioniAttive: Number(r.sessioniAttive ?? 0),
  }
}

/** Cosa si perde eliminando un utente (GET /users/:id/deletion-check). */
export interface VerificaEliminazioneUtente {
  nome: string
  email: string
  /** Falso quando c'è un blocco assoluto: il proprio account, o l'ultimo admin attivo. */
  eliminabile: boolean
  blocchi: string[]
  /** Vero quando l'account ha firmato qualcosa: serve una conferma in più. */
  haStorico: boolean
  avvertenze: string[]
  conseguenze: { firmeAnonime: number; documentiSenzaAutore: number; sessioniChiuse: number }
  alternativa: string
}

export interface NuovoUtente {
  nome: string
  email: string
  role: Role
  password: string
}

export function useServerUsers() {
  const [utenti, setUtenti] = useState<UtenteApp[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const ricarica = useCallback(async () => {
    setCaricamento(true)
    try {
      const rows = await api.get<Row[]>('/users')
      setUtenti(rows.map(toUtente))
      setErrore(null)
    } catch (e) {
      if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) {
        setUtenti([])
        setErrore(null)
      } else {
        setErrore(e instanceof Error ? e.message : 'Utenti non caricati')
      }
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => { void ricarica() }, [ricarica])

  const crea = useCallback(async (dati: NuovoUtente) => {
    const creato = toUtente(await api.post<Row>('/users', dati))
    // Si ricarica invece di aggiungere in coda: il conteggio delle sessioni e l'ordinamento
    // li decide il server, e una lista costruita a metà qui e a metà lì diverge in fretta.
    await ricarica()
    return creato
  }, [ricarica])

  const aggiorna = useCallback(async (id: string, patch: { nome?: string; role?: Role; attivo?: boolean }) => {
    const aggiornato = toUtente(await api.patch<Row>(`/users/${id}`, patch))
    await ricarica()
    return aggiornato
  }, [ricarica])

  const reimpostaPassword = useCallback(async (id: string, password: string) => {
    await api.post(`/users/${id}/password`, { password })
    await ricarica()
  }, [ricarica])

  // Cosa comporta eliminare: si chiede al server PRIMA di mostrare la conferma, perché
  // solo lui sa quante operazioni ha firmato quell'account e se è l'ultimo amministratore.
  const verificaEliminazione = useCallback(
    (id: string) => api.get<VerificaEliminazioneUtente>(`/users/${id}/deletion-check`),
    [],
  )

  // `confermaStorico` è il secondo sì. Le protezioni vere — il proprio account e l'ultimo
  // amministratore attivo — stanno sul server e non si aggirano da qui.
  const elimina = useCallback(async (id: string, confermaStorico: boolean) => {
    await api.del(`/users/${id}${confermaStorico ? '?conferma=storico' : ''}`)
    await ricarica()
  }, [ricarica])

  return { utenti, caricamento, errore, ricarica, crea, aggiorna, reimpostaPassword, verificaEliminazione, elimina }
}

/** Cambio della **propria** password: non passa dal modulo utenti, vale per qualunque ruolo. */
export async function cambiaPropriaPassword(passwordAttuale: string, passwordNuova: string) {
  return api.post<{ ok: boolean; altreSessioniTerminate: number }>('/auth/change-password', {
    passwordAttuale,
    passwordNuova,
  })
}

/** Stessa soglia del server (users/service.ts): qui serve solo a dirlo prima di inviare. */
export const PASSWORD_MIN = 12
