import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import type { StockMovement } from '../../types'

const TIPO_LABEL: Record<StockMovement['tipo'], string> = {
  trasferimento: 'Trasferimento',
  rettifica: 'Modifica manuale',
  carico: 'Carico',
  scarico: 'Scarico',
}

/** Storico dei movimenti di una variante: trasferimenti fra ubicazioni e rettifiche manuali. */
export function StockMovementsModal({
  descrizione,
  carica,
  onClose,
}: {
  descrizione: string
  carica: () => Promise<StockMovement[]>
  onClose: () => void
}) {
  const [movimenti, setMovimenti] = useState<StockMovement[]>([])
  const [stato, setStato] = useState<'caricamento' | 'pronto' | 'errore'>('caricamento')

  useEffect(() => {
    let annullato = false
    carica()
      .then((righe) => {
        if (annullato) return
        setMovimenti(righe)
        setStato('pronto')
      })
      .catch(() => !annullato && setStato('errore'))
    return () => {
      annullato = true
    }
  }, [carica])

  return (
    <Modal title="Storico movimenti" subtitle={descrizione} onClose={onClose}>
      {stato === 'caricamento' && <p className="text-sm text-heemia-grey">Caricamento…</p>}
      {stato === 'errore' && (
        <p className="text-sm text-heemia-carmine">Storico non caricato. Chiudi e riprova.</p>
      )}
      {stato === 'pronto' && movimenti.length === 0 && (
        <p className="text-sm text-heemia-grey">
          Nessun movimento registrato per questa variante.
        </p>
      )}
      {stato === 'pronto' && movimenti.length > 0 && (
        <ul className="scroll-smooth-y max-h-[52vh] space-y-2 overflow-y-auto">
          {movimenti.map((m) => (
            <li key={m.id} className="rounded-heemia border border-heemia-border px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <Badge variant={m.tipo === 'trasferimento' ? 'neutral' : 'info'}>{TIPO_LABEL[m.tipo]}</Badge>
                <span className="font-mono-heemia text-[11px] text-heemia-grey">
                  {new Date(m.createdAt).toLocaleString('it-IT')}
                </span>
              </div>
              <p className="mt-1 text-sm text-heemia-black">
                <span className="font-mono-heemia">{m.quantita > 0 ? `+${m.quantita}` : m.quantita}</span>
                {m.tipo === 'trasferimento' && m.origine && m.destinazione
                  ? ` · ${m.origine} → ${m.destinazione}`
                  : m.destinazione
                    ? ` · ${m.destinazione}`
                    : ''}
              </p>
              {/* Motivo e note sono due cose diverse (FR-49 §5): il primo dice perché il
                  movimento è avvenuto, le seconde aggiungono il dettaglio libero. */}
              {m.motivo && <p className="mt-0.5 text-[12px] font-medium text-heemia-black">{m.motivo}</p>}
              {m.note && <p className="mt-0.5 text-[12px] text-heemia-grey">{m.note}</p>}
              {m.utente && <p className="mt-0.5 text-[11px] text-heemia-grey-light">{m.utente}</p>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
