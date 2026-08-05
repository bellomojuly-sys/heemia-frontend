import { useState } from 'react'
import { Button } from '../ui/Button'
import { Modal, Field, FormActions, campoClass, fieldClass } from '../ui/Modal'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import type { InventoryRecord } from '../../types'

export type TransferDirezione = 'to_lab' | 'to_warehouse'

/**
 * Trasferimento di capi tra magazzino e laboratorio. Prima di confermare mostra le
 * quantità attuali e quelle risultanti: il movimento va capito guardando il modale,
 * senza doverlo eseguire per vedere l'effetto.
 */
export function StockTransferModal({
  record,
  descrizione,
  direzione,
  onClose,
  onSubmit,
}: {
  record: InventoryRecord
  descrizione: string
  direzione: TransferDirezione
  onClose: () => void
  onSubmit: (quantita: number, note?: string) => Promise<unknown>
}) {
  const [quantita, setQuantita] = useState('')
  const [note, setNote] = useState('')

  const versoLaboratorio = direzione === 'to_lab'
  const disponibile = versoLaboratorio ? record.qtaMagazzino : record.qtaLaboratorio
  const richiesta = Number(quantita) || 0
  const magazzinoDopo = record.qtaMagazzino + (versoLaboratorio ? -richiesta : richiesta)
  const laboratorioDopo = record.qtaLaboratorio + (versoLaboratorio ? richiesta : -richiesta)

  const { errori, inCorso, submit, pulisci } = useFormSubmit<'quantita'>(
    () => ({
      quantita: !quantita.trim()
        ? 'Indica quanti pezzi trasferire.'
        : Number.isNaN(Number(quantita)) || richiesta <= 0
          ? 'La quantità deve essere un numero maggiore di zero.'
          : richiesta > disponibile
            ? `Disponibili ${disponibile} pezzi ${versoLaboratorio ? 'in magazzino' : 'in laboratorio'}.`
            : undefined,
    }),
    async () => {
      await onSubmit(richiesta, note.trim() || undefined)
      onClose()
    },
  )

  return (
    <Modal
      title={versoLaboratorio ? 'Invia al laboratorio' : 'Riporta in magazzino'}
      subtitle={descrizione}
      onClose={onClose}
    >
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Riquadro etichetta="Magazzino ora" valore={record.qtaMagazzino} />
        <Riquadro etichetta="Laboratorio ora" valore={record.qtaLaboratorio} />
      </div>

      <Field
        label="Quantità da trasferire"
        required
        error={errori.quantita}
        hint={`Disponibili ${disponibile} pezzi ${versoLaboratorio ? 'in magazzino' : 'in laboratorio'}.`}
      >
        <input
          type="number"
          min="1"
          max={disponibile}
          className={campoClass(errori.quantita)}
          value={quantita}
          onChange={(e) => {
            setQuantita(e.target.value)
            pulisci('quantita')
          }}
          autoFocus
        />
      </Field>

      <div className="mt-3">
        <Field label="Nota (opzionale)">
          <input
            className={fieldClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Es. campionatura per la modellista"
          />
        </Field>
      </div>

      {richiesta > 0 && richiesta <= disponibile && (
        <div className="mt-4 animate-fade-in rounded-heemia border border-heemia-border bg-heemia-surface px-4 py-3">
          <p className="font-mono-heemia mb-2 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
            Dopo il trasferimento
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Riquadro etichetta="Magazzino" valore={magazzinoDopo} evidenza />
            <Riquadro etichetta="Laboratorio" valore={laboratorioDopo} evidenza />
          </div>
        </div>
      )}

      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>
          Annulla
        </Button>
        <Button onClick={() => void submit()} disabled={inCorso}>
          {inCorso ? 'Trasferimento…' : 'Conferma trasferimento'}
        </Button>
      </FormActions>
    </Modal>
  )
}

function Riquadro({ etichetta, valore, evidenza = false }: { etichetta: string; valore: number; evidenza?: boolean }) {
  return (
    <div className={evidenza ? '' : 'rounded-heemia border border-heemia-border px-3 py-2'}>
      <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{etichetta}</p>
      <p className="font-mono-heemia text-lg text-heemia-black">{valore}</p>
    </div>
  )
}
