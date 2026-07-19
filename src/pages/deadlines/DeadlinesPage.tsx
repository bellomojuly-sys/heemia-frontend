import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { KpiTile } from '../../components/dashboard/KpiTile'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { daysBetween } from '../../lib/alerts'
import { deadlines } from '../../mock'
import type { Deadline } from '../../types'
import { useMockStore } from '../../context/MockStore'

const TIPO_LABEL: Record<string, string> = {
  fattura_da_pagare: 'Fattura da pagare', fattura_da_incassare: 'Fattura da incassare', iva: 'IVA',
  contributi: 'Contributi', fornitore: 'Fornitore', commercialista: 'Commercialista', reminder: 'Reminder', abbonamento: 'Abbonamento',
}

export function DeadlinesPage() {
  const { invoices } = useMockStore()
  const stats = useMemo(() => {
    const in7 = deadlines.filter((d) => { const g = daysBetween(d.data); return g >= 0 && g <= 7 })
    const in30 = deadlines.filter((d) => { const g = daysBetween(d.data); return g > 7 && g <= 30 })
    const ritardo = deadlines.filter((d) => d.stato === 'in_ritardo')
    const daPagare = deadlines.filter((d) => d.tipo.includes('pagare') || ['iva', 'contributi', 'commercialista', 'abbonamento'].includes(d.tipo)).reduce((s, d) => s + (d.importo ?? 0), 0)
    // FR-24: anche gli importi da incassare, non solo quelli da pagare.
    const daIncassare = deadlines.filter((d) => d.tipo === 'fattura_da_incassare').reduce((s, d) => s + (d.importo ?? 0), 0)
    return { in7: in7.length, in30: in30.length, ritardo: ritardo.length, daPagare, daIncassare }
  }, [])

  const columns: DataTableColumn<Deadline>[] = [
    { header: 'Descrizione', accessor: (d) => d.descrizione },
    { header: 'Tipo', accessor: (d) => TIPO_LABEL[d.tipo] ?? d.tipo },
    { header: 'Data', accessor: (d) => formatDateIt(d.data) },
    { header: 'Importo', accessor: (d) => (d.importo ? formatCurrency(d.importo) : '–'), align: 'right' },
    { header: 'Stato', accessor: (d) => <StatusBadge status={d.stato} /> },
    {
      header: 'Collegata a',
      accessor: (d) => {
        const inv = invoices.find((i) => i.id === d.collegatoA)
        return inv ? <Link to="/fatture" className="font-mono-heemia text-xs text-heemia-black hover:underline">{inv.numero}</Link> : '–'
      },
    },
  ]

  const sorted = [...deadlines].sort((a, b) => (a.data < b.data ? -1 : 1))

  return (
    <div>
      <PageHeader title="Scadenze" subtitle="Fatture, adempimenti fiscali e reminder amministrativi." />

      <div className="mb-6 flex flex-wrap gap-3">
        <KpiTile label="Entro 7 giorni" value={stats.in7} critical={stats.in7 > 0} />
        <KpiTile label="Entro 30 giorni" value={stats.in30} />
        <KpiTile label="In ritardo" value={stats.ritardo} critical={stats.ritardo > 0} />
        <KpiTile label="Totale da pagare" value={formatCurrency(stats.daPagare)} />
        <KpiTile label="Totale da incassare" value={formatCurrency(stats.daIncassare)} tone="positive" />
      </div>

      <DataTable columns={columns} rows={sorted} keyExtractor={(d) => d.id} />
    </div>
  )
}
