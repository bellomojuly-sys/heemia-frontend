import { Fragment, useState, type ReactNode } from 'react'
import { EmptyState, LoadingState } from './States'

export interface DataTableColumn<T> {
  header: string
  accessor: (row: T) => ReactNode
  className?: string
  align?: 'left' | 'right'
}

export function DataTable<T>({
  columns,
  rows,
  keyExtractor,
  onRowClick,
  renderDetail,
  loading = false,
  emptyTitle = 'Nessun risultato',
  emptyDescription = 'Nessun elemento corrisponde ai filtri applicati.',
}: {
  columns: DataTableColumn<T>[]
  rows: T[]
  keyExtractor: (row: T) => string
  onRowClick?: (row: T) => void
  /** Se presente, ogni riga diventa espandibile per mostrare campi secondari senza affollare la tabella. */
  renderDetail?: (row: T) => ReactNode
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="rounded-[3px] border border-heemia-border bg-white">
        <LoadingState rows={5} />
      </div>
    )
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  const clickable = Boolean(onRowClick || renderDetail)

  return (
    <div className="overflow-x-auto rounded-[3px] border border-heemia-border bg-white">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-heemia-border-strong text-left">
            {columns.map((col) => (
              <th
                key={col.header}
                className={`font-mono-heemia px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-heemia-grey ${
                  col.align === 'right' ? 'text-right' : ''
                } ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = keyExtractor(row)
            const isOpen = expanded === key
            return (
              <Fragment key={key}>
                <tr
                  onClick={() => {
                    onRowClick?.(row)
                    if (renderDetail) setExpanded(isOpen ? null : key)
                  }}
                  className={`border-b border-heemia-border transition-colors last:border-0 ${
                    clickable ? 'cursor-pointer hover:bg-heemia-cream' : ''
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.header}
                      className={`px-4 py-3 align-middle text-heemia-black ${
                        col.align === 'right' ? 'font-mono-heemia text-right' : ''
                      } ${col.className ?? ''}`}
                    >
                      {col.accessor(row)}
                    </td>
                  ))}
                </tr>
                {renderDetail && isOpen && (
                  <tr className="border-b border-heemia-border bg-heemia-cream last:border-0">
                    <td colSpan={columns.length} className="px-4 py-4">
                      {renderDetail(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
