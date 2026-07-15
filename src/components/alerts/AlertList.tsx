import { Link } from 'react-router-dom'
import type { AlertItem } from '../../types'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/States'

// Solo carminio come accent (UI_Design_System.md) — l'urgenza si distingue per intensità,
// non introducendo nuovi colori fuori palette.
const LEVEL_DOT: Record<AlertItem['livello'], string> = {
  critico: 'bg-heemia-carmine',
  attenzione: 'bg-heemia-carmine/45',
  info: 'bg-heemia-grey-light',
}

export function AlertList({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) {
    return <EmptyState title="Nessun alert attivo" description="Non ci sono segnalazioni per i moduli visibili a questo ruolo." />
  }

  return (
    <ul className="divide-y divide-heemia-border rounded-[3px] border border-heemia-border bg-white">
      {alerts.map((a) => {
        const content = (
          <div className="flex items-start gap-3 px-4 py-3">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[a.livello]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-heemia-black">{a.messaggio}</p>
              <Badge variant="neutral">{a.modulo}</Badge>
            </div>
          </div>
        )
        return (
          <li key={a.id}>
            {a.link ? (
              <Link to={a.link} className="block transition-colors hover:bg-heemia-cream">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        )
      })}
    </ul>
  )
}
