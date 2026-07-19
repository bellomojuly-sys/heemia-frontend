import type { Margin } from '../../types'
import { InfoTooltip } from '../ui/InfoTooltip'
import { Badge } from '../ui/Badge'
import { formatCurrency, formatPercent } from '../../lib/format'
import { MARGIN_THRESHOLD_PERCENT } from '../../mock/margins'
import { computePriceBands, computeUnitsToBreakEven } from '../../lib/margins'
import { useMockStore } from '../../context/MockStore'

// Tooltip in linguaggio semplice — testo esatto da FR-10, la sezione è letta dalla CEO
// senza formazione finanziaria.
const METRIC_TOOLTIPS: Record<string, string> = {
  'Prezzo di vendita': 'Prezzo al cliente, IVA inclusa.',
  'Prezzo netto IVA': 'Quanto incassiamo realmente, senza IVA.',
  'Costo diretto': 'Somma dei costi direttamente collegati al capo (tessuto, accessori, manodopera…).',
  'Costo indiretto allocato': 'Quota dei costi aziendali (affitto, utenze…) attribuita a questo capo.',
  'Costo totale': 'Costo diretto + costo indiretto allocato.',
  'Margine lordo': 'Prezzo netto meno costo diretto.',
  'Margine netto stimato': 'Prezzo netto meno costo totale.',
  'Margine percentuale': 'Margine netto diviso prezzo netto, in percentuale.',
  'Break-even price': 'Il prezzo minimo per non perdere denaro su questo capo.',
  'Prezzo minimo consigliato': 'Break-even più il margine minimo target.',
  'Unità per coprire i costi fissi': 'Quanti capi di questo modello servono per coprire tutti i costi fissi annui, al margine lordo attuale.',
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{label}</p>
        <InfoTooltip text={METRIC_TOOLTIPS[label]} />
      </div>
      <p className="font-mono-heemia mt-1 text-[0.95rem] text-heemia-black">{value}</p>
    </div>
  )
}

export function MarginSummaryCard({ margin, productName }: { margin: Margin; productName: string }) {
  const { fixedCostItems } = useMockStore()
  const totaleCostiFissi = fixedCostItems.reduce((sum, item) => sum + item.importoAnnuo, 0)
  // FR-10 §18: unità di pareggio sui costi fissi e margine residuo per fascia di prezzo,
  // con alert automatico quando uno sconto porta il prodotto sotto break-even.
  const unitsToBreakEven = computeUnitsToBreakEven(totaleCostiFissi, margin)
  const priceBands = computePriceBands(margin)

  return (
    <div
      className={`rounded-[3px] border bg-white p-5 ${
        margin.sottoSoglia ? 'border-heemia-border border-l-2 border-l-heemia-carmine' : 'border-heemia-border'
      }`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <p className="font-display text-lg italic text-heemia-black">{productName}</p>
          <Badge variant={margin.tipoDato === 'reale' ? 'success' : 'neutral'}>
            {margin.tipoDato === 'reale' ? 'Dato reale' : 'Dato stimato'}
          </Badge>
        </div>
        {margin.sottoSoglia && (
          <Badge variant="critical">Margine sotto soglia ({MARGIN_THRESHOLD_PERCENT}%)</Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Prezzo di vendita" value={formatCurrency(margin.prezzoVendita)} />
        <Metric label="Prezzo netto IVA" value={formatCurrency(margin.prezzoNettoIva)} />
        <Metric label="Costo diretto" value={formatCurrency(margin.costoDiretto)} />
        <Metric label="Costo indiretto allocato" value={formatCurrency(margin.costoIndirettoAllocato)} />
        <Metric label="Costo totale" value={formatCurrency(margin.costoTotale)} />
        <Metric label="Margine lordo" value={formatCurrency(margin.margineLordo)} />
        <Metric label="Margine netto stimato" value={formatCurrency(margin.margineNettoStimato)} />
        <Metric
          label="Margine percentuale"
          value={formatPercent(margin.marginePercentuale)}
        />
        <Metric label="Break-even price" value={formatCurrency(margin.breakEvenPrice)} />
        <Metric label="Prezzo minimo consigliato" value={formatCurrency(margin.prezzoMinimoConsigliato)} />
        <Metric label="Unità per coprire i costi fissi" value={unitsToBreakEven !== null ? `${unitsToBreakEven} capi` : '–'} />
      </div>

      <div className="mt-5 border-t border-heemia-border pt-4">
        <div className="mb-2 flex items-center gap-1.5">
          <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Margine residuo per fascia di prezzo</p>
          <InfoTooltip text="Quanto margine resta se questo capo viene venduto scontato. Se una fascia è segnata in rosso, quello sconto porta il capo sotto break-even: si vende in perdita." />
        </div>
        <div className="flex flex-wrap gap-2">
          {priceBands.map((band) => (
            <div
              key={band.label}
              className={`rounded-[3px] border px-3 py-1.5 ${
                band.sottoBreakEven ? 'border-heemia-carmine/40 bg-heemia-carmine-light' : 'border-heemia-border bg-heemia-cream'
              }`}
            >
              <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{band.label}</p>
              <p className={`font-mono-heemia text-sm ${band.sottoBreakEven ? 'text-heemia-carmine' : 'text-heemia-black'}`}>
                {formatCurrency(band.margine)}
                {band.sottoBreakEven && <span className="ml-1 text-[10px] uppercase">sotto break-even</span>}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
