import { useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { PRODUCT_STAGES, type ProductionStep, type ProductStage } from '../../types'
import { checkAdvance, stageLabel } from '../../lib/production'
import { useMockStore } from '../../context/MockStore'
import { useGoatAlert } from '../../context/GoatAlertContext'
import { Button } from '../ui/Button'

// FR-31: colonne per fase, non barra lineare. Le colonne restano le 13 fasi FR-07 esistenti
// (Product.stato / ProductionStep.fase) — non le 10 fasi nominate nel testo FR-31 ("Fitting",
// "Quality Control" ecc.), che non esistono nel modello dati e non vengono introdotte qui
// (vedi Decision_Log). "Archivio" resta escluso, come nella vista precedente.
const KANBAN_STAGES = PRODUCT_STAGES.filter((s) => s.id !== 'archivio')

/**
 * Trascinamento delle card fra colonne.
 *
 * **Si trascina solo nella colonna immediatamente successiva.** Non è una
 * semplificazione grafica: l'endpoint `POST /production/:id/advance` non accetta
 * una destinazione, calcola da sé la fase successiva e rifiuta con 409 se il gate
 * FR-07 non è soddisfatto. Saltare fasi o tornare indietro richiederebbe un
 * endpoint nuovo *e* una regola su cosa succede allo storico e ai controlli
 * intermedi — una decisione di prodotto, non un dettaglio di interfaccia.
 *
 * Per non far sembrare la cosa un difetto, durante il trascinamento le colonne
 * non ammesse si spengono e resta accesa solo quella di destinazione.
 *
 * Il pulsante "Sposta a …" resta: il trascinamento HTML5 non funziona sui
 * dispositivi touch e non è raggiungibile da tastiera.
 */
export function ProductionKanban({
  steps,
  canAct,
  onAdvance,
}: {
  steps: ProductionStep[]
  canAct: boolean
  onAdvance: (id: string) => Promise<{ ok: boolean; reason?: string }>
}) {
  const { technicalSheets, products, materials, accessories } = useMockStore()

  const { avvisa } = useGoatAlert()
  const [trascinato, setTrascinato] = useState<{ id: string; destinazione: ProductStage | null } | null>(null)
  const [colonnaSotto, setColonnaSotto] = useState<ProductStage | null>(null)
  const [inCorso, setInCorso] = useState<string | null>(null)

  const sposta = async (stepId: string) => {
    setInCorso(stepId)
    // L'esito veniva scartato: se il server rifiutava (materiale esaurito, scheda
    // mancante, ruolo senza permesso) la card semplicemente non si muoveva, senza
    // dire perché.
    const esito = await onAdvance(stepId)
    if (!esito.ok) {
      const ragione = esito.reason ?? 'Spostamento non riuscito.'
      avvisa(/scheda tecnica/i.test(ragione) ? 'scheda-tecnica' : 'kanban-bloccato', { testo: ragione })
    }
    setInCorso(null)
  }

  /** Tentativo di far partire il trascinamento di una card bloccata dal gate FR-07. */
  const spiegaBlocco = (motivo: string | undefined) => {
    avvisa(motivo && /scheda tecnica/i.test(motivo) ? 'scheda-tecnica' : 'kanban-bloccato', { testo: motivo })
  }

  const fineTrascinamento = () => {
    setTrascinato(null)
    setColonnaSotto(null)
  }

  const suColonna = (stage: ProductStage) => ({
    onDragOver: (e: DragEvent) => {
      // Senza preventDefault il browser non considera l'elemento un'area di rilascio:
      // chiamarlo solo sulla colonna ammessa è ciò che rende impossibile lasciare la
      // card altrove, senza bisogno di controlli al rilascio.
      if (trascinato?.destinazione !== stage) return
      e.preventDefault()
      setColonnaSotto(stage)
    },
    onDragLeave: () => setColonnaSotto((c) => (c === stage ? null : c)),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      const id = trascinato?.id ?? e.dataTransfer.getData('text/plain')
      fineTrascinamento()
      if (id) void sposta(id)
    },
  })

  return (
    <div className="mb-8">
      {canAct && (
        <p className="mb-2 text-xs text-heemia-grey-light">
          Trascina una card sulla colonna successiva per far avanzare il capo, oppure usa il pulsante sulla card.
        </p>
      )}

      <div className="scroll-smooth-y overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {KANBAN_STAGES.map((stage) => {
            const stepsInStage = steps.filter((s) => s.fase === stage.id)
            const destinazioneValida = trascinato?.destinazione === stage.id
            const spenta = trascinato !== null && !destinazioneValida
            return (
              <div
                key={stage.id}
                {...suColonna(stage.id)}
                className={`flex w-[240px] shrink-0 flex-col rounded-heemia-lg border bg-heemia-surface transition-all duration-200 ease-heemia ${
                  destinazioneValida
                    ? 'border-dashed border-heemia-black bg-heemia-surface-muted shadow-heemia-md'
                    : 'border-heemia-border'
                } ${colonnaSotto === stage.id ? 'scale-[1.015]' : ''} ${spenta ? 'opacity-40' : ''}`}
              >
                <div className="flex items-baseline justify-between border-b border-heemia-border px-3 py-2.5">
                  <p className="font-mono-heemia text-[10px] uppercase tracking-[0.08em] text-heemia-grey">{stage.label}</p>
                  <span className="font-mono-heemia text-xs text-heemia-grey-light">{stepsInStage.length}</span>
                </div>
                <div className="flex-1 space-y-2 p-2">
                  {stepsInStage.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-heemia-grey-light">
                      {destinazioneValida ? 'Rilascia qui' : 'Vuoto'}
                    </p>
                  ) : (
                    stepsInStage.map((step) => {
                      const product = products.find((p) => p.id === step.productId)
                      const check = checkAdvance(step, { materials, accessories, technicalSheets, products })
                      const trascinabile = canAct && check.ok && inCorso === null
                      const inMovimento = trascinato?.id === step.id || inCorso === step.id
                      return (
                        <div
                          key={step.id}
                          // Anche le card bloccate restano trascinabili: il trascinamento
                          // viene annullato subito e la capretta spiega perché. Se fossero
                          // `draggable={false}` l'evento non partirebbe nemmeno e chi ci
                          // prova non riceverebbe alcuna risposta.
                          draggable={canAct && inCorso === null && check.next !== null}
                          onDragStart={(e) => {
                            if (!check.ok) {
                              e.preventDefault()
                              spiegaBlocco(check.reason)
                              return
                            }
                            e.dataTransfer.setData('text/plain', step.id)
                            e.dataTransfer.effectAllowed = 'move'
                            setTrascinato({ id: step.id, destinazione: check.next })
                          }}
                          onDragEnd={fineTrascinamento}
                          className={`rounded-heemia border bg-white p-2.5 shadow-heemia-xs transition-all duration-200 ease-heemia ${
                            step.bloccata ? 'border-heemia-carmine/40' : 'border-heemia-border-strong'
                          } ${trascinabile ? 'surface-interactive cursor-grab active:cursor-grabbing' : ''} ${
                            inMovimento ? 'scale-[0.98] opacity-40' : ''
                          }`}
                        >
                          <Link to={`/prodotti/${step.productId}`} className="font-display block text-sm font-medium text-heemia-black hover:underline">
                            {product?.nome ?? step.productId}
                          </Link>
                          <p className="mt-0.5 text-[10px] text-heemia-grey">{step.responsabile}</p>
                          {step.bloccata && (
                            <p className="mt-1.5 border-l-2 border-heemia-carmine bg-heemia-carmine-light px-1.5 py-1 text-[10px] text-heemia-carmine">
                              {step.motivoBlocco ?? 'Bloccata'}
                            </p>
                          )}
                          {/* Il motivo del blocco del gate era visibile solo passando il mouse
                              sul pulsante: chi non ci passa non capisce perché non si muove. */}
                          {canAct && !check.ok && check.next !== null && (
                            <p className="mt-1.5 text-[10px] leading-snug text-heemia-grey">{check.reason}</p>
                          )}
                          {canAct && (
                            <Button
                              variant="ghost"
                              className="mt-1.5 !px-0 !py-0 text-[10px] normal-case tracking-normal"
                              disabled={inCorso !== null}
                              onClick={() => (check.ok ? void sposta(step.id) : spiegaBlocco(check.reason))}
                            >
                              {inCorso === step.id
                                ? 'Spostamento…'
                                : check.ok
                                  ? `Sposta a "${stageLabel(check.next!)}" →`
                                  : check.next === null
                                    ? 'Ultima fase'
                                    : 'Bloccata'}
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
    </div>
  )
}
