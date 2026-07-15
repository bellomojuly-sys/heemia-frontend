// Nessun prodotto mock ha immagini reali (FR-16/Drive fuori scope in questa fase):
// tile con iniziale al posto di <img> rotte.
export function ImagePlaceholder({ label, className = '' }: { label: string; className?: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className={`font-display flex items-center justify-center rounded-[3px] border border-heemia-border bg-heemia-cream italic text-heemia-grey ${className}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  )
}
