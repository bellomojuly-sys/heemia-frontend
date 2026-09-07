// Fase 13 — autenticazione reale. Sostituisce il selettore di ruolo demo del prototipo:
// il ruolo ora arriva dalla sessione del server (cookie httpOnly), non è più scelto dall'utente.
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Role } from '../types'
import { api, ApiError, setSessioneScadutaHandler } from '../lib/api'
import { applicaMatriceUtente, type MatriceRuolo } from '../lib/permissions'

export interface AuthUser {
  id: string
  nome: string
  email: string
  role: Role
  /**
   * La matrice dei permessi del proprio ruolo, così come la calcola il server
   * (`GET /auth/me`). Viaggia insieme all'identità e non con una seconda chiamata: il
   * primo fotogramma dell'app deve essere già quello giusto, altrimenti chi ha un ruolo
   * ristretto vedrebbe per un istante voci che non ha.
   */
  permessi?: MatriceRuolo
}

/**
 * Installa la matrice appena arriva. È l'unico punto in cui `src/lib/permissions.ts`
 * smette di usare i valori predefiniti scritti nel codice e passa a quelli veri, decisi
 * dall'amministratore. Con `null` si torna ai predefiniti: succede al logout, e conta,
 * perché la schermata di accesso non deve conservare i permessi di chi è appena uscito.
 */
function installaPermessi(u: AuthUser | null) {
  applicaMatriceUtente(u?.role ?? null, u?.permessi ?? null)
}

interface AuthContextValue {
  user: AuthUser | null
  /** true finché non sappiamo se esiste una sessione valida: evita di lampeggiare il login. */
  loading: boolean
  /** La sessione è caduta mentre si stava usando l'app: la schermata di accesso lo spiega. */
  sessioneScaduta: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /**
   * Rilegge identità e permessi dal server. Serve dopo che un amministratore ha salvato la
   * matrice: senza, l'interfaccia continuerebbe a nascondere (o mostrare) secondo i
   * permessi di prima fino al prossimo accesso, e la modifica sembrerebbe non aver preso.
   */
  ricaricaPermessi: () => Promise<void>
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
      installaPermessi(null)
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
      .then((u) => { if (!annullato) { installaPermessi(u); setUser(u) } })
      .catch(() => { if (!annullato) { installaPermessi(null); setUser(null) } })
      .finally(() => { if (!annullato) setLoading(false) })
    return () => { annullato = true }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.post<AuthUser>('/auth/login', { email, password })
    installaPermessi(u)
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
    installaPermessi(null)
    setSessioneScaduta(false)
    setUser(null)
  }, [])

  const ricaricaPermessi = useCallback(async () => {
    const u = await api.get<AuthUser>('/auth/me')
    installaPermessi(u)
    setUser(u)
  }, [])

  const value = useMemo(
    () => ({ user, loading, sessioneScaduta, login, logout, ricaricaPermessi }),
    [user, loading, sessioneScaduta, login, logout, ricaricaPermessi],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider')
  return ctx
}
