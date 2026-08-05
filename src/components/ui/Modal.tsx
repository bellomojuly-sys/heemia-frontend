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
    // Fase 14: lo sfondo sfuma e sfoca invece di comparire di colpo, il pannello
    // sale di 8px con una micro-scalatura. Entrambe le animazioni sono brevi
    // (0,22-0,28s): il modale deve sembrare già lì, non farsi aspettare.
    <div className="scroll-smooth-y fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-heemia-black/40 px-4 py-10 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg animate-pop rounded-heemia-xl border border-heemia-border bg-white shadow-heemia-lg"
      >
        <div className="flex items-start justify-between gap-4 border-b border-heemia-border px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-medium text-heemia-black">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-heemia-grey">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-full p-1 text-heemia-grey transition-all duration-200 ease-heemia hover:rotate-90 hover:bg-heemia-surface hover:text-heemia-black"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// L'anello di focus (`ring`) sostituisce il salto di bordo secco: il campo attivo
// si accende con un alone tenue invece di cambiare colore di scatto.
export const fieldClass =
  'w-full rounded-heemia-sm border border-heemia-border bg-white px-3 py-1.5 text-sm text-heemia-black transition-all duration-200 ease-heemia placeholder:text-heemia-grey-light hover:border-heemia-border-strong focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10'

/** Variante del campo quando la validazione lo ha segnalato: bordo e alone carminio. */
export const fieldErrorClass =
  'w-full rounded-heemia-sm border border-heemia-carmine/60 bg-white px-3 py-1.5 text-sm text-heemia-black transition-all duration-200 ease-heemia placeholder:text-heemia-grey-light focus:border-heemia-carmine focus:outline-none focus:ring-2 focus:ring-heemia-carmine/15'

/** Scorciatoia: `campoClass(errore)` al posto di scrivere il ternario a ogni input. */
export function campoClass(errore?: string) {
  return errore ? fieldErrorClass : fieldClass
}

// Fase 14 — un campo può portare: l'obbligatorietà (asterisco), un suggerimento e un
// messaggio di errore. L'errore sostituisce il suggerimento invece di aggiungersi, così
// sotto al campo resta sempre una riga sola e il form non "salta" quando compare.
export function Field({
  label,
  children,
  error,
  hint,
  required = false,
}: {
  label: string
  children: ReactNode
  error?: string
  hint?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-heemia-carmine">
            *
          </span>
        )}
      </span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block animate-fade-in text-[11px] text-heemia-carmine">
          {error}
        </span>
      ) : (
        hint && <span className="mt-1 block text-[11px] text-heemia-grey-light">{hint}</span>
      )}
    </label>
  )
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex justify-end gap-2 border-t border-heemia-border pt-4">{children}</div>
}
