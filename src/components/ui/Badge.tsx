import type { ReactNode } from 'react'

type BadgeVariant = 'neutral' | 'critical' | 'warning' | 'success' | 'info'

// Palette rigorosamente limitata a nero/grigio/bianco/crema/carminio (UI_Design_System.md).
// Il carminio resta l'unico accent — usato anche per "attenzione", mai per altro.
const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-heemia-cream-dark text-heemia-black border-heemia-border-strong',
  critical: 'bg-heemia-carmine-light text-heemia-carmine border-heemia-carmine/25',
  warning: 'bg-white text-heemia-carmine border-heemia-carmine/30',
  success: 'bg-white text-heemia-black border-heemia-border-strong',
  info: 'bg-heemia-cream text-heemia-grey border-heemia-border',
}

const DOT_CLASSES: Partial<Record<BadgeVariant, string>> = {
  critical: 'bg-heemia-carmine',
  warning: 'bg-heemia-carmine/70',
  success: 'bg-heemia-black',
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
