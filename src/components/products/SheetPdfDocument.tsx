import { createPortal } from 'react-dom'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { computeSheetCost } from '../../lib/sheetCost'
import { quantitaEffettiva } from '../../lib/sheetCost'
import { useMockStore } from '../../context/MockStore'
import type { Product, TechnicalSheet } from '../../types'

// Documento stampabile della scheda tecnica (spec §1: export PDF con layout professionale).
// Non usiamo librerie PDF: il documento è HTML nascosto a schermo e reso visibile solo in
// stampa dalle regole @media print in index.css, così "Salva come PDF" del browser produce
// un file con l'identità visiva Heemia (Playfair per i titoli, mono per i dati).
//
// IMPORTANTE — il documento va montato con un portal DIRETTAMENTE su <body>, non dentro
// l'albero React: in stampa nascondiamo l'applicazione con `body > #root { display: none }`,
// e `display:none` su un antenato nasconde tutti i discendenti, qualunque sia il loro
// display. Se questo documento restasse dentro #root, l'export uscirebbe bianco.

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '' || value === 0) return null
  return (
    <div className="pdf-row">
      <span className="pdf-row-label">{label}</span>
      <span className="pdf-row-value">{value}</span>
    </div>
  )
}

/**
 * `completa` è il documento interno (comprende costi e break-even).
 * `tecnica` è la copia destinata alle modelliste: stesse informazioni di lavorazione,
 * nessun dato economico — né costi unitari, né margine, né prezzi.
 */
export type PdfVariante = 'completa' | 'tecnica'

