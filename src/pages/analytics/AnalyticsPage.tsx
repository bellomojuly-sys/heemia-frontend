import { useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiTile } from '../../components/dashboard/KpiTile'
import { LoadingState, EmptyState } from '../../components/ui/States'
import { Button } from '../../components/ui/Button'
import { formatCurrency } from '../../lib/format'
import { useAnalyticsSummary, type RangeAnalytics, type ProdottoAnalytics } from '../../hooks/useServerAnalytics'

// Backlog "Note" §10 — pagina Analytics. Tutti i numeri arrivano da GA4 attraverso il
// backend; qui non c'è nessuna credenziale e nessuna chiamata diretta a Google.
const RANGES: { id: RangeAnalytics; label: string }[] = [
  { id: 'today', label: 'Oggi' },
  { id: '7d', label: 'Ultimi 7 giorni' },
  { id: '30d', label: 'Ultimi 30 giorni' },
  { id: 'month', label: 'Mese corrente' },
  { id: 'custom', label: 'Intervallo personalizzato' },
]

const numero = (n: number) => n.toLocaleString('it-IT')
const percento = (n: number) => `${n.toFixed(1).replace('.', ',')}%`

/** Variazione rispetto al periodo precedente: null quando prima il valore era zero. */
function variazione(oggi: number, prima: number): string | null {
  if (prima <= 0) return null
  const delta = ((oggi - prima) / prima) * 100
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%`
}

export function AnalyticsPage() {
  const [range, setRange] = useState<RangeAnalytics>('7d')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const { dati, caricamento, daCollegare, errore, ricarica } = useAnalyticsSummary(range, from, to)

  const campoData =
    'rounded-heemia-sm border border-heemia-border bg-white px-2.5 py-1.5 text-sm text-heemia-black transition-all duration-200 ease-heemia focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10'

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Traffico e vendite del sito, da Google Analytics 4."
        action={dati ? <Button variant="secondary" onClick={ricarica}>Aggiorna</Button> : undefined}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRange(r.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200 ease-heemia ${
              range === r.id
                ? 'border-heemia-black bg-heemia-black text-white'
                : 'border-heemia-border-strong bg-white text-heemia-black hover:border-heemia-black'
            }`}
          >
            {r.label}
          </button>
        ))}
        {range === 'custom' && (
          <span className="flex items-center gap-2">
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={campoData} aria-label="Data di inizio" />
            <span className="text-xs text-heemia-grey">→</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={campoData} aria-label="Data di fine" />
          </span>
        )}
      </div>

      {daCollegare && (
        <Card className="mb-6">
          <CardHeader title="Google Analytics non è ancora collegato" subtitle="La pagina è pronta: mancano solo le credenziali." />
          <div className="space-y-2 p-5 text-sm text-heemia-grey">
            <p>Per attivarla servono due cose, da impostare come variabili d'ambiente del backend (mai nel repository):</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><code className="font-mono-heemia text-heemia-black">GA_PROPERTY_ID</code> — l'identificativo numerico della proprietà GA4 (Amministrazione → Dettagli proprietà).</li>
              <li><code className="font-mono-heemia text-heemia-black">GA_CREDENTIALS_JSON</code> — il file JSON del service account, su una riga sola. Il service account va poi aggiunto alla proprietà GA4 con ruolo <em>Visualizzatore</em>.</li>
            </ul>
            <p>Finché mancano, il resto dell'applicazione funziona normalmente.</p>
          </div>
        </Card>
      )}

      {errore && !daCollegare && (
        <Card className="mb-6 border-heemia-carmine/40 bg-heemia-carmine-light/40">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-heemia-black">{errore}</p>
            <Button variant="secondary" onClick={ricarica}>Riprova</Button>
          </div>
        </Card>
      )}

      {caricamento && <LoadingState rows={5} />}

      {dati && !caricamento && (
        <>
          <p className="mb-3 text-xs text-heemia-grey">
            Periodo {dati.periodo.startDate} → {dati.periodo.endDate} · confronto con {dati.periodoPrecedente.startDate} → {dati.periodoPrecedente.endDate}
          </p>

          <div className="mb-4 flex flex-wrap gap-3">
            <KpiTile label="Utenti" value={numero(dati.totali.utenti)} tooltip={confronto('utenti', dati.totali.utenti, dati.totaliPrecedenti.utenti)} />
            <KpiTile label="Sessioni" value={numero(dati.totali.sessioni)} tooltip={confronto('sessioni', dati.totali.sessioni, dati.totaliPrecedenti.sessioni)} />
            <KpiTile label="Nuovi utenti" value={numero(dati.totali.nuoviUtenti)} tooltip={confronto('nuovi utenti', dati.totali.nuoviUtenti, dati.totaliPrecedenti.nuoviUtenti)} />
            <KpiTile label="Ricavi" value={formatCurrency(dati.totali.ricavi)} tooltip={confronto('ricavi', dati.totali.ricavi, dati.totaliPrecedenti.ricavi)} />
            <KpiTile label="Tasso di conversione" value={percento(dati.totali.tassoConversione)} tooltip="Acquisti diviso sessioni, nel periodo scelto." />
          </div>

          <Card className="mb-4">
            <CardHeader title="Dal prodotto all'acquisto" subtitle="Quanti si perdono a ogni passaggio, nel periodo scelto." />
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
              <Passo etichetta="Visualizzazioni prodotto" valore={dati.totali.visualizzazioniProdotto} precedente={dati.totaliPrecedenti.visualizzazioniProdotto} />
              <Passo etichetta="Aggiunte al carrello" valore={dati.totali.aggiunteCarrello} precedente={dati.totaliPrecedenti.aggiunteCarrello} riferimento={dati.totali.visualizzazioniProdotto} />
              <Passo etichetta="Checkout avviati" valore={dati.totali.checkoutAvviati} precedente={dati.totaliPrecedenti.checkoutAvviati} riferimento={dati.totali.aggiunteCarrello} />
              <Passo etichetta="Acquisti" valore={dati.totali.acquisti} precedente={dati.totaliPrecedenti.acquisti} riferimento={dati.totali.checkoutAvviati} />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Canali di acquisizione" subtitle="Da dove arrivano le sessioni." />
              {dati.canali.length === 0 ? (
                <p className="p-5 text-sm text-heemia-grey">Nessun dato per questo periodo.</p>
              ) : (
                <ul className="divide-y divide-heemia-border">
                  {dati.canali.map((c) => (
                    <li key={c.canale} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <span className="text-heemia-black">{c.canale}</span>
                      <span className="font-mono-heemia text-heemia-grey">{numero(c.sessioni)} sessioni · {numero(c.utenti)} utenti</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <ClassificaProdotti titolo="Prodotti più visualizzati" righe={dati.piuVisti} chiave="visualizzazioni" />
            <ClassificaProdotti titolo="Prodotti più aggiunti al carrello" righe={dati.piuAggiunti} chiave="aggiunteCarrello" />
            <ClassificaProdotti titolo="Prodotti più acquistati" righe={dati.piuAcquistati} chiave="acquisti" />
          </div>
        </>
      )}

      {/* Con l'intervallo personalizzato incompleto non si è ancora chiamato il server:
          lo stato vuoto deve dire cosa manca, non "nessun dato". */}
      {!dati && !caricamento && !daCollegare && !errore && (
        <EmptyState
          title={range === 'custom' ? 'Scegli le due date' : 'Nessun dato'}
          description={
            range === 'custom'
              ? 'Indica la data di inizio e quella di fine: i dati si caricano appena sono impostate entrambe.'
              : 'Nessun dato disponibile per il periodo scelto.'
          }
        />
      )}
    </div>
  )
}

function confronto(nome: string, oggi: number, prima: number): string {
  const v = variazione(oggi, prima)
  return v ? `${v} rispetto al periodo precedente (${nome}: ${numero(prima)}).` : `Nessun dato di confronto per ${nome} nel periodo precedente.`
}

// Un passaggio dell'imbuto: valore, variazione e quanta parte del passo precedente resta.
function Passo({ etichetta, valore, precedente, riferimento }: { etichetta: string; valore: number; precedente: number; riferimento?: number }) {
  const v = variazione(valore, precedente)
  const resa = riferimento && riferimento > 0 ? (valore / riferimento) * 100 : null
  return (
    <div>
      <p className="font-sans text-[10px] font-medium uppercase tracking-[0.08em] text-heemia-grey">{etichetta}</p>
      <p className="font-sans mt-1 text-[1.5rem] leading-none font-medium tabular-nums text-heemia-black">{numero(valore)}</p>
      <p className="mt-1 text-xs text-heemia-grey">
        {v ?? '—'}
        {resa !== null && <> · {percento(resa)} del passo precedente</>}
      </p>
    </div>
  )
}

function ClassificaProdotti({ titolo, righe, chiave }: { titolo: string; righe: ProdottoAnalytics[]; chiave: keyof Omit<ProdottoAnalytics, 'nome'> }) {
  return (
    <Card>
      <CardHeader title={titolo} />
      {righe.length === 0 ? (
        <p className="p-5 text-sm text-heemia-grey">Nessun dato per questo periodo.</p>
      ) : (
        <ul className="divide-y divide-heemia-border">
          {righe.map((r) => (
            <li key={r.nome} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span className="min-w-0 truncate text-heemia-black">{r.nome}</span>
              <span className="font-mono-heemia text-heemia-grey">{numero(r[chiave])}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
