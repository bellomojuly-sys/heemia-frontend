import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-heemia-black/40 px-4 py-10">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-[3px] border border-heemia-border bg-white shadow-lg"
      >
        <div className="flex items-start justify-between gap-4 border-b border-heemia-border px-5 py-4">
          <div>
            <h2 className="font-display text-lg italic text-heemia-black">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-heemia-grey">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="text-heemia-grey transition-colors hover:text-heemia-black"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export const fieldClass =
  'w-full rounded-[3px] border border-heemia-border bg-white px-3 py-1.5 text-sm text-heemia-black transition-colors placeholder:text-heemia-grey-light focus:border-heemia-black focus:outline-none'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{label}</span>
      {children}
    </label>
  )
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex justify-end gap-2 border-t border-heemia-border pt-4">{children}</div>
}
