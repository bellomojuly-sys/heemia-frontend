import type { ReactNode } from 'react'

// Stati richiesti da UI_Design_System.md: il prototipo non è completo se mostra solo "tutto va bene".

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex animate-rise flex-col items-center justify-center gap-2 rounded-heemia-lg border border-dashed border-heemia-border-strong bg-heemia-surface px-6 py-14 text-center">
      <p className="font-display text-lg font-medium text-heemia-black">{title}</p>
      <p className="max-w-sm text-xs text-heemia-grey">{description}</p>
      {action}
    </div>
  )
}

// Fase 14: lo scheletro pulsa a onda invece che tutto insieme — ogni riga parte
// 120 ms dopo la precedente. Costa una riga di stile e toglie l'effetto "blocco
// che lampeggia", che è la cosa che fa sembrare l'attesa più lunga di quanto sia.
export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-5" aria-busy="true" aria-label="Caricamento in corso">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 animate-shimmer rounded-heemia bg-heemia-surface-muted"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  )
}
