import type { ReactNode } from 'react'

type BadgeVariant = 'neutral' | 'critical' | 'warning' | 'success' | 'info' | 'critical-solid' | 'warning-outline'

// Palette base: nero/grigio/bianco/crema/carminio (UI_Design_System.md), estesa con
// verde/arancione/blu per stati semantici (DEC-016) — solo su badge/KPI puntuali, mai su
// superfici larghe. `critical-solid`/`warning-outline` esistono per distinguere a colpo
// d'occhio esaurito (rosso pieno) da sotto soglia (arancione tenue) nella Dashboard (FR-30 §4),
// senza toccare il significato delle varianti esistenti già usate altrove (Fatture, Inventario).
const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-heemia-cream-dark text-heemia-black border-heemia-border-strong',
  critical: 'bg-heemia-carmine-light text-heemia-carmine border-heemia-carmine/25',
  warning: 'bg-white text-heemia-carmine border-heemia-carmine/30',
  success: 'bg-white text-heemia-black border-heemia-border-strong',
  info: 'bg-heemia-cream text-heemia-grey border-heemia-border',
  'critical-solid': 'bg-heemia-carmine text-white border-heemia-carmine',
  'warning-outline': 'bg-heemia-orange-light text-heemia-orange border-heemia-orange/40',
}

const DOT_CLASSES: Partial<Record<BadgeVariant, string>> = {
  critical: 'bg-heemia-carmine',
  warning: 'bg-heemia-carmine/70',
  success: 'bg-heemia-black',
  'warning-outline': 'bg-heemia-orange',
}

export function Badge({ children, variant = 'neutral' }: { children: ReactNode; variant?: BadgeVariant }) {
  const dot = DOT_CLASSES[variant]
  return (
    <span
      className={`font-mono-heemia inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] whitespace-nowrap ${VARIANT_CLASSES[variant]}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {children}
    </span>
  )
}
