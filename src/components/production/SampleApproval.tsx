import { useCallback, useEffect, useState } from 'react'
import { Check, CircleAlert } from 'lucide-react'
import { Button } from '../ui/Button'
import { fieldClass } from '../ui/Modal'
import { ApiError } from '../../lib/api'
import { useMockStore, type RequisitiCampione } from '../../context/MockStore'

/**
 * Approvazione del campione (backlog "Note" §6).
 *
 * La produzione non parte più solo perché esiste una scheda tecnica: il campione deve
 * essere ricevuto, controllato e approvato. Qui si vede cosa manca prima di poterlo fare.
 */
export function SampleApproval({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  const { checkRequisitiCampione, approvaCampione } = useMockStore()
  const [stato, setStato] = useState<RequisitiCampione | null>(null)
  const [note, setNote] = useState('')
  const [errore, setErrore] = useState('')
  const [inCorso, setInCorso] = useState(false)

  const ricarica = useCallback(async () => {
    try {
      setStato(await checkRequisitiCampione(productId))
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Controllo dei requisiti non riuscito.')
    }
  }, [checkRequisitiCampione, productId])

  useEffect(() => {
    void ricarica()
  }, [ricarica])

  if (!stato) return null

  const approva = async () => {
    setInCorso(true)
    setErrore('')
    try {
      await approvaCampione(productId, note.trim() || undefined)
      await ricarica()
      setNote('')
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Approvazione non riuscita.')
    } finally {
      setInCorso(false)
    }
  }

  if (stato.giaApprovato) {
    return (
      <div className="mt-5 rounded-heemia border border-heemia-border bg-heemia-surface px-4 py-3">
        <p className="inline-flex items-center gap-1.5 text-sm text-heemia-black">
          <Check aria-hidden className="h-4 w-4" /> Campione approvato: il capo può entrare in produzione.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-5 rounded-heemia-lg border border-heemia-border p-4">
      <h3 className="font-display text-sm font-medium text-heemia-black">Approvazione del campione</h3>
      <p className="mt-0.5 text-xs text-heemia-grey">
        La produzione parte solo dopo che il campione è stato ricevuto, controllato e approvato.
      </p>

      <ul className="mt-3 space-y-1.5">
        {stato.requisiti.map((r) => (
          <li key={r.chiave} className="flex items-start gap-2 text-sm">
            {r.soddisfatto ? (
              <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-heemia-black" />
            ) : (
              <CircleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-heemia-carmine" />
            )}
            <span>
              <span className={r.soddisfatto ? 'text-heemia-black' : 'text-heemia-carmine'}>{r.etichetta}</span>
              {r.dettaglio && <span className="block text-[11px] text-heemia-grey">{r.dettaglio}</span>}
            </span>
          </li>
        ))}
      </ul>

      {errore && <p className="mt-3 text-[12px] text-heemia-carmine">{errore}</p>}

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-heemia-border pt-3">
          <input
            className={`${fieldClass} flex-1`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota sul controllo del campione (opzionale)"
            aria-label="Nota sul campione"
          />
          <Button onClick={() => void approva()} disabled={inCorso || !stato.approvabile}>
            {inCorso ? 'Approvazione…' : 'Approva campione e avvia produzione'}
          </Button>
        </div>
      )}
    </div>
  )
}
