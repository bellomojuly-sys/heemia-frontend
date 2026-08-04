import type { HTMLAttributes, ReactNode } from 'react'

// Fase 14: la card è la superficie base dell'app. Raggio ampio (`rounded-heemia-lg`)
// e ombra tenue costante, così il contenuto "galleggia" sul crema invece di essere
// un rettangolo incollato. `interactive` va messo solo dove la card è cliccabile:
// aggiunge il sollevamento al passaggio del mouse (regola `.surface-interactive`
// in index.css, unica per tutta l'app).
export function Card({
  children,
  className = '',
  interactive = false,
  ...rest
}: { children: ReactNode; className?: string; interactive?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`heemia-card rounded-heemia-lg border border-heemia-border bg-white shadow-heemia-sm ${
        interactive ? 'surface-interactive cursor-pointer' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-heemia-border px-5 py-4">
      <div>
        <h2 className="font-display text-base font-medium text-heemia-black">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-heemia-grey">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
