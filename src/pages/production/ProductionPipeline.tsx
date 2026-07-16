import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { ProductionKanban } from '../../components/production/ProductionKanban'
import { formatDateIt } from '../../lib/format'
import { stageLabel } from '../../lib/production'
import { products } from '../../mock'
import type { ProductionStep } from '../../types'
import { useMockStore } from '../../context/MockStore'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'

export function ProductionPipeline() {
  const { role } = useRole()
  const { productionSteps, advanceProductionStep } = useMockStore()
  const canAct = canEdit(role)

  const activeSteps = productionSteps.filter((s) => s.fase !== 'archivio')

  const columns: DataTableColumn<ProductionStep>[] = [
    {
      header: 'Prodotto',
      accessor: (s) => (
        <Link to={`/prodotti/${s.productId}`} className="font-display italic text-heemia-black hover:underline">
          {products.find((p) => p.id === s.productId)?.nome ?? s.productId}
        </Link>
      ),
    },
    { header: 'Fase', accessor: (s) => stageLabel(s.fase) },
    { header: 'Responsabile', accessor: (s) => s.responsabile },
    { header: 'Iniziato il', accessor: (s) => (s.dataInizio ? formatDateIt(s.dataInizio) : '–') },
    {
      header: 'Stato',
      accessor: (s) => (s.bloccata ? <span className="text-heemia-carmine">{s.motivoBlocco ?? 'Bloccata'}</span> : 'In corso'),
    },
    { header: 'Note', accessor: (s) => s.note ?? '–' },
  ]

  return (
    <div>
      <PageHeader
        title="Pipeline produzione"
        subtitle="Vista a fasi (kanban): una colonna per fase, dall'idea a pronto per ecommerce. L'avanzamento è bloccato se manca la scheda tecnica prima di Prototipo, Campionario o Produzione."
      />

      <ProductionKanban steps={activeSteps} canAct={canAct} onAdvance={advanceProductionStep} />

      <Card>
        <CardHeader title="Tutti i prodotti in produzione" subtitle={`${activeSteps.length} prodotti attivi in pipeline`} />
        <div className="p-4">
          <DataTable
            columns={columns}
            rows={activeSteps}
            keyExtractor={(s) => s.id}
            emptyTitle="Nessun prodotto in produzione"
            emptyDescription="Non ci sono prodotti attualmente in pipeline."
          />
        </div>
      </Card>
    </div>
  )
}
