import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4 border-b border-heemia-border pb-5">
      <div>
        <h1 className="font-display text-3xl italic tracking-tight text-heemia-black">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-heemia-grey">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
