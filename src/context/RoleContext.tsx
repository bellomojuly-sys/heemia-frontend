import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Role } from '../types'

interface RoleContextValue {
  role: Role
  setRole: (role: Role) => void
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined)

const STORAGE_KEY = 'heemia-demo-role'

function readInitialRole(): Role {
  if (typeof window === 'undefined') return 'admin'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'admin' || stored === 'ceo' || stored === 'team' || stored === 'viewer' || stored === 'showroom') {
    return stored
  }
  return 'admin'
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(readInitialRole)

  const setRole = (next: Role) => {
    setRoleState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  const value = useMemo(() => ({ role, setRole }), [role])

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole deve essere usato dentro RoleProvider')
  return ctx
}
