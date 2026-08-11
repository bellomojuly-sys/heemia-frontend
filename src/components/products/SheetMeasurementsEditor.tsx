import { useState } from 'react'
import { ArrowDown, ArrowUp, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { fieldClass } from '../ui/Modal'
import type { SheetMeasurement } from '../../types'
import { useDataStore, type SuggerimentoMisureInput } from '../../context/DataStore'
import { ApiError } from '../../lib/api'

const UNITA: SheetMeasurement['unita'][] = ['cm', 'mm', 'in']

let contatore = 0
const nuovoId = () => `mis-${Date.now()}-${contatore++}`

/**
 * Elenco delle misure tecniche del capo (backlog "Note" §3).
 *
 * Le misure necessarie cambiano con la categoria: l'AI propone QUALI misure servono,
 * i valori numerici restano da compilare a mano perché dipendono da taglia e modello.
 * Ogni riga si può modificare, spostare o eliminare.
 */
export function SheetMeasurementsEditor({
  misure,
  categoria,
  descrizione,
  vestibilita,
  onChange,
}: {
  misure: SheetMeasurement[]
  categoria: string
  descrizione?: string
  vestibilita?: string
  onChange: (aggiorna: (precedenti: SheetMeasurement[]) => SheetMeasurement[]) => void
}) {
  const { suggerisciMisure } = useDataStore()
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')
  const [notaAi, setNotaAi] = useState('')

  const aggiungi = () =>
    onChange((prec) => [...prec, { id: nuovoId(), nome: '', unita: 'cm', fonte: 'manuale' }])

  const modifica = (id: string, patch: Partial<SheetMeasurement>) =>
    onChange((prec) => prec.map((m) => (m.id === id ? { ...m, ...patch } : m)))

  const elimina = (id: string) => onChange((prec) => prec.filter((m) => m.id !== id))

  const sposta = (indice: number, direzione: -1 | 1) =>
    onChange((prec) => {
      const destinazione = indice + direzione
      if (destinazione < 0 || destinazione >= prec.length) return prec
      const copia = [...prec]
      ;[copia[indice], copia[destinazione]] = [copia[destinazione], copia[indice]]
      return copia
    })

  const chiediAllaAi = async () => {
    if (!categoria.trim()) {
      setErrore('Indica prima la categoria del capo: le misure dipendono dalla tipologia.')
      return
    }
    setInCorso(true)
    setErrore('')
    try {
      const input: SuggerimentoMisureInput = { categoria, descrizione, vestibilita }
      const esito = await suggerisciMisure(input)
      setNotaAi(esito.note)
      // Le misure proposte si aggiungono a quelle già presenti: nulla viene sovrascritto.
      onChange((prec) => [
        ...prec,
        ...esito.misure.map((m) => ({
          id: nuovoId(),
          nome: m.nome,
          unita: m.unita,
          tolleranza: m.tolleranza ?? undefined,
          nota: m.nota ?? undefined,
          fonte: 'ai' as const,
        })),
      ])
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Suggerimento non riuscito. Aggiungi le misure a mano.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void chiediAllaAi()} disabled={inCorso}>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            {inCorso ? 'Sto chiedendo…' : 'Suggerisci misure con AI'}
          </span>
        </Button>
        <Button variant="secondary" onClick={aggiungi} disabled={inCorso}>
          Aggiungi misura manualmente
        </Button>
      </div>

      {errore && <p className="mb-3 text-[12px] text-heemia-carmine">{errore}</p>}
      {notaAi && <p className="mb-3 text-[12px] text-heemia-grey">{notaAi}</p>}

      {misure.length === 0 ? (
        <p className="text-sm text-heemia-grey">
          Nessuna misura indicata. Le misure servono alla modellista per sviluppare il capo.
        </p>
      ) : (
        <div className="space-y-2">
          {misure.map((m, i) => (
            <div key={m.id} className="rounded-heemia border border-heemia-border bg-heemia-surface p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                <div className="col-span-2">
                  <input
                    className={fieldClass}
                    value={m.nome}
                    onChange={(e) => modifica(m.id, { nome: e.target.value })}
                    placeholder="Nome misura"
                    aria-label="Nome misura"
                  />
                </div>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className={fieldClass}
                  value={m.valore ?? ''}
                  onChange={(e) => modifica(m.id, { valore: e.target.value === '' ? undefined : Number(e.target.value) })}
                  placeholder="Valore"
                  aria-label="Valore"
                />
                <select
                  className={fieldClass}
                  value={m.unita}
                  onChange={(e) => modifica(m.id, { unita: e.target.value as SheetMeasurement['unita'] })}
                  aria-label="Unità di misura"
                >
                  {UNITA.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <input
                  className={fieldClass}
                  value={m.tagliaRiferimento ?? ''}
                  onChange={(e) => modifica(m.id, { tagliaRiferimento: e.target.value })}
                  placeholder="Taglia rif."
                  aria-label="Taglia di riferimento"
                />
                <input
                  className={fieldClass}
                  value={m.tolleranza ?? ''}
                  onChange={(e) => modifica(m.id, { tolleranza: e.target.value })}
                  placeholder="Tolleranza"
                  aria-label="Tolleranza"
                />
                <div className="col-span-2 sm:col-span-5">
                  <input
                    className={fieldClass}
                    value={m.nota ?? ''}
                    onChange={(e) => modifica(m.id, { nota: e.target.value })}
                    placeholder="Nota tecnica (come si rileva)"
                    aria-label="Nota tecnica"
                  />
                </div>
                <div className="flex items-center justify-end gap-1">
                  {m.fonte === 'ai' && <Badge variant="info">AI</Badge>}
                  <IconAzione titolo="Sposta su" onClick={() => sposta(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </IconAzione>
                  <IconAzione titolo="Sposta giù" onClick={() => sposta(i, 1)} disabled={i === misure.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </IconAzione>
                  <IconAzione titolo="Elimina misura" onClick={() => elimina(m.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconAzione>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function IconAzione({
  titolo,
  onClick,
  disabled = false,
  children,
}: {
  titolo: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={titolo}
      aria-label={titolo}
      onClick={onClick}
      disabled={disabled}
      className="rounded-heemia-sm border border-heemia-border p-1.5 text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-black hover:text-heemia-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-heemia-border disabled:hover:text-heemia-grey"
    >
      {children}
    </button>
  )
}
