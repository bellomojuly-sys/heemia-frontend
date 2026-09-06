import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { LoadingState } from '../ui/States'
import { fieldClass } from '../ui/Modal'
import { formatCurrency, meseLabel } from '../../lib/format'
import { useServerReportEconomico } from '../../hooks/useServerReportEconomico'
import { ReportEconomicoPdf } from './ReportEconomicoPdf'

// Report economico del mese (spec Giulia 2026-08-13): quanto è entrato, quanto è uscito e
// in che cosa, più la quota dei costi fissi. È la ragione per cui le fatture stanno
// nell'app: non servono al fisco, servono a riempire la colonna delle uscite.

function Voce({ label, value, nota }: { label: string; value: string; nota?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0">
        <span className="text-heemia-black">{label}</span>
        {nota && <span className="ml-2 text-[11px] text-heemia-grey-light">{nota}</span>}
      </span>
      <span className="font-mono-heemia whitespace-nowrap text-heemia-grey">{value}</span>
    </li>
  )
}

export function ReportEconomicoCard() {
  const { report, mesi, mese, setMese, caricamento, errore } = useServerReportEconomico()
  // Il documento va montato PRIMA di window.print(), altrimenti si stampa il nulla:
  // la stampa parte dall'effetto, non dal click. Stessa regola della bolla.
  const [stampaRichiesta, setStampaRichiesta] = useState(false)

  useEffect(() => {
    if (!stampaRichiesta) return
    setStampaRichiesta(false)
    window.print()
  }, [stampaRichiesta])

  return (
    <Card className="mb-6">
      <CardHeader
        title="Report economico del mese"
        subtitle="Quanto è entrato, quanto è uscito e in che cosa. Le fatture caricate servono a questo."
        action={
          <div className="flex items-center gap-2">
            <select
              className={`${fieldClass} w-auto min-w-[10rem]`}
              value={mese}
              onChange={(e) => setMese(e.target.value)}
              aria-label="Mese del report"
            >
              {(mesi.length > 0 ? mesi : [mese]).map((m) => (
                <option key={m} value={m}>{meseLabel(m)}</option>
              ))}
            </select>
            <Button disabled={!report || caricamento} onClick={() => setStampaRichiesta(true)}>
              <Download aria-hidden className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
              Scarica PDF
            </Button>
          </div>
        }
      />

      {caricamento ? (
        <LoadingState rows={4} />
      ) : errore ? (
        <p className="p-5 text-sm text-heemia-carmine">{errore}</p>
      ) : !report ? (
        <p className="p-5 text-sm text-heemia-grey">Report non disponibile per questo ruolo.</p>
      ) : (
        <>
          {report.avvisi.length > 0 && (
            <div className="border-b border-heemia-border bg-heemia-surface px-5 py-3">
              <ul className="space-y-1">
                {report.avvisi.map((a) => (
                  <li key={a} className="text-xs text-heemia-carmine">{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-3">
            <section>
              <h3 className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Entrate</h3>
              <ul className="divide-y divide-heemia-border">
                <Voce label="Ordini Shopify" value={formatCurrency(report.entrate.ordiniShopify)} />
                <Voce label="Ordini showroom" value={formatCurrency(report.entrate.ordiniShowroom)} />
                <Voce
                  label="Incasso scontrini"
                  nota={report.entrate.scontriniRegistrati ? undefined : 'chiusura non caricata'}
                  value={formatCurrency(report.entrate.incassoScontrini)}
                />
              </ul>
              <p className="mt-2 flex items-baseline justify-between border-t border-heemia-black pt-2 text-sm">
                <span className="text-heemia-black">Totale</span>
                <span className="font-mono-heemia text-heemia-black">{formatCurrency(report.entrate.totale)}</span>
              </p>
            </section>

            <section>
              <h3 className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                Uscite per categoria
              </h3>
              {report.uscite.numeroFatture === 0 ? (
                <p className="py-2 text-xs text-heemia-grey">Nessuna fattura registrata per questo mese.</p>
              ) : (
                <>
                  <ul className="divide-y divide-heemia-border">
                    {report.uscite.perCategoria.map((c) => (
                      <Voce
                        key={c.categoria}
                        label={c.etichetta}
                        nota={`${c.numeroFatture} ${c.numeroFatture === 1 ? 'fattura' : 'fatture'}`}
                        value={formatCurrency(c.imponibile)}
                      />
                    ))}
                  </ul>
                  <p className="mt-2 flex items-baseline justify-between border-t border-heemia-black pt-2 text-sm">
                    <span className="text-heemia-black">Totale imponibile</span>
                    <span className="font-mono-heemia text-heemia-black">
                      {formatCurrency(report.uscite.totaleImponibile)}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="success">Pagate {formatCurrency(report.uscite.pagate)}</Badge>
                    <Badge variant="warning-outline">Da pagare {formatCurrency(report.uscite.daPagare)}</Badge>
                    {report.uscite.scadute > 0 && (
                      <Badge variant="critical">Scadute {formatCurrency(report.uscite.scadute)}</Badge>
                    )}
                  </div>
                </>
              )}
            </section>

            <section>
              <h3 className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                Costi fissi e risultato
              </h3>
              <ul className="divide-y divide-heemia-border">
                <Voce
                  label="Quota del mese"
                  nota={`annuo ${formatCurrency(report.costiFissi.totaleAnnuo)} ÷ 12`}
                  value={formatCurrency(report.costiFissi.quotaMensile)}
                />
              </ul>
              <p className="mt-2 flex items-baseline justify-between border-t border-heemia-black pt-2 text-sm">
                <span className="text-heemia-black">Risultato</span>
                <span
                  className={`font-mono-heemia ${report.risultato < 0 ? 'text-heemia-carmine' : 'text-heemia-black'}`}
                >
                  {formatCurrency(report.risultato)}
                </span>
              </p>
              <p className="mt-2 text-[11px] text-heemia-grey">
                Entrate meno uscite meno la quota dei costi fissi. L&apos;IVA sugli acquisti
                ({formatCurrency(report.uscite.totaleIva)}) resta fuori: si recupera.
              </p>
            </section>
          </div>

          {/* Sempre nel DOM, invisibile a schermo: le regole @media print lo fanno comparire
              e nascondono l'app. Montarlo solo al click non funzionerebbe — l'effetto azzera
              il flag nello stesso giro di render e uscirebbe un foglio bianco. */}
          <ReportEconomicoPdf report={report} />
        </>
      )}
    </Card>
  )
}
