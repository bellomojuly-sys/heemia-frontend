import { Link } from 'react-router-dom'
import { PRODUCT_STAGES, type ProductionStep } from '../../types'
import { checkAdvance, stageLabel } from '../../lib/production'
import { useMockStore } from '../../context/MockStore'
import { Button } from '../ui/Button'

// FR-31: colonne per fase, non barra lineare. Le colonne restano le 13 fasi FR-07 esistenti
// (Product.stato / ProductionStep.fase) — non le 10 fasi nominate nel testo FR-31 ("Fitting",
// "Quality Control" ecc.), che non esistono nel modello dati e non vengono introdotte qui
// (vedi Decision_Log). "Archivio" resta escluso, come nella vista precedente.
const KANBAN_STAGES = PRODUCT_STAGES.filter((s) => s.id !== 'archivio')

export function ProductionKanban({
  steps,
  canAct,
  onAdvance,
}: {
  steps: ProductionStep[]
  canAct: boolean
  onAdvance: (id: string) => void
}) {
  const { products, materials, accessories } = useMockStore()
  return (
    <div className="mb-8 overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {KANBAN_STAGES.map((stage) => {
          const stepsInStage = steps.filter((s) => s.fase === stage.id)
          return (
            <div key={stage.id} className="flex w-[240px] shrink-0 flex-col rounded-[3px] border border-heemia-border bg-heemia-cream">
              <div className="flex items-baseline justify-between border-b border-heemia-border px-3 py-2.5">
                <p className="font-mono-heemia text-[10px] uppercase tracking-[0.08em] text-heemia-grey">{stage.label}</p>
                <span className="font-mono-heemia text-xs text-heemia-grey-light">{stepsInStage.length}</span>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {stepsInStage.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-heemia-grey-light">Vuoto</p>
                ) : (
                  stepsInStage.map((step) => {
                    const product = products.find((p) => p.id === step.productId)
                    const check = checkAdvance(step, { materials, accessories })
                    return (
                      <div
                        key={step.id}
                        className={`rounded-[3px] border bg-white p-2.5 ${step.bloccata ? 'border-heemia-carmine/40' : 'border-heemia-border-strong'}`}
                      >
                        <Link to={`/prodotti/${step.productId}`} className="font-display block text-sm italic text-heemia-black hover:underline">
                          {product?.nome ?? step.productId}
                        </Link>
                        <p className="mt-0.5 text-[10px] text-heemia-grey">{step.responsabile}</p>
                        {step.bloccata && (
                          <p className="mt-1.5 border-l-2 border-heemia-carmine bg-heemia-carmine-light px-1.5 py-1 text-[10px] text-heemia-carmine">
                            {step.motivoBlocco ?? 'Bloccata'}
                          </p>
                        )}
                        {canAct && (
                          <Button
                            variant="ghost"
                            className="mt-1.5 !px-0 !py-0 text-[10px] normal-case tracking-normal"
                            disabled={!check.ok}
                            title={!check.ok ? check.reason : undefined}
                            onClick={() => onAdvance(step.id)}
                          >
                            {check.ok ? `Sposta a "${stageLabel(check.next!)}" →` : check.next === null ? 'Ultima fase' : 'Bloccata'}
                          </Button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
