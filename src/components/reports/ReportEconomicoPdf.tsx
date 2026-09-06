import { createPortal } from 'react-dom'
import { formatCurrency } from '../../lib/format'
import { AZIENDA } from '../../lib/azienda'
import type { ReportEconomico } from '../../hooks/useServerReportEconomico'

// Report economico stampabile. Stessa tecnica della scheda tecnica e della bolla: niente
// librerie PDF, è HTML nascosto a schermo che le regole @media print rendono visibile,
// così "Salva come PDF" del browser produce un file con l'identità Heemia.
//
// Come gli altri, va montato con un portal DIRETTAMENTE su <body>: in stampa
// l'applicazione viene nascosta con `body > *:not(...)`, e un `display:none` su un antenato
// nasconderebbe anche questo, facendo uscire un foglio bianco.

function Riga({ label, value }: { label: string; value: string }) {
  return (
    <div className="pdf-row">
      <span className="pdf-row-label">{label}</span>
      <span className="pdf-row-value">{value}</span>
    </div>
  )
}

export function ReportEconomicoPdf({ report }: { report: ReportEconomico }) {
  const { entrate, uscite, costiFissi } = report
  const generato = new Date(report.generatoIl).toLocaleString('it-IT')

  return createPortal(
    <div id="report-print" aria-hidden>
      <header className="pdf-header">
        <div>
          <p className="pdf-brand">Heemia</p>
          <h1 className="pdf-title">Report economico</h1>
          <p className="pdf-subtitle">{report.meseLabel}</p>
        </div>
        <div className="pdf-meta">
          <p>{AZIENDA.ragioneSociale}</p>
          <p>P. IVA {AZIENDA.partitaIva}</p>
          <p>Generato il {generato}</p>
        </div>
      </header>

      {/* Gli avvisi stanno in cima, non in fondo: un numero incompleto va letto sapendo
          che è incompleto, non scoperto dopo aver preso una decisione. */}
      {report.avvisi.length > 0 && (
        <section className="pdf-section pdf-avoid-break">
          <h2 className="pdf-h2">Da tenere presente</h2>
          <ul className="pdf-note-list">
            {report.avvisi.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="pdf-section pdf-avoid-break">
        <h2 className="pdf-h2">Entrate del mese</h2>
        <Riga label="Ordini Shopify" value={formatCurrency(entrate.ordiniShopify)} />
        <Riga label="Ordini showroom" value={formatCurrency(entrate.ordiniShowroom)} />
        <Riga
          label={entrate.scontriniRegistrati ? 'Incasso scontrini' : 'Incasso scontrini (chiusura non caricata)'}
          value={formatCurrency(entrate.incassoScontrini)}
        />
        <div className="pdf-total">
          <div>
            <span className="pdf-row-label">Totale entrate</span>
            <span className="pdf-total-value">{formatCurrency(entrate.totale)}</span>
          </div>
        </div>
        <p className="pdf-caption">
          Le tre voci restano distinte perché sono tre canali diversi. Se una vendita di showroom
          è registrata sia come ordine sia come scontrino Billy, va contata una volta sola.
        </p>
      </section>

      <section className="pdf-section">
        <h2 className="pdf-h2">Uscite del mese, per categoria</h2>
        {uscite.numeroFatture === 0 ? (
          <p className="pdf-caption">Nessuna fattura registrata per questo mese.</p>
        ) : (
          <>
            <table className="pdf-table">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th className="r">Fatture</th>
                  <th className="r">Imponibile</th>
                </tr>
              </thead>
              <tbody>
                {uscite.perCategoria.map((c) => (
                  <tr key={c.categoria}>
                    <td>{c.etichetta}</td>
                    <td className="r">{c.numeroFatture}</td>
                    <td className="r">{formatCurrency(c.imponibile)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pdf-total">
              <div>
                <span className="pdf-row-label">Totale uscite (imponibile)</span>
                <span className="pdf-total-value">{formatCurrency(uscite.totaleImponibile)}</span>
              </div>
            </div>
            <p className="pdf-caption">
              Si conta l&apos;imponibile: l&apos;IVA sugli acquisti ({formatCurrency(uscite.totaleIva)}) si
              recupera e non è un costo dell&apos;azienda.
            </p>
          </>
        )}
      </section>

      {uscite.numeroFatture > 0 && (
        <section className="pdf-section pdf-avoid-break">
          <h2 className="pdf-h2">Stato dei pagamenti</h2>
          <Riga label="Già pagate" value={formatCurrency(uscite.pagate)} />
          <Riga label="Da pagare" value={formatCurrency(uscite.daPagare)} />
          <Riga label="Scadute" value={formatCurrency(uscite.scadute)} />
        </section>
      )}

      <section className="pdf-section pdf-avoid-break">
        <h2 className="pdf-h2">Costi fissi</h2>
        {costiFissi.voci.length === 0 ? (
          <p className="pdf-caption">Nessuna voce di costo fisso inserita.</p>
        ) : (
          <>
            <table className="pdf-table">
              <thead>
                <tr>
                  <th>Voce</th>
                  <th className="r">Importo annuo</th>
                </tr>
              </thead>
              <tbody>
                {costiFissi.voci.map((v) => (
                  <tr key={v.nome}>
                    <td>{v.nome}</td>
                    <td className="r">{formatCurrency(v.importoAnnuo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pdf-total">
              <div>
                <span className="pdf-row-label">Quota del mese (annuo ÷ 12)</span>
                <span className="pdf-total-value">{formatCurrency(costiFissi.quotaMensile)}</span>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="pdf-section pdf-avoid-break">
        <h2 className="pdf-h2">Risultato del mese</h2>
        <Riga label="Entrate" value={formatCurrency(entrate.totale)} />
        <Riga label="Uscite (imponibile)" value={`− ${formatCurrency(uscite.totaleImponibile)}`} />
        <Riga label="Quota costi fissi" value={`− ${formatCurrency(costiFissi.quotaMensile)}`} />
        <div className="pdf-total">
          <div>
            <span className="pdf-row-label">Risultato</span>
            <span className="pdf-total-value">{formatCurrency(report.risultato)}</span>
          </div>
        </div>
      </section>

      <footer className="pdf-footer">
        <p>
          {AZIENDA.ragioneSociale} · {AZIENDA.sedeLegale} · P. IVA {AZIENDA.partitaIva}
        </p>
        <p>Documento interno generato da Heemia il {generato}. Non è un documento fiscale.</p>
      </footer>
    </div>,
    document.body,
  )
}
