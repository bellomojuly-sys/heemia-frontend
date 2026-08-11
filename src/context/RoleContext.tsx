import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Role } from '../types'
import { useAuth } from './AuthContext'

interface RoleContextValue {
  role: Role
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined)

/**
 * Il ruolo con cui l'interfaccia si disegna: menu, pagine visibili, colonne dei costi.
 *
 * È **quello della sessione**, letto direttamente da `useAuth` e disponibile già al primo
 * render. Prima veniva da un selettore demo salvato in `localStorage` (con default `admin`)
 * e il ruolo vero lo sovrascriveva dentro una `useEffect`, cioè *dopo* il primo render:
 * chi aveva un ruolo ristretto vedeva per un istante i menu e la pagina di un ruolo che
 * non ha. I dati non uscivano — il server risponde 403 comunque, ed è lui l'autorità —
 * ma l'interfaccia mostrava qualcosa che non doveva mostrare.
 *
 * Senza sessione (schermata di accesso, sub-app showroom) vale `viewer`, il ruolo che può
 * meno: se un giorno un componente venisse montato fuori dall'area riservata, il default
 * sbaglierebbe per difetto e non per eccesso.
 */
export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const role: Role = user?.role ?? 'viewer'
  const value = useMemo(() => ({ role }), [role])

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole deve essere usato dentro RoleProvider')
  return ctx
}
