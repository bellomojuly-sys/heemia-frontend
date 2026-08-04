// Fase 13 — autenticazione reale. Sostituisce il selettore di ruolo demo del prototipo:
// il ruolo ora arriva dalla sessione del server (cookie httpOnly), non è più scelto dall'utente.
import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Role } from '../types'
import { api, ApiError } from '../lib/api'

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
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

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
    setUser(u)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch (e) {
      // Sessione già scaduta lato server: l'uscita locale deve avvenire comunque.
      if (!(e instanceof ApiError && e.isAuthError)) throw e
    }
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider')
  return ctx
}
