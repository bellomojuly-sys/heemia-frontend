import { PRODUCT_STAGES, type ProductStage } from '../../types'

// Le 13 fasi sono una sequenza reale (idea → archivio): la numerazione qui comunica
// posizione effettiva nel percorso, non è decorativa.
export function StageProgress({
  currentStage,
  blocked = false,
  blockReason,
}: {
  currentStage: ProductStage
  blocked?: boolean
  blockReason?: string
}) {
  const currentIndex = PRODUCT_STAGES.findIndex((s) => s.id === currentStage)

  return (
    <div>
      <div className="flex items-center gap-0.5">
        {PRODUCT_STAGES.map((stage, idx) => {
          const isDone = idx < currentIndex
          const isCurrent = idx === currentIndex
          return (
            <div
              key={stage.id}
              title={stage.label}
              className={`h-[3px] flex-1 ${
                isCurrent
                  ? blocked
                    ? 'bg-heemia-carmine'
                    : 'bg-heemia-black'
                  : isDone
                    ? 'bg-heemia-grey-light'
                    : 'bg-heemia-cream-dark'
              }`}
            />
          )
        })}
      </div>
      <p className="mt-2.5 flex items-baseline gap-2">
        <span className="font-mono-heemia text-[10px] text-heemia-grey-light">
          {String(currentIndex + 1).padStart(2, '0')}/{String(PRODUCT_STAGES.length).padStart(2, '0')}
        </span>
        <span className="font-display text-sm italic text-heemia-black">
          {PRODUCT_STAGES[currentIndex]?.label ?? currentStage}
        </span>
      </p>
      {blocked && blockReason && (
        <p className="mt-2 border-l-2 border-heemia-carmine bg-heemia-carmine-light px-2.5 py-1.5 text-xs text-heemia-carmine">
          {blockReason}
        </p>
      )}
    </div>
  )
}
