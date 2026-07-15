import { useEffect, useRef, useState } from 'react'

// FR-15 / FR-10: ogni KPI economico deve avere una definizione in linguaggio semplice
// accessibile con un click (non solo hover) — la dashboard e i margini sono letti da chi
// non ha formazione finanziaria.
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Cos'è questo?"
        aria-expanded={open}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-heemia-grey-light text-[10px] leading-none text-heemia-grey hover:border-heemia-black hover:text-heemia-black"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-6 z-20 w-56 -translate-x-1/2 rounded-[3px] border border-heemia-border-strong bg-white p-3 text-xs leading-snug text-heemia-black shadow-[0_4px_16px_rgba(23,21,18,0.12)]"
        >
          {text}
        </span>
      )}
    </span>
  )
}
