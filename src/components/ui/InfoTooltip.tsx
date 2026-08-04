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
        className="flex h-4 w-4 items-center justify-center rounded-full border border-heemia-grey-light text-[10px] leading-none text-heemia-grey transition-all duration-200 ease-heemia hover:scale-110 hover:border-heemia-black hover:text-heemia-black"
      >
        i
      </button>
      {/* Qui serve `animate-fade-in` e non `animate-pop`: quest'ultima anima la
          `transform`, che sovrascriverebbe il `-translate-x-1/2` di centratura. */}
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-6 z-20 w-56 -translate-x-1/2 animate-fade-in rounded-heemia border border-heemia-border-strong bg-white p-3 text-xs leading-snug text-heemia-black shadow-heemia-md"
        >
          {text}
        </span>
      )}
    </span>
  )
}
