import type { ReactNode } from 'react'

export interface ToolbarFilter {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}

export function Toolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Cerca…',
  filters = [],
  right,
}: {
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  filters?: ToolbarFilter[]
  right?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {onSearchChange && (
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-56 rounded-[3px] border border-heemia-border bg-white px-3 py-1.5 text-sm text-heemia-black transition-colors placeholder:text-heemia-grey-light focus:border-heemia-black focus:outline-none"
        />
      )}
      {filters.map((f) => (
        <select
          key={f.label}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
          className="rounded-[3px] border border-heemia-border bg-white px-3 py-1.5 text-sm text-heemia-black transition-colors focus:border-heemia-black focus:outline-none"
        >
          <option value="">{f.label}: tutti</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      <div className="ml-auto">{right}</div>
    </div>
  )
}
