import type { HTMLAttributes, ReactNode } from 'react'

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-[3px] border border-heemia-border bg-white ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-heemia-border px-5 py-4">
      <div>
        <h2 className="font-display text-base italic text-heemia-black">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-heemia-grey">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
