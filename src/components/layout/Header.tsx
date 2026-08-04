import { Link } from 'react-router-dom'
import { LogOut, Menu, Sparkles } from 'lucide-react'
import { useRole } from '../../context/RoleContext'
import { useAuth } from '../../context/AuthContext'
import { canAccessModule, ROLE_LABELS } from '../../lib/permissions'
import { formatDateIt } from '../../lib/format'
import { TODAY } from '../../lib/alerts'

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { role } = useRole()
  const { user, logout } = useAuth()

  return (
    // `backdrop-blur` + sfondo semitrasparente: quando il contenuto scorre sotto
    // l'header si intravede sfocato invece di sparire di netto sotto un blocco bianco.
    <header className="z-30 flex shrink-0 items-center justify-between gap-3 border-b border-heemia-border bg-heemia-white/85 px-4 py-3.5 shadow-heemia-xs backdrop-blur-md sm:px-8">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Apri menu"
            className="rounded-heemia-sm border border-heemia-border p-1.5 text-heemia-black transition-all duration-200 ease-heemia hover:border-heemia-black hover:bg-heemia-cream active:scale-95 lg:hidden"
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
            className="inline-flex items-center gap-1.5 rounded-heemia-sm border border-heemia-border px-2.5 py-1.5 text-xs text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-black hover:bg-heemia-cream hover:text-heemia-black active:scale-95"
          >
            <Sparkles aria-hidden className="h-3.5 w-3.5" /> <span className="hidden sm:inline">AI Assistant</span>
          </Link>
        )}
        {/* Fase 13: il selettore di ruolo demo è stato rimosso. Il ruolo arriva dalla
            sessione autenticata ed è applicato dal server su ogni endpoint. */}
        <div className="hidden text-right sm:block">
          <p className="text-xs text-heemia-black">{user?.nome}</p>
          <p className="font-mono-heemia text-[10px] uppercase tracking-[0.1em] text-heemia-grey-light">
            {ROLE_LABELS[role]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="inline-flex items-center gap-1.5 rounded-heemia-sm border border-heemia-border px-2.5 py-1.5 text-xs text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-black hover:bg-heemia-cream hover:text-heemia-black active:scale-95"
        >
          <LogOut aria-hidden className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Esci</span>
        </button>
      </div>
    </header>
  )
}