export function SheetPdfDocument({
  product,
  sheet,
  variante = 'completa',
}: {
  product: Product
  sheet: TechnicalSheet
  variante?: PdfVariante
}) {
  const { materials, accessories, invoices, suppliers } = useMockStore()
  const conCosti = variante === 'completa'
  const costo = computeSheetCost(sheet, { materials, accessories, invoices })
  const laboratorio = sheet.fornitoreLaboratorioId
    ? suppliers.find((s) => s.id === sheet.fornitoreLaboratorioId)?.nome
    : undefined
  const materiali = sheet.materiali ?? []
  const misure = sheet.misure ?? []
  const foto = sheet.foto ?? []

  return createPortal(
    <div id="sheet-print" aria-hidden>
      <header className="pdf-header">
        <div>
          <p className="pdf-brand">Heemia</p>
          <h1 className="pdf-title">{sheet.nomeProdotto || product.nome}</h1>
          <p className="pdf-subtitle">
            {(sheet.codiceProdotto || product.codiceProdotto) ?? ''}
            {sheet.categoria || product.categoria ? ` · ${sheet.categoria || product.categoria}` : ''}
            {sheet.collezione || product.collezione ? ` · ${sheet.collezione || product.collezione}` : ''}
          </p>
        </div>
        <div className="pdf-meta">
          <p>Stato: {sheet.statoScheda ?? 'bozza'}</p>
          <p>Creata il {formatDateIt(sheet.creataIl)}</p>
          {sheet.aggiornataIl && <p>Aggiornata il {formatDateIt(sheet.aggiornataIl)}</p>}
        </div>
      </header>

      {sheet.descrizioneTecnica && (
        <section className="pdf-section">
          <h2 className="pdf-h2">Descrizione tecnica</h2>
          <p className="pdf-text">{sheet.descrizioneTecnica}</p>
        </section>
      )}

      <section className="pdf-section pdf-avoid-break">
        <h2 className="pdf-h2">Dati tecnici</h2>
        <div className="pdf-grid">
          <Row label="Composizione" value={sheet.composizioneCompleta} />
          <Row label="Peso capo" value={sheet.pesoCapoGrammi ? `${sheet.pesoCapoGrammi} g` : ''} />
          <Row label="Taglie disponibili" value={(sheet.taglieDisponibili ?? []).join(', ')} />
          <Row label="Misure e vestibilità" value={sheet.misureVestibilita} />
          <Row label="Difficoltà produttiva" value={sheet.difficoltaProduttiva} />
          <Row label="Tempi stimati" value={sheet.tempiStimatiOre ? `${sheet.tempiStimatiOre} h` : ''} />
          <Row label="Trattamenti" value={sheet.trattamenti} />
          <Row label="Lavaggio consigliato" value={sheet.lavaggioConsigliato} />
          <Row label="Fornitore / laboratorio" value={laboratorio} />
          <Row label="Capi previsti" value={sheet.quantitaPrevistaProduzione} />
        </div>
      </section>

      {misure.length > 0 && (
        <section className="pdf-section pdf-avoid-break">
          <h2 className="pdf-h2">Misure</h2>
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Misura</th><th className="r">Valore</th><th>Taglia rif.</th>
                <th>Tolleranza</th><th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {misure.map((m) => (
                <tr key={m.id}>
                  <td>{m.nome}</td>
                  <td className="r">{m.valore != null ? `${m.valore} ${m.unita}` : '–'}</td>
                  <td>{m.tagliaRiferimento || '–'}</td>
                  <td>{m.tolleranza || '–'}</td>
                  <td>{m.nota || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {materiali.length > 0 && (
        <section className="pdf-section pdf-avoid-break">
          <h2 className="pdf-h2">Materiali e componenti</h2>
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Materiale</th><th>U.M.</th><th className="r">Quantità</th><th className="r">Scarto</th>
                {conCosti && <><th className="r">Costo unitario</th><th className="r">Costo capo</th></>}
              </tr>
            </thead>
            <tbody>
              {materiali.map((m) => {
                const qta = quantitaEffettiva(m)
                const tot = qta * m.costoUnitario * (1 + Math.max(0, m.percentualeScarto) / 100)
                return (
                  <tr key={m.id}>
                    <td>{m.descrizione || '–'}</td>
                    <td>{m.unitaMisura}</td>
                    <td className="r">{qta}</td>
                    <td className="r">{m.percentualeScarto}%</td>
                    {conCosti && (
                      <>
                        <td className="r">{formatCurrency(m.costoUnitario)}</td>
                        <td className="r">{formatCurrency(tot)}</td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {(sheet.lavorazione || sheet.istruzioniConfezione || sheet.noteTecniche || sheet.noteProduzione) && (
        <section className="pdf-section pdf-avoid-break">
          <h2 className="pdf-h2">Lavorazioni e confezione</h2>
          {sheet.lavorazione && <p className="pdf-text"><strong>Lavorazione.</strong> {sheet.lavorazione}</p>}
          {sheet.istruzioniConfezione && <p className="pdf-text"><strong>Istruzioni di confezione.</strong> {sheet.istruzioniConfezione}</p>}
          {sheet.noteTecniche && <p className="pdf-text"><strong>Note tecniche.</strong> {sheet.noteTecniche}</p>}
          {sheet.noteProduzione && <p className="pdf-text"><strong>Note di produzione.</strong> {sheet.noteProduzione}</p>}
        </section>
      )}

      {/* Note della scheda e PDF allegato, se presenti. */}
      {(sheet.noteVersione || sheet.pdfFile || (conCosti && sheet.scanAI)) && (
        <section className="pdf-section pdf-avoid-break">
          <h2 className="pdf-h2">Note e documento allegato</h2>
          {sheet.noteVersione && <p className="pdf-text">{sheet.noteVersione}</p>}
          <div className="pdf-grid">
            <Row label="Documento allegato" value={sheet.pdfFile?.nome} />
            <Row label="Caricato il" value={sheet.pdfFile ? formatDateIt(sheet.pdfFile.caricatoIl) : ''} />
            {conCosti && (
              <>
                <Row label="Costi letti dall'AI il" value={sheet.scanAI ? formatDateIt(sheet.scanAI.analizzatoIl) : ''} />
                <Row label="Affidabilità lettura" value={sheet.scanAI?.affidabilita} />
              </>
            )}
          </div>
          {conCosti && sheet.scanAI?.note && <p className="pdf-text">{sheet.scanAI.note}</p>}
        </section>
      )}

      {conCosti && (
        <section className="pdf-section pdf-avoid-break">
          <h2 className="pdf-h2">Costi e break-even</h2>
          <div className="pdf-grid">
            <Row label="Costo materiali" value={formatCurrency(costo.costoMateriali)} />
            <Row label="Costo accessori" value={formatCurrency(costo.costoAccessori)} />
            <Row label="Costo lavorazioni" value={formatCurrency(costo.costoLavorazioni)} />
            <Row label="Quota sviluppo e progettazione" value={formatCurrency(costo.quotaSviluppo)} />
            <Row label="Altri costi attribuiti" value={formatCurrency(costo.altriCosti)} />
          </div>
          <div className="pdf-total">
            <div>
              <span className="pdf-row-label">Costo totale unitario</span>
              <span className="pdf-total-value">{formatCurrency(costo.costoTotaleUnitario)}</span>
            </div>
            <div>
              <span className="pdf-row-label">Prezzo di break-even</span>
              <span className="pdf-total-value">{formatCurrency(costo.prezzoBreakEven)}</span>
            </div>
          </div>
          <p className="pdf-notice">
            Break-even: questo prezzo copre esclusivamente i costi e non genera margine
            (margine {formatCurrency(costo.margineEuro)} · {costo.marginePercentuale.toFixed(1)}%).
            Non è un prezzo di vendita consigliato.
          </p>
        </section>
      )}

      {foto.length > 0 && (
        <section className="pdf-section">
          <h2 className="pdf-h2">Fotografie del prototipo</h2>
          <div className="pdf-photos">
            {foto.map((f) => (
              <figure key={f.id} className="pdf-photo">
                <img src={f.dataUrl} alt={f.nome} />
                <figcaption>{f.nome}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <footer className="pdf-footer">
        Heemia · Scheda tecnica {sheet.nomeProdotto || product.nome}
        {!conCosti && ' · Copia per la modellista (senza dati economici)'}
      </footer>
    </div>,
    document.body,
  )
}
