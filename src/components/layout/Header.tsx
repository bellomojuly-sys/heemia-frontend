import { Link } from 'react-router-dom'
import { Menu, Sparkles } from 'lucide-react'
import { useRole } from '../../context/RoleContext'
import { canAccessModule, ROLE_LABELS } from '../../lib/permissions'
import type { Role } from '../../types'
import { formatDateIt } from '../../lib/format'
import { TODAY } from '../../lib/alerts'

const SELECTABLE_ROLES: Role[] = ['admin', 'ceo', 'team', 'viewer']

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { role, setRole } = useRole()

  return (
    <header className="flex items-center justify-between gap-3 border-b border-heemia-border bg-heemia-white px-4 py-3.5 sm:px-8">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Apri menu"
            className="rounded-[3px] border border-heemia-border p-1.5 text-heemia-black lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        <p className="font-mono-heemia hidden text-[11px] uppercase tracking-[0.1em] text-heemia-grey-light sm:block">
          {formatDateIt(TODAY.toISOString())}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {/* FR-28: l'assistente è raggiungibile da qualsiasi sezione tramite l'header. */}
        {canAccessModule(role, 'ai-assistant') && (
          <Link
            to="/assistente"
            className="inline-flex items-center gap-1.5 rounded-[3px] border border-heemia-border px-2.5 py-1.5 text-xs text-heemia-grey transition-colors hover:border-heemia-black hover:text-heemia-black"
          >
            <Sparkles aria-hidden className="h-3.5 w-3.5" /> <span className="hidden sm:inline">AI Assistant</span>
          </Link>
        )}
        <span className="font-mono-heemia hidden text-[10px] uppercase tracking-[0.1em] text-heemia-grey-light sm:inline">
          Ruolo demo
        </span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-[3px] border border-heemia-border bg-white px-3 py-1.5 text-sm text-heemia-black transition-colors focus:border-heemia-black focus:outline-none"
        >
          {SELECTABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
    </header>
  )
}
