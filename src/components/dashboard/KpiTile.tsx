import type { ReactNode } from 'react'
import { InfoTooltip } from '../ui/InfoTooltip'

// Card KPI singola e autonoma (non più una striscia condivisa con divisori interni): ogni
// tile porta il proprio bordo/sfondo, così le card restano visivamente separate quando vanno
// a capo su più righe. Il critico si segnala con un punto carminio, non con un riquadro rosso
// pieno: l'accent resta "uso controllato, mai dominante" (UI_Design_System.md).
//
// Gerarchia FR-30: i KPI primari (weight="primary") portano numero grande e colore semantico
// pieno secondo `tone`. I KPI secondari (weight="secondary") sono numero piccolo e grigio
// tenue di default, salvo `critical`, che vince sempre e riporta al rosso carminio pieno
// (una criticità reale non deve mai restare visivamente in secondo piano).
//
// Addendum UI_Design_System.md: eccezione mirata alla regola dei titoli in serif corsivo, qui
// sia l'etichetta che il numero sono sans-serif (stessa famiglia, "Inter"), con icona
// decorativa di categoria in alto a destra e padding verticale ridotto. Il tooltip (i) resta
// invariato nella posizione accanto all'etichetta. I numeri usano cifre tabulari così restano
// allineati in modo uniforme da una card all'altra.
export type KpiTone = 'positive' | 'informational' | 'neutral'

const TONE_TEXT: Record<KpiTone, string> = {
  positive: 'text-heemia-green',
  informational: 'text-heemia-blue',
  neutral: 'text-heemia-black',
}

export function KpiTile({
  label,
  value,
  tooltip,
  critical = false,
  weight = 'primary',
  tone = 'neutral',
  icon,
}: {
  label: string
  value: string | number
  tooltip?: string
  critical?: boolean
  weight?: 'primary' | 'secondary'
  tone?: KpiTone
  icon?: ReactNode
}) {
  const isPrimary = weight === 'primary'
  const valueColor = critical ? 'text-heemia-carmine' : isPrimary ? TONE_TEXT[tone] : 'text-heemia-grey'
  const valueSize = isPrimary ? 'text-[1.75rem]' : 'text-[1.25rem]'

  return (
    <div className="relative min-w-[9.5rem] flex-1 rounded-[3px] border border-heemia-border bg-white px-4 py-2.5">
      {icon && (
        <span aria-hidden className="absolute right-4 top-2.5 text-heemia-grey-light [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      )}
      <div className="flex items-center gap-1.5 pr-5">
        {critical && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-heemia-carmine" />}
        <p className="font-sans text-[10px] font-medium uppercase tracking-[0.08em] text-heemia-grey">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <p className={`font-sans mt-1 leading-none font-medium tabular-nums ${valueSize} ${valueColor}`}>
        {value}
      </p>
    </div>
  )
}
