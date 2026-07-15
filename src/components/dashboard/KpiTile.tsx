import { InfoTooltip } from '../ui/InfoTooltip'

// Cella di uno stat-strip (vedi Dashboard) — niente bordo/sfondo proprio, il contenitore
// padre fornisce le divisioni. Il critico si segnala con un punto carminio, non con un
// riquadro rosso pieno: l'accent resta "uso controllato, mai dominante" (UI_Design_System.md).
export function KpiTile({
  label,
  value,
  tooltip,
  critical = false,
}: {
  label: string
  value: string | number
  tooltip?: string
  critical?: boolean
}) {
  return (
    <div className="min-w-[9.5rem] flex-1 px-5 py-4 first:pl-0">
      <div className="flex items-center gap-1.5">
        {critical && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-heemia-carmine" />}
        <p className="font-mono-heemia text-[10px] uppercase tracking-[0.08em] text-heemia-grey">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <p className={`font-display mt-1.5 text-[1.75rem] leading-none ${critical ? 'text-heemia-carmine' : 'text-heemia-black'}`}>
        {value}
      </p>
    </div>
  )
}
