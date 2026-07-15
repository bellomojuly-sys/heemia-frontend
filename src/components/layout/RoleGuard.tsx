import type { ReactNode } from 'react'
import { useRole } from '../../context/RoleContext'
import { canAccessModule, type ModuleKey } from '../../lib/permissions'
import { EmptyState } from '../ui/States'

// Blocca l'accesso anche via URL diretto, non solo nascondendo la voce di menu —
// requisito esplicito di 04_Security/User_Roles_Permissions.md.
export function RoleGuard({ moduleKey, children }: { moduleKey: ModuleKey; children: ReactNode }) {
  const { role } = useRole()

  if (!canAccessModule(role, moduleKey)) {
    return (
      <EmptyState
        title="Accesso non disponibile per questo ruolo"
        description="Il ruolo attivo non è autorizzato a vedere questa sezione. Vedi 04_Security/User_Roles_Permissions.md."
      />
    )
  }

  return <>{children}</>
}
