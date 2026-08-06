// Fase 13 — autenticazione reale. Sostituisce il selettore di ruolo demo del prototipo:
// il ruolo ora arriva dalla sessione del server (cookie httpOnly), non è più scelto dall'utente.
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Role } from '../types'
import { api, ApiError, setSessioneScadutaHandler } from '../lib/api'

export interface AuthUser {
  id: string
  nome: string
  email: string
  role: Role
}

interface AuthContextValue {
  user: AuthUser | null
  /** true finché non sappiamo se esiste una sessione valida: evita di lampeggiare il login. */
  loading: boolean
  /** La sessione è caduta mentre si stava usando l'app: la schermata di accesso lo spiega. */
  sessioneScaduta: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessioneScaduta, setSessioneScaduta] = useState(false)
  // Serve dentro il gestore registrato una volta sola: legge l'utente corrente senza
  // riagganciare il gestore a ogni cambio di stato.
  const userRef = useRef<AuthUser | null>(null)
  useEffect(() => { userRef.current = user }, [user])

  // Qualunque chiamata all'API che torni 401 riporta qui: si esce dall'area riservata e
  // la ragione viene detta nel login, invece di lasciare l'app con dati a metà e un
  // messaggio tecnico ("Non autenticato") in cima alla pagina.
  useEffect(() => {
    setSessioneScadutaHandler(() => {
      if (!userRef.current) return
      userRef.current = null
      setUser(null)
      setSessioneScaduta(true)
    })
    return () => setSessioneScadutaHandler(null)
  }, [])

  // Al primo caricamento chiediamo al server chi siamo: se il cookie è ancora valido
  // si rientra senza dover rifare il login.
  useEffect(() => {
    let annullato = false
    api
      .get<AuthUser>('/auth/me')
      .then((u) => { if (!annullato) setUser(u) })
      .catch(() => { if (!annullato) setUser(null) })
      .finally(() => { if (!annullato) setLoading(false) })
    return () => { annullato = true }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.post<AuthUser>('/auth/login', { email, password })
    setSessioneScaduta(false)
    setUser(u)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch (e) {
      // Sessione già scaduta lato server: l'uscita locale deve avvenire comunque.
      if (!(e instanceof ApiError && e.isAuthError)) throw e
    }
    // Uscita voluta: nessun avviso di sessione scaduta nel login.
    setSessioneScaduta(false)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, sessioneScaduta, login, logout }),
    [user, loading, sessioneScaduta, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider')
  return ctx
}
