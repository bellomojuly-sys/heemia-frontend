import type { ReactNode } from 'react'

// Stati richiesti da UI_Design_System.md: il prototipo non è completo se mostra solo "tutto va bene".

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[3px] border border-dashed border-heemia-border-strong bg-heemia-cream px-6 py-14 text-center">
      <p className="font-display text-lg italic text-heemia-black">{title}</p>
      <p className="max-w-sm text-xs text-heemia-grey">{description}</p>
      {action}
    </div>
  )
}

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-5" aria-busy="true" aria-label="Caricamento in corso">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-[3px] bg-heemia-cream-dark" />
      ))}
    </div>
  )
}
