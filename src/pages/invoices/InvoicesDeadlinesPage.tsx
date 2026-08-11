import { NavLink, Outlet } from 'react-router-dom'
import { FileText, CalendarClock } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { useDataStore } from '../../context/DataStore'
import { useServerDeadlines } from '../../hooks/useServerDeadlines'
import { daysBetween } from '../../lib/alerts'
import type { AmministrazioneOutlet } from './amministrazioneOutlet'

/**
 * Vista unica "Fatture e scadenze" (2026-08-10): una voce di menu, due schede.
 * Stesso schema di FR-36 per l'Inventario — e qui il motivo è ancora più diretto:
 * le scadenze nascono in buona parte dalle fatture da pagare, quindi tenerle in due
 * pagine separate obbligava a saltare avanti e indietro fra le due.
 *
 * Il gating non cambia: `fatture` e `scadenze` sono entrambi Admin/CEO, come per le
 * tre chiavi fuse dell'inventario. Le schede restano route annidate, così i deep-link
 * continuano a funzionare (i vecchi /scadenze reindirizzano qui).
 */

/**
 * Le scadenze si caricano una volta sola qui e scendono alla scheda via outlet context:
 * il contatore della scheda e la tabella leggono la stessa lista, con una sola chiamata.
 */
export function InvoicesDeadlinesPage() {
  const { invoices } = useDataStore()
  const deadlines = useServerDeadlines()

  const scadute = invoices.filter((i) => i.statoPagamento === 'scaduta').length
  const daCategorizzare = invoices.filter((i) => !i.associata).length
  const urgenti = deadlines.filter((d) => {
    if (d.stato === 'saldata') return false
    if (d.stato === 'in_ritardo') return true
    const giorni = daysBetween(d.data)
    return giorni >= 0 && giorni <= 7
  }).length

  const SECTIONS = [
    {
      to: 'elenco',
      label: 'Fatture',
      icon: FileText,
      count: `${invoices.length} in archivio`,
      // Due segnali diversi, entrambi da guardare: una fattura scaduta è un pagamento
      // in ritardo, una non categorizzata è un costo che non arriva ancora nei margini.
      alert: [scadute > 0 ? `${scadute} scadute` : null, daCategorizzare > 0 ? `${daCategorizzare} da categorizzare` : null]
        .filter(Boolean)
        .join(' · '),
    },
    {
      to: 'scadenze',
      label: 'Scadenze',
      icon: CalendarClock,
      count: `${deadlines.length} in elenco`,
      alert: urgenti > 0 ? `${urgenti} entro 7 giorni o in ritardo` : '',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Fatture e scadenze"
        subtitle="Documenti di acquisto e vendita, chiusure di cassa e tutte le date da rispettare in un'unica vista."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SECTIONS.map(({ to, label, icon: Icon, count, alert }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `surface-interactive flex items-center gap-3 rounded-heemia-lg border bg-white px-4 py-3.5 shadow-heemia-sm ${
                isActive ? 'border-heemia-black shadow-heemia-md' : 'border-heemia-border'
              }`
            }
          >
            <Icon aria-hidden className="h-5 w-5 shrink-0 text-heemia-grey" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-heemia-black">{label}</p>
              <p className="font-mono-heemia text-xs text-heemia-grey">
                {count}
                {alert && <span className="text-heemia-carmine"> · {alert}</span>}
              </p>
            </div>
          </NavLink>
        ))}
      </div>

      <Outlet context={{ deadlines } satisfies AmministrazioneOutlet} />
    </div>
  )
}
