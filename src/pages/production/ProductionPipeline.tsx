import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StageProgress } from '../../components/production/StageProgress'
import { formatDateIt } from '../../lib/format'
import { checkAdvance } from '../../lib/production'
import { products } from '../../mock'
import { useMockStore } from '../../context/MockStore'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'

export function ProductionPipeline() {
  const { role } = useRole()
  const { productionSteps, advanceProductionStep } = useMockStore()
  const canAct = canEdit(role)

  const activeSteps = productionSteps.filter((s) => s.fase !== 'archivio')

  return (
    <div>
      <PageHeader
        title="Pipeline produzione"
        subtitle="13 fasi da idea a archivio. L'avanzamento è bloccato se manca la scheda tecnica prima di Prototipo, Campionario o Produzione (FR-07)."
      />

      {activeSteps.length === 0 ? (
        <p className="text-sm text-heemia-grey">Nessun prodotto in produzione.</p>
      ) : (
        <div className="space-y-4">
          {activeSteps.map((step) => {
            const product = products.find((p) => p.id === step.productId)
            const check = checkAdvance(step)
            return (
              <Card key={step.id} className="p-5">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <Link to={`/prodotti/${step.productId}`} className="font-display text-lg italic text-heemia-black hover:underline">
                      {product?.nome ?? step.productId}
                    </Link>
                    <p className="mt-0.5 text-xs text-heemia-grey">
                      Responsabile: {step.responsabile}
                      {step.dataInizio && ` · Iniziato il ${formatDateIt(step.dataInizio)}`}
                    </p>
                  </div>
                  {canAct && (
                    <Button
                      variant="secondary"
                      disabled={!check.ok}
                      onClick={() => advanceProductionStep(step.id)}
                      title={!check.ok ? check.reason : undefined}
                    >
                      Avanza fase
                    </Button>
                  )}
                </div>
                <StageProgress currentStage={step.fase} blocked={!check.ok} blockReason={!check.ok ? check.reason : undefined} />
                {step.note && <p className="mt-3 text-xs text-heemia-grey">Nota: {step.note}</p>}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
