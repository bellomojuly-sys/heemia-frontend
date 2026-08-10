import { createPortal } from 'react-dom'
import { formatDateIt } from '../../lib/format'
import { AZIENDA } from '../../lib/azienda'
import type { BollaLavorazione, CausaleBolla } from '../../types'

// Documento stampabile della bolla di consegna. Stessa tecnica della scheda tecnica
// (SheetPdfDocument): niente librerie PDF, è HTML nascosto a schermo che le regole
// @media print rendono visibile, così "Salva come PDF" del browser produce un file con
// l'identità Heemia.
//
// Come lì, il documento va montato con un portal DIRETTAMENTE su <body>: in stampa
// l'applicazione viene nascosta con `body > *:not(...)`, e un `display:none` su un antenato
// nasconderebbe anche questo, facendo uscire un foglio bianco.

const CAUSALI: Record<CausaleBolla, string> = {
  conto_lavorazione: 'Conto lavorazione',
  conto_visione: 'Conto visione',
  riparazione: 'Riparazione',
  campionatura: 'Campionatura',
  reso_a_fornitore: 'Reso a fornitore',
  altro: 'Altro',
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null
  return (
    <div className="pdf-row">
      <span className="pdf-row-label">{label}</span>
      <span className="pdf-row-value">{value}</span>
    </div>
  )
}

export function BollaPdfDocument({ bolla }: { bolla: BollaLavorazione }) {
  // I dati del lavorante sono quelli congelati all'emissione quando ci sono: il documento
  // deve dire a chi è stato consegnato allora, non chi è quel fornitore oggi.
  const lavorante = bolla.lavoranteNome ?? bolla.lavorante.nome
  const partitaIva = bolla.lavorantePartitaIva ?? bolla.lavorante.partitaIva

  return createPortal(
    <div id="bolla-print" aria-hidden>
      <header className="pdf-header">
        <div>
          <p className="pdf-brand">Heemia</p>
          <h1 className="pdf-title">Documento di trasporto</h1>
          <p className="pdf-subtitle">
            {CAUSALI[bolla.causale]}
            {bolla.commessa ? ` · Commessa ${bolla.commessa}` : ''}
          </p>
        </div>
        <div className="pdf-meta">
          <p>{bolla.numero ?? 'BOZZA — non emessa'}</p>
          <p>Del {formatDateIt(bolla.data)}</p>
          {bolla.emittente && <p>Emessa da {bolla.emittente.nome}</p>}
        </div>
      </header>

      <section className="pdf-section pdf-avoid-break">
        <h2 className="pdf-h2">Mittente e destinatario</h2>
        <div className="pdf-grid">
          <div>
            <Row label="Mittente" value={AZIENDA.ragioneSociale} />
            <Row label="P. IVA" value={AZIENDA.partitaIva} />
            <Row label="Sede" value={AZIENDA.sedeLegale} />
          </div>
          <div>
            <Row label="Destinatario" value={lavorante} />
            <Row label="P. IVA" value={partitaIva} />
            <Row label="Città" value={bolla.lavorante.citta} />
          </div>
        </div>
      </section>

      {(bolla.prodotto || bolla.quantitaAttesa > 0) && (
        <section className="pdf-section pdf-avoid-break">
          <h2 className="pdf-h2">Lavorazione richiesta</h2>
          <div className="pdf-grid">
            <div>
              <Row label="Capo" value={bolla.prodotto ? `${bolla.prodotto.nome} (${bolla.prodotto.codiceProdotto})` : null} />
              <Row label="Scheda tecnica" value={bolla.schedaTecnica ? `Versione ${bolla.schedaTecnica.versione}` : null} />
            </div>
            <div>
              <Row label="Capi attesi" value={bolla.quantitaAttesa > 0 ? bolla.quantitaAttesa : null} />
              <Row label="Ordine collegato" value={bolla.ordine?.numero} />
            </div>
          </div>
        </section>
      )}

      <section className="pdf-section">
        <h2 className="pdf-h2">Materiali consegnati</h2>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>Descrizione</th>
              <th>Codice</th>
              <th>Lotto / colore</th>
              <th>Origine</th>
              <th className="r">Quantità</th>
              <th>U.M.</th>
            </tr>
          </thead>
          <tbody>
            {bolla.righe.map((r) => (
              <tr key={r.id}>
                <td>{r.descrizione}</td>
                <td>{r.sku ?? '—'}</td>
                <td>{[r.lotto, r.colore].filter(Boolean).join(' · ') || '—'}</td>
                <td>{r.provenienza === 'scampoli' ? 'Scampoli / recuperi' : 'Magazzino'}</td>
                <td className="r">{r.quantitaInviata}</td>
                <td>{r.unitaMisura}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pdf-total">
          <div>
            <span className="pdf-row-label">Righe</span>
            <span className="pdf-total-value">{bolla.righe.length}</span>
          </div>
        </div>
      </section>

      {bolla.note && (
        <section className="pdf-section pdf-avoid-break">
          <h2 className="pdf-h2">Note</h2>
          <p className="pdf-text">{bolla.note}</p>
        </section>
      )}

      <p className="pdf-notice">
        La merce elencata resta di proprietà di {AZIENDA.ragioneSociale} e viene consegnata a titolo di{' '}
        {CAUSALI[bolla.causale].toLowerCase()}. Non costituisce cessione.
      </p>

      <section className="pdf-section pdf-avoid-break" style={{ marginTop: '10mm' }}>
        <div className="pdf-grid">
          <div>
            <p className="pdf-row-label">Firma del vettore / incaricato</p>
            <div style={{ borderBottom: '0.5pt solid #000', height: '12mm' }} />
          </div>
          <div>
            <p className="pdf-row-label">Firma del destinatario per ricevuta</p>
            <div style={{ borderBottom: '0.5pt solid #000', height: '12mm' }} />
          </div>
        </div>
      </section>

      <footer className="pdf-footer">
        {bolla.numero ?? 'Bozza'} · {formatDateIt(bolla.data)} · Heemia — documento generato dal gestionale
      </footer>
    </div>,
    document.body,
  )
}
