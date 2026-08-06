import { useState } from 'react'
import { Button } from '../ui/Button'
import { GoatIcon } from '../ui/GoatAlert'
import type { InventoryRecord } from '../../types'

/**
 * Reintegro del laboratorio (FR-49 §3-4).
 *
 * L'alert non si limita a dire che la scorta è bassa: il conto di quanti capi servono e
 * di quanti ce ne sono in magazzino lo fa il server, e qui si trasforma in un pulsante
 * che esegue quel trasferimento. Segnalare senza dare l'azione costringe a rifare a mano
 * un calcolo già fatto, ed è il motivo per cui certi avvisi vengono ignorati.
 *
 * Quando il magazzino non basta il pulsante resta, ma sposta **quel che c'è** e lo dice:
 * dopo il trasferimento la criticità non sparisce, perché il problema non era la
 * posizione dei capi ma la loro mancanza.
 */
export function RefillSuggestions({
  records,
  descrizione,
  onTrasferisci,
  onModifica,
}: {
  /** Solo le varianti con un reintegro suggerito: il filtro lo fa il chiamante. */
  records: InventoryRecord[]
  descrizione: (r: InventoryRecord) => string
  onTrasferisci: (r: InventoryRecord, quantita: number) => Promise<unknown>
  onModifica: (r: InventoryRecord) => void
}) {
  // "Ignora temporaneamente" vale per la sessione: alla prossima apertura dell'app la
  // segnalazione torna. Un rinvio che sopravvive per sempre è un modo elegante di
  // perdere il problema.
  const [ignorati, setIgnorati] = useState<string[]>([])
  const [inCorso, setInCorso] = useState<string | null>(null)

  const visibili = records.filter((r) => !ignorati.includes(r.id))
  if (visibili.length === 0) return null

  return (
    <section className="mb-6 rounded-heemia-lg border border-heemia-orange/35 bg-heemia-orange-light px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <GoatIcon className="-my-1 h-10 w-10 shrink-0" />
        <h2 className="font-display text-sm font-medium text-heemia-black">
          Laboratorio sotto la soglia minima
          <span className="font-mono-heemia ml-2 text-[11px] text-heemia-grey">{visibili.length}</span>
        </h2>
      </div>

      <ul className="space-y-2">
        {visibili.map((r) => {
          const reintegro = r.reintegro!
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-heemia border border-heemia-border bg-white px-3 py-2"
            >
              <div className="min-w-[14rem] flex-1">
                <p className="text-sm font-medium text-heemia-black">{descrizione(r)}</p>
                <p className="mt-0.5 text-sm text-heemia-grey">
                  In laboratorio ci sono {r.qtaLaboratorio} capi su una soglia di {r.sogliaMinimaLaboratorio}.{' '}
                  {reintegro.quantitaSuggerita > 0
                    ? `In magazzino ne sono disponibili ${reintegro.inMagazzino}: trasferiscine ${reintegro.quantitaSuggerita}` +
                      (reintegro.copreLaSoglia
                        ? ` per ripristinare la soglia.`
                        : `, ma il laboratorio resterà sotto soglia — servono nuovi capi o un recupero da un'altra ubicazione.`)
                    : 'Il magazzino è vuoto: servono nuovi capi o un recupero da un’altra ubicazione.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {reintegro.quantitaSuggerita > 0 && (
                  <Button
                    disabled={inCorso === r.id}
                    onClick={async () => {
                      setInCorso(r.id)
                      try {
                        await onTrasferisci(r, reintegro.quantitaSuggerita)
                      } finally {
                        setInCorso(null)
                      }
                    }}
                  >
                    {inCorso === r.id
                      ? 'Trasferimento…'
                      : `Trasferisci ${reintegro.quantitaSuggerita} cap${reintegro.quantitaSuggerita === 1 ? 'o' : 'i'}`}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => onModifica(r)}>
                  Modifica quantità
                </Button>
                <Button variant="ghost" onClick={() => setIgnorati((prec) => [...prec, r.id])}>
                  Ignora temporaneamente
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
