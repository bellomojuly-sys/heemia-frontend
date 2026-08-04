import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { formatDateTimeIt } from '../../lib/format'
import type { ActivityLogEntry } from '../../types'
import { useMockStore } from '../../context/MockStore'

export function ActivityLogPage() {
  // FR-18: i log vivono nel MockStore, così anche le azioni fatte in sessione
  // (creazioni, avanzamenti fase, approvazioni bozze) compaiono qui.
  const { activityLogs } = useMockStore()
  const sorted = [...activityLogs].sort((a, b) => (a.data < b.data ? 1 : -1))

  const columns: DataTableColumn<ActivityLogEntry>[] = [
    { header: 'Data', accessor: (l) => <span className="font-mono-heemia text-xs">{formatDateTimeIt(l.data)}</span> },
    { header: 'Utente', accessor: (l) => <span className="font-display italic">{l.utente}</span> },
    { header: 'Azione', accessor: (l) => l.azione },
    { header: 'Entità', accessor: (l) => <span className="font-mono-heemia text-xs text-heemia-grey">{l.entita} · {l.entitaId}</span> },
    {
      header: 'Valore',
      accessor: (l) =>
        l.valorePrecedente || l.valoreNuovo ? (
          <span className="font-mono-heemia text-xs">
            {l.valorePrecedente && <span className="text-heemia-grey line-through">{l.valorePrecedente}</span>}
            {l.valorePrecedente && l.valoreNuovo && ' → '}
            {l.valoreNuovo && <span className="text-heemia-black">{l.valoreNuovo}</span>}
          </span>
        ) : (
          '–'
        ),
    },
  ]

  return (
    <div>
      <PageHeader title="Activity log" subtitle="Ogni azione critica tracciata con utente, data, valore precedente e nuovo. Visibile solo ad Admin e CEO." />
      <DataTable columns={columns} rows={sorted} keyExtractor={(l) => l.id} />
    </div>
  )
}
