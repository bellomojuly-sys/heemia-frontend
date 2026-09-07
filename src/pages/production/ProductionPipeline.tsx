import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PackageCheck } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { ProductionKanban } from '../../components/production/ProductionKanban'
import { AddProductForm } from '../../components/products/AddProductForm'
import { formatDateIt } from '../../lib/format'
import { stageLabel } from '../../lib/production'
import { ULTIMA_FASE_PIPELINE, inPipeline, type ProductionStep } from '../../types'
import { useDataStore } from '../../context/DataStore'
import { useRole } from '../../context/RoleContext'
import { canWrite } from '../../lib/permissions'

/**
 * Pipeline di produzione: **solo i capi che stanno attraversando una lavorazione**.
 *
 * Prima questa pagina mostrava tutto il catalogo e lo intitolava «Tutti i prodotti in
 * produzione». Con il censimento importato erano 93 capi finiti da anni, contati come
 * prodotti in produzione: il numero in cima alla pagina era falso, e il kanban era una
 * colonna sola con dentro l'intera azienda.
 *
 * Il filtro lo applica il server (`GET /production` filtra sulle fasi della pipeline);
 * qui si ripete sulla lista locale perché la stessa pagina resti coerente anche se un
 * capo cambia fase senza ricaricare.
 */
export function ProductionPipeline() {
  const { role } = useRole()
  const { products, productionSteps, advanceProductionStep, addProduct, caricamento } = useDataStore()
  const canAct = canWrite(role, 'produzione')
  const [addOpen, setAddOpen] = useState(false)

  // In pipeline stanno le fasi di lavorazione. Un capo con la produzione conclusa non è
  // «archiviato»: è finito, ed è nell'inventario — due cose diverse che prima finivano
  // nello stesso filtro (`fase !== 'archivio'`).
  const inLavorazione = useMemo(
    () => productionSteps.filter((s) => inPipeline(s.fase)),
    [productionSteps],
  )

  const fuoriPipeline = products.filter((p) => !inPipeline(p.stato) && p.stato !== 'archivio').length

  const columns: DataTableColumn<ProductionStep>[] = [
    {
      header: 'Capo',
      accessor: (s) => (
        <Link to={`/prodotti/${s.productId}`} className="font-display text-heemia-black hover:underline">
          {products.find((p) => p.id === s.productId)?.nome ?? s.productId}
        </Link>
      ),
    },
    { header: 'Fase', accessor: (s) => stageLabel(s.fase) },
    { header: 'Iniziato il', accessor: (s) => (s.dataInizio ? formatDateIt(s.dataInizio) : '–') },
    {
      header: 'Stato',
      accessor: (s) =>
        s.bloccata ? (
          <span className="text-heemia-carmine">{s.motivoBlocco ?? 'Bloccata'}</span>
        ) : s.fase === ULTIMA_FASE_PIPELINE ? (
          'In produzione — ultima fase'
        ) : (
          'In lavorazione'
        ),
    },
    { header: 'Note', accessor: (s) => s.note ?? '–' },
  ]

  return (
    <div>
      <PageHeader
        title="Pipeline produzione"
        subtitle="I capi che stanno attraversando una lavorazione, una colonna per fase. Completata la produzione il capo esce dalla pipeline ed entra nello stock: da lì è disponibile alla vendita."
        action={canAct ? <Button onClick={() => setAddOpen(true)}>Nuovo capo</Button> : undefined}
      />

      <ProductionKanban steps={inLavorazione} canAct={canAct} onAdvance={advanceProductionStep} />

      <Card>
        <CardHeader
          title="Capi in lavorazione"
          subtitle={
            inLavorazione.length === 0
              ? 'Nessun capo è in lavorazione in questo momento.'
              : `${inLavorazione.length} ${inLavorazione.length === 1 ? 'capo attraversa' : 'capi attraversano'} il processo produttivo.`
          }
        />
        <div className="p-4">
          <DataTable
            loading={caricamento}
            columns={columns}
            rows={inLavorazione}
            keyExtractor={(s) => s.id}
            emptyTitle="Nessun capo in lavorazione"
            emptyDescription="La pipeline è vuota: tutti i capi hanno finito la produzione, oppure non ne è ancora stato avviato nessuno."
          />
        </div>
      </Card>

      {/* I capi finiti non spariscono: hanno un altro posto, e la pagina dice qual è.
          Senza questa riga il filtro sembrerebbe una perdita di dati. */}
      {fuoriPipeline > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-heemia-lg border border-heemia-border bg-heemia-surface px-4 py-3">
          <PackageCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-heemia-grey" />
          <p className="text-sm text-heemia-grey">
            Altri <span className="font-medium text-heemia-black">{fuoriPipeline}</span> capi hanno completato la
            produzione: non sono più in pipeline, stanno nello{' '}
            <Link to="/inventario/prodotti-finiti" className="underline hover:text-heemia-black">stock</Link> e si
            consultano dall'{' '}
            <Link to="/prodotti" className="underline hover:text-heemia-black">anagrafica prodotti</Link>.
          </p>
        </div>
      )}

      {/* Il capo creato compare subito nella colonna "Idea" del kanban: si resta qui,
          per aprire la scheda basta cliccare la card. */}
      {addOpen && <AddProductForm onClose={() => setAddOpen(false)} onSubmit={addProduct} />}
    </div>
  )
}
