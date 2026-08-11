import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { formatDateTimeIt } from '../../lib/format'
import type { ActivityLogEntry } from '../../types'
import { useDataStore } from '../../context/DataStore'

export function ActivityLogPage() {
  // FR-18: i log vivono nel DataStore, così anche le azioni fatte in sessione
  // (creazioni, avanzamenti fase, approvazioni bozze) compaiono qui.
  const { activityLogs, caricamento } = useDataStore()
  const sorted = [...activityLogs].sort((a, b) => (a.data < b.data ? 1 : -1))

  const columns: DataTableColumn<ActivityLogEntry>[] = [
    { header: 'Data', accessor: (l) => <span className="font-mono-heemia text-xs">{formatDateTimeIt(l.data)}</span> },
    { header: 'Utente', accessor: (l) => <span className="font-display">{l.utente}</span> },
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
      <p className="mb-5 text-sm text-heemia-grey">
        Ogni azione critica con utente, data, valore precedente e nuovo. Visibile soltanto ad Admin e CEO.
      </p>
      <DataTable
        loading={caricamento} columns={columns} rows={sorted} keyExtractor={(l) => l.id} />
    </div>
  )
}
