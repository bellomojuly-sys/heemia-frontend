import { useState } from 'react'
import { Card, CardHeader } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { InfoTooltip } from '../ui/InfoTooltip'
import { fieldClass } from '../ui/Modal'
import { formatCurrency, formatDateIt, formatDateTimeIt } from '../../lib/format'
import { computeSheetCost, type CostRow } from '../../lib/sheetCost'
import { useMockStore } from '../../context/MockStore'
import { canEdit } from '../../lib/permissions'
import { useRole } from '../../context/RoleContext'
import type { TechnicalSheet } from '../../types'

// Riepilogo costi del capo e prezzo di break-even (spec §4/§5) + tracciabilità e storico (§6).
// Il calcolo è derivato live dalla scheda: cambiando materiali, fatture o voci di costo, i
// numeri qui si aggiornano subito. Lo storico invece è esplicito e non viene mai sovrascritto.

const FONTE_LABEL: Record<string, string> = {
  fattura: 'Fattura',
  materiale: 'Anagrafica materiale',
  fornitore: 'Preventivo fornitore',
  manuale: 'Inserito a mano',
  stimato: 'Stimato dall\'app',
  ai: 'Letto dal PDF (AI)',
}

function Riga({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? 'border-t border-heemia-border pt-2' : ''}`}>
      <span className={`text-sm ${strong ? 'text-heemia-black' : 'text-heemia-grey'}`}>{label}</span>
      <span className={`font-mono-heemia ${strong ? 'text-base text-heemia-black' : 'text-sm text-heemia-black'}`}>{value}</span>
    </div>
  )
}

export function SheetCostBreakdown({ sheet }: { sheet: TechnicalSheet }) {
  const { role } = useRole()
  const { materials, accessories, invoices, recordSheetCostSnapshot } = useMockStore()
  const [motivo, setMotivo] = useState('')
  const [apriRegistra, setApriRegistra] = useState(false)

  const costo = computeSheetCost(sheet, { materials, accessories, invoices })
  const storico = [...(sheet.storicoCosti ?? [])].sort((a, b) => b.registratoIl.localeCompare(a.registratoIl))
  const ultimo = storico[0]
  // Variazione rispetto all'ultimo calcolo registrato (spec §6).
  const variazione = ultimo ? costo.costoTotaleUnitario - ultimo.costoTotaleUnitario : null

  const registra = () => {
    recordSheetCostSnapshot(sheet.id, motivo.trim() || 'Ricalcolo manuale')
    setMotivo('')
    setApriRegistra(false)
  }

  const fatturaNumero = (id?: string) => (id ? invoices.find((i) => i.id === id)?.numero ?? id : '–')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Costo del capo e prezzo di break-even"
          subtitle="Somma di materiali, lavorazioni e quota di sviluppo ammortizzata sui capi previsti."
          action={
            canEdit(role) ? (
              <Button variant="secondary" onClick={() => setApriRegistra((v) => !v)}>Ricalcola e registra</Button>
            ) : undefined
          }
        />

        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
          <div>
            <Riga label="Costo materiali" value={formatCurrency(costo.costoMateriali)} />
            <Riga label="Costo accessori" value={formatCurrency(costo.costoAccessori)} />
            <Riga label="Costo lavorazioni" value={formatCurrency(costo.costoLavorazioni)} />
            <Riga label="Quota sviluppo e progettazione" value={formatCurrency(costo.quotaSviluppo)} />
            <Riga label="Altri costi attribuiti" value={formatCurrency(costo.altriCosti)} />
            <Riga label="Costo totale unitario" value={formatCurrency(costo.costoTotaleUnitario)} strong />
          </div>

          <div className="rounded-heemia border border-heemia-border bg-heemia-cream p-4">
            <div className="flex items-center gap-1.5">
              <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Prezzo di break-even</p>
              <InfoTooltip text="È il prezzo minimo che copre esattamente i costi attribuiti al capo. Non è il prezzo di vendita consigliato: a questo prezzo il guadagno è zero." />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <p className="font-mono-heemia text-2xl text-heemia-black">{formatCurrency(costo.prezzoBreakEven)}</p>
              <Badge variant="warning">Margine €0</Badge>
            </div>
            {/* Spec §5: l'avviso deve essere esplicito — non è un prezzo di vendita consigliato. */}
            <p className="mt-2 rounded-heemia border-l-2 border-heemia-carmine bg-white px-3 py-2 text-xs text-heemia-black">
              Break-even: questo prezzo copre esclusivamente i costi e non genera margine.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-heemia-border pt-3">
              <div>
                <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Margine generato</p>
                <p className="font-mono-heemia mt-0.5 text-sm text-heemia-black">{formatCurrency(costo.margineEuro)}</p>
              </div>
              <div>
                <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Margine percentuale</p>
                <p className="font-mono-heemia mt-0.5 text-sm text-heemia-black">{costo.marginePercentuale.toFixed(1)}%</p>
              </div>
            </div>
            {variazione !== null && Math.abs(variazione) >= 0.01 && (
              <p className="mt-3 text-xs text-heemia-black">
                Variazione rispetto all'ultimo calcolo registrato:{' '}
                <span className="font-mono-heemia">{variazione > 0 ? '+' : ''}{formatCurrency(variazione)}</span>
              </p>
            )}
          </div>
        </div>

        {apriRegistra && canEdit(role) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-heemia-border bg-heemia-cream px-5 py-3">
            <input
              className={`${fieldClass} max-w-sm`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo dell'aggiornamento (es. nuova fattura tessuto)"
            />
            <Button onClick={registra}>Registra calcolo</Button>
            <Button variant="ghost" onClick={() => setApriRegistra(false)}>Annulla</Button>
          </div>
        )}
      </Card>

      {/* Tracciabilità voce per voce (spec §6) */}
      <Card>
        <CardHeader
          title="Dettaglio e tracciabilità dei costi"
          subtitle="Da dove arriva ogni valore: fattura, anagrafica materiale o inserimento manuale."
        />
        <div className="overflow-x-auto p-5">
          {costo.righe.length === 0 ? (
            <p className="text-sm text-heemia-grey">Nessuna voce di costo inserita in questa scheda.</p>
          ) : (
            <table className="w-full min-w-[46rem] text-sm [&_td]:px-3 [&_th]:px-3 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0">
              <thead>
                <tr className="border-b border-heemia-border text-left">
                  {['Voce', 'Quantità', 'Costo unitario', 'Fonte', 'Fattura', 'Aggiornato il', 'Costo sul capo'].map((h, idx) => (
                    <th key={h} className={`py-1.5 font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey ${idx >= 1 && idx !== 3 && idx !== 4 ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {costo.righe.map((r: CostRow) => (
                  <tr key={r.id} className="border-b border-heemia-border/60">
                    <td className="py-1.5 text-heemia-black">
                      {r.label}
                      {r.ammortizzato && (
                        <span className="ml-1.5 text-[10px] uppercase text-heemia-grey">
                          ammortizzato su {r.quantitaPrevista} capi
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-mono-heemia text-heemia-grey">
                      {r.quantita != null ? `${r.quantita} ${r.unitaMisura ?? ''}` : '–'}
                      {r.percentualeScarto ? <span className="text-[10px]"> +{r.percentualeScarto}% scarto</span> : null}
                    </td>
                    <td className="py-1.5 text-right font-mono-heemia text-heemia-grey">
                      {r.costoUnitario != null ? formatCurrency(r.costoUnitario) : '–'}
                    </td>
                    <td className="py-1.5 text-heemia-grey">{FONTE_LABEL[r.fonte] ?? r.fonte}</td>
                    <td className="py-1.5 font-mono-heemia text-[11px] text-heemia-grey">{fatturaNumero(r.fatturaId)}</td>
                    <td className="py-1.5 text-right text-heemia-grey">{r.aggiornatoIl ? formatDateIt(r.aggiornatoIl) : '–'}</td>
                    <td className="py-1.5 text-right font-mono-heemia text-heemia-black">{formatCurrency(r.costoTotale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Storico dei calcoli (spec §6): mai sovrascritto */}
      <Card>
        <CardHeader
          title="Storico dei costi"
          subtitle="Ogni ricalcolo registrato resta in archivio con data e motivo: i valori precedenti non vengono sovrascritti."
        />
        <div className="p-5">
          {storico.length === 0 ? (
            <p className="text-sm text-heemia-grey">Nessun calcolo registrato finora.</p>
          ) : (
            <table className="w-full text-sm [&_td]:px-3 [&_th]:px-3 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0">
              <thead>
                <tr className="border-b border-heemia-border text-left">
                  <th className="py-1.5 font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Registrato il</th>
                  <th className="py-1.5 font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Motivo</th>
                  <th className="py-1.5 text-right font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Materiali</th>
                  <th className="py-1.5 text-right font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Costo totale</th>
                  <th className="py-1.5 text-right font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Break-even</th>
                  <th className="py-1.5 text-right font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Variazione</th>
                </tr>
              </thead>
              <tbody>
                {storico.map((s, idx) => {
                  const prec = storico[idx + 1]
                  const delta = prec ? s.costoTotaleUnitario - prec.costoTotaleUnitario : null
                  return (
                    <tr key={s.id} className="border-b border-heemia-border/60">
                      <td className="py-1.5 text-heemia-grey">{formatDateTimeIt(s.registratoIl)}</td>
                      <td className="py-1.5 text-heemia-black">{s.motivo}</td>
                      <td className="py-1.5 text-right font-mono-heemia text-heemia-grey">{formatCurrency(s.costoMaterialiUnitario)}</td>
                      <td className="py-1.5 text-right font-mono-heemia text-heemia-black">{formatCurrency(s.costoTotaleUnitario)}</td>
                      <td className="py-1.5 text-right font-mono-heemia text-heemia-black">{formatCurrency(s.prezzoBreakEven)}</td>
                      <td className={`py-1.5 text-right font-mono-heemia ${delta && delta > 0 ? 'text-heemia-carmine' : 'text-heemia-grey'}`}>
                        {delta === null ? '–' : `${delta > 0 ? '+' : ''}${formatCurrency(delta)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
