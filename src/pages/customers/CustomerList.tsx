import { useMemo, useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { customers, orders } from '../../mock'
import type { Customer } from '../../types'

const TIPOLOGIA_LABEL: Record<string, string> = {
  ecommerce: 'E-commerce', showroom: 'Showroom', b2b: 'B2B', retailer: 'Retailer', showroom_partner: 'Showroom partner',
}

export function CustomerList() {
  const [search, setSearch] = useState('')
  const [tipologia, setTipologia] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      customers.filter((c) => {
        if (search && !c.nome.toLowerCase().includes(search.toLowerCase())) return false
        if (tipologia && c.tipologia !== tipologia) return false
        return true
      }),
    [search, tipologia],
  )

  const columns: DataTableColumn<Customer>[] = [
    { header: 'Cliente', accessor: (c) => <span className="font-display italic text-heemia-black">{c.nome}</span> },
    { header: 'Email', accessor: (c) => <span className="font-mono-heemia text-xs">{c.email ?? '—'}</span> },
    { header: 'Paese', accessor: (c) => c.paese },
    { header: 'Tipologia', accessor: (c) => <Badge variant="neutral">{TIPOLOGIA_LABEL[c.tipologia]}</Badge> },
    { header: 'Valore acquistato', accessor: (c) => formatCurrency(c.valoreTotaleAcquistato), align: 'right' },
    { header: 'Ordini', accessor: (c) => c.numeroOrdini, align: 'right' },
    { header: 'Sconto', accessor: (c) => (c.sconto ? `${c.sconto}%` : '—'), align: 'right' },
  ]

  const expandedOrders = expandedId ? orders.filter((o) => o.customerId === expandedId) : []

  return (
    <div>
      <PageHeader title="Clienti" subtitle="E-commerce, showroom, B2B e retailer (FR-25)." />
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca cliente…"
        filters={[{ label: 'Tipologia', value: tipologia, onChange: setTipologia, options: Object.entries(TIPOLOGIA_LABEL).map(([value, label]) => ({ value, label })) }]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        keyExtractor={(c) => c.id}
        onRowClick={(c) => setExpandedId(expandedId === c.id ? null : c.id)}
        emptyTitle="Nessun cliente trovato"
        emptyDescription="Nessun cliente corrisponde a questa tipologia."
      />

      {expandedId && (
        <div className="mt-4 rounded-[3px] border border-heemia-border bg-white p-5">
          <p className="font-display mb-3 italic text-heemia-black">
            Ordini di {customers.find((c) => c.id === expandedId)?.nome}
          </p>
          {expandedOrders.length === 0 ? (
            <p className="text-sm text-heemia-grey">Nessun ordine registrato.</p>
          ) : (
            <ul className="divide-y divide-heemia-border">
              {expandedOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-mono-heemia text-xs">{o.numero} · {formatDateIt(o.data)}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono-heemia">{formatCurrency(o.totale)}</span>
                    <StatusBadge status={o.stato} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
