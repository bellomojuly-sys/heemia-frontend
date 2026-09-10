import { Button } from '../ui/Button'
import { formatCurrency } from '../../lib/format'
import { FONTE_COSTO_LABEL, type PrezzoConsigliato } from '../../hooks/useServerPrezzoConsigliato'

/**
 * Il prezzo di un capo, calcolato invece che digitato (regola 2026-09-10).
 *
 * Il pannello esiste per una ragione precisa: **il numero si deve vedere prima di salvare**.
 * Un prezzo che compare a cose fatte è un prezzo che nessuno ha controllato, e questo è pur
 * sempre il numero che il cliente paga. Qui si vedono il costo da cui nasce, il margine che
 * lascia e i due prezzi che ne derivano — e, quando il capo ne ha già uno diverso, la
 * differenza fra quello che c'è e quello che il conto dice.
 *
 * **Cosa NON si mostra qui: la quota di costi fissi.** Il server la calcola e la manda
 * (`quotaCostiFissi`, `costoPieno`), ma non entra nel prezzo e in questa scheda non serve:
 * qui l'unica domanda è a quanto si vende il capo. Il posto dove quel numero conta — e dove
 * si vede se il prezzo copre anche la struttura — è **Costi e margini** (Giulia, 2026-09-10).
 *
 * Il calcolo non si rifà qui: arriva dal server (`GET /products/:id/prezzo-consigliato`).
 * Un conto ripetuto nel browser sarebbe un secondo conto, e due conti prima o poi discordano.
 */
export function PrezzoCalcolato({
  prezzo,
  onApplica,
  inCorso = false,
  canEdit,
}: {
  prezzo: PrezzoConsigliato
  onApplica?: () => void
  inCorso?: boolean
  canEdit: boolean
}) {
  const { calcolato, attuale, costo } = prezzo

  if (!prezzo.calcolabile) {
    return (
      <div className="rounded-heemia border border-dashed border-heemia-border bg-heemia-surface-muted p-4">
        <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
          Prezzo calcolato
        </p>
        <p className="text-sm text-heemia-grey">
          {prezzo.motivo ?? 'Il prezzo non è calcolabile: manca il costo del capo.'}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-heemia border border-heemia-border bg-heemia-surface p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
            Prezzo calcolato dai costi della scheda tecnica
          </p>
          <p className="mt-0.5 text-xs text-heemia-grey">
            Costo del capo {formatCurrency(costo.costoDiretto)} · margine {prezzo.marginePercentuale}% ·
            fonte: {FONTE_COSTO_LABEL[costo.fonte]}
          </p>
        </div>
        {canEdit && onApplica && prezzo.daAllineare && (
          <Button onClick={onApplica} disabled={inCorso}>
            {inCorso ? 'Applico…' : 'Applica prezzi calcolati'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Valore
          etichetta="Prezzo standard (IVA incl.)"
          valore={calcolato.prezzoVendita}
          precedente={prezzo.daAllineare ? attuale.prezzoVendita : undefined}
          forte
        />
        <Valore
          etichetta="Prezzo showroom (−10%)"
          valore={calcolato.prezzoShowroom}
          precedente={prezzo.daAllineare ? attuale.prezzoShowroom : undefined}
        />
        <Valore etichetta="Netto IVA" valore={calcolato.prezzoNettoIva} />
        <Valore etichetta="Costo del capo" valore={costo.costoDiretto} />
      </div>

      {/* La scomposizione spiega da dove esce il costo: senza, «costo 64,30 €» è un numero
          che si può solo accettare o rifiutare, non controllare. */}
      {costo.fonte !== 'censimento' && (
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-heemia-border pt-3 text-[11px] text-heemia-grey">
          <Voce etichetta="Materiali" valore={costo.costoMateriali} />
          <Voce etichetta="Accessori" valore={costo.costoAccessori} />
          <Voce etichetta="Lavorazioni" valore={costo.costoLavorazioni} />
          <Voce etichetta="Quota sviluppo" valore={costo.quotaSviluppo} />
          <Voce etichetta="Altri diretti" valore={costo.altriCosti} />
        </dl>
      )}

      <p className="mt-3 text-[11px] text-heemia-grey-light">
        Il margine è la quota del prezzo che resta dopo il costo, non un ricarico sul costo:
        prezzo = costo del capo ÷ (1 − {prezzo.marginePercentuale}%). I costi fissi di
        struttura non entrano in questo conto: quanto il prezzo li copra si legge in Costi e
        margini.
      </p>

      {prezzo.daAllineare && (
        <p className="mt-2 text-[11px] text-heemia-carmine">
          Il capo ha oggi un prezzo diverso ({formatCurrency(attuale.prezzoVendita)}). Nessun
          prezzo viene cambiato senza che qualcuno lo chieda.
        </p>
      )}
    </div>
  )
}

function Valore({
  etichetta,
  valore,
  precedente,
  forte = false,
}: {
  etichetta: string
  valore: number
  precedente?: number
  forte?: boolean
}) {
  return (
    <div>
      <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{etichetta}</p>
      <p className={`font-mono-heemia mt-0.5 text-heemia-black ${forte ? 'text-lg' : 'text-sm'}`}>
        {formatCurrency(valore)}
      </p>
      {precedente !== undefined && precedente !== valore && (
        <p className="font-mono-heemia text-[10px] text-heemia-grey line-through">{formatCurrency(precedente)}</p>
      )}
    </div>
  )
}

function Voce({ etichetta, valore }: { etichetta: string; valore: number }) {
  if (valore <= 0) return null
  return (
    <div className="flex gap-1.5">
      <dt>{etichetta}</dt>
      <dd className="font-mono-heemia text-heemia-black">{formatCurrency(valore)}</dd>
    </div>
  )
}
