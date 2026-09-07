import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { LoadingState } from '../../components/ui/States'
import { formatCurrency, formatPercent } from '../../lib/format'
import { ApiError } from '../../lib/api'
import { useAiContesto, type ContestoAi } from '../../hooks/useAiContesto'

/**
 * AI Assistant.
 *
 * **Cos'era.** Una finta conversazione: una catena di `if` sul testo della domanda che
 * riconosceva quattro frasi e rispondeva con paragrafi scritti a mano, compresi due
 * identificativi di prodotto del prototipo (`prod-05`, `prod-06`) che nel database non
 * esistono più. Sembrava un assistente collegato ai dati, e non leggeva niente.
 *
 * **Cos'è ora.** Due metà distinte, che è la cosa importante:
 *
 *   1. **I dati, sempre.** La pagina legge `GET /ai/contesto` — la stessa fotografia che
 *      il server manda al modello — e la mostra: stock basso, margini peggiori, capi in
 *      lavorazione, valore dello stock, fornitori incompleti, anomalie. Questa metà
 *      funziona adesso, senza chiave e senza rete, ed è dove stanno le risposte alle
 *      domande dell'elenco qui sotto.
 *   2. **Le parole, quando c'è la chiave.** La domanda va a `POST /ai/domanda`, che
 *      costruisce il contesto e lo passa a OpenAI. Senza `OPENAI_API_KEY` l'endpoint
 *      risponde 503 dicendo cosa manca, e la pagina lo riporta così com'è: **non** viene
 *      generata nessuna risposta di ripiego, perché una frase scritta a mano che sembra
 *      generata è peggio di un errore onesto.
 *
 * Il filtro dei permessi sta alla fonte: quello che un ruolo non vede non entra nel
 * contesto e quindi non parte nemmeno verso OpenAI. Chiedere all'assistente non è una
 * scorciatoia per leggere un modulo chiuso.
 */
export function AiAssistantPage() {
  const { contesto, caricamento, errore, ricarica, chiedi } = useAiContesto()
  const [domanda, setDomanda] = useState('')
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [conversazione, setConversazione] = useState<{ autore: 'utente' | 'assistant'; testo: string }[]>([])
  const [inCorso, setInCorso] = useState(false)
  const [erroreAi, setErroreAi] = useState<string | null>(null)

  const invia = async (testo: string) => {
    const q = testo.trim()
    if (!q || inCorso) return
    setInCorso(true)
    setErroreAi(null)
    setConversazione((c) => [...c, { autore: 'utente', testo: q }])
    setDomanda('')
    try {
      const esito = await chiedi(q, sessionId)
      setSessionId(esito.sessionId)
      setConversazione((c) => [...c, { autore: 'assistant', testo: esito.risposta }])
    } catch (e) {
      setErroreAi(e instanceof ApiError ? e.message : 'Richiesta non riuscita.')
    } finally {
      setInCorso(false)
    }
  }

  // Le domande dell'elenco: ognuna ha una risposta nei riquadri qui sotto, anche senza
  // modello collegato. Non sono esempi decorativi — sono l'indice della pagina.
  const esempi = [
    'Quali prodotti hanno stock basso?',
    'Quali prodotti hanno il margine più basso?',
    'Quali fornitori hanno informazioni mancanti?',
    'Quali prodotti sono attualmente in produzione?',
    "Qual è il valore dello stock?",
    'Quali anomalie sono presenti nei dati?',
  ]

  return (
    <div>
      <PageHeader
        title="AI Assistant"
        subtitle="Legge i dati veri del gestionale, in sola lettura e con i permessi del tuo ruolo. Non modifica niente."
        action={
          <Button variant="secondary" onClick={() => void ricarica()} disabled={caricamento}>
            <RefreshCw aria-hidden className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
            Aggiorna dati
          </Button>
        }
      />

      {caricamento && <LoadingState rows={6} />}
      {errore && <p className="mb-4 text-sm text-heemia-carmine">{errore}</p>}

      {contesto && (
        <>
          <Card className="mb-4">
            <CardHeader
              title="Chiedi qualcosa"
              subtitle={`Le risposte usano solo i dati qui sotto, aggiornati alle ${new Date(contesto.generatoIl).toLocaleTimeString('it-IT')}.`}
            />
            <div className="p-4">
              {conversazione.length > 0 && (
                <div className="mb-3 max-h-[40vh] space-y-3 overflow-y-auto">
                  {conversazione.map((m, i) => (
                    <div key={i} className={`flex ${m.autore === 'utente' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-xl whitespace-pre-wrap rounded-heemia px-3.5 py-2.5 text-sm ${
                          m.autore === 'utente' ? 'bg-heemia-black text-white' : 'bg-heemia-surface text-heemia-black'
                        }`}
                      >
                        {m.testo}
                      </div>
                    </div>
                  ))}
                  {inCorso && <p className="text-xs text-heemia-grey">Sto leggendo i dati e preparando la risposta…</p>}
                </div>
              )}

              {erroreAi && (
                <p className="mb-3 rounded-heemia-sm border border-heemia-border bg-heemia-surface px-3 py-2 text-sm text-heemia-black">
                  {erroreAi}
                </p>
              )}

              <div className="mb-3 flex flex-wrap gap-2">
                {esempi.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setDomanda(ex)}
                    className="rounded-heemia border border-heemia-border px-3 py-1 text-xs text-heemia-grey transition-colors hover:border-heemia-black hover:text-heemia-black"
                  >
                    {ex}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={domanda}
                  onChange={(e) => setDomanda(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void invia(domanda)}
                  placeholder="Fai una domanda sui dati del gestionale…"
                  className="flex-1 rounded-heemia border border-heemia-border px-3 py-2 text-sm transition-all duration-200 ease-heemia focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10"
                />
                <Button onClick={() => void invia(domanda)} disabled={inCorso || domanda.trim().length < 3}>
                  {inCorso ? 'Invio…' : 'Invia'}
                </Button>
              </div>
            </div>
          </Card>

          <Riquadri contesto={contesto} />
        </>
      )}
    </div>
  )
}

/** I dati, sezione per sezione. Ogni riquadro risponde a una delle domande di esempio. */
function Riquadri({ contesto }: { contesto: ContestoAi }) {
  const { inventario, produzione, economia, fornitori, anomalie } = contesto

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {anomalie.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader
            title="Anomalie nei dati"
            subtitle="Punti in cui il database non dice quello che serve per calcolare, o dice qualcosa che non può essere vero."
          />
          <ul className="divide-y divide-heemia-border">
            {anomalie.map((a) => (
              <li key={a.chiave} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                <AlertTriangle
                  aria-hidden
                  className={`mt-0.5 h-4 w-4 shrink-0 ${a.gravita === 'critica' ? 'text-heemia-carmine' : 'text-heemia-orange'}`}
                />
                <span className="flex-1">
                  <span className="font-mono-heemia mr-1.5 text-heemia-black">{a.quanti}</span>
                  <span className="text-heemia-grey">{a.descrizione}</span>
                </span>
                <span className="font-mono-heemia shrink-0 text-[11px] text-heemia-grey-light">{a.dove}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {inventario && (
        <Card>
          <CardHeader title="Stock" subtitle="Quanti pezzi ci sono, dove stanno e quanto valgono." />
          <div className="space-y-3 p-5 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dato etichetta="In magazzino" valore={inventario.capiInMagazzino} />
              <Dato etichetta="In laboratorio" valore={inventario.capiInLaboratorio} />
              <Dato etichetta="In lavorazione" valore={inventario.capiInLavorazione} />
              <Dato etichetta="Disponibili" valore={inventario.capiDisponibili} forte />
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-heemia-border pt-3">
              <Dato etichetta="Valore a prezzo di vendita" valore={formatCurrency(inventario.valore.aPrezzoDiVendita)} forte />
              <Dato
                etichetta="Valore a costo diretto"
                valore={inventario.valore.aCostoDiretto > 0 ? formatCurrency(inventario.valore.aCostoDiretto) : 'non calcolabile'}
              />
            </div>
            <p className="text-xs text-heemia-grey">{inventario.valore.nota}</p>

            <Elenco
              titolo="Varianti esaurite o sotto soglia"
              vuoto="Nessuna variante sotto la soglia minima."
              righe={inventario.stockBasso.map((r) => ({
                chiave: r.sku,
                sinistra: `${r.prodotto} · ${r.colore} ${r.taglia}`,
                destra: `${r.disponibile} / soglia ${r.soglia}`,
                critico: r.stato === 'esaurito',
              }))}
            />

            <Elenco
              titolo="Laboratorio da reintegrare (soglia lab.)"
              vuoto="Nessuna variante sotto la soglia di laboratorio."
              righe={inventario.laboratorioDaReintegrare.map((r) => ({
                chiave: r.sku,
                sinistra: `${r.prodotto} · ${r.sku}`,
                destra: `${r.inLaboratorio} / soglia ${r.sogliaLaboratorio}`,
              }))}
            />

            <Elenco
              titolo="Materiali sotto soglia"
              vuoto="Nessun materiale sotto soglia."
              righe={inventario.materialiSottoSoglia.map((r) => ({
                chiave: r.codice,
                sinistra: r.nome,
                destra: `${r.disponibile} ${r.unita} / soglia ${r.soglia}`,
                critico: r.stato === 'esaurito',
              }))}
            />
          </div>
        </Card>
      )}

      {produzione && (
        <Card>
          <CardHeader title="In produzione" subtitle="Solo i capi che stanno attraversando una lavorazione." />
          <div className="space-y-3 p-5 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Dato etichetta="In pipeline" valore={produzione.inPipeline} forte />
              <Dato etichetta="Fuori pipeline (prodotti)" valore={produzione.fuoriPipeline} />
            </div>
            <Elenco
              titolo="Capi in lavorazione"
              vuoto="Nessun capo è in lavorazione."
              righe={produzione.capi.map((c) => ({
                chiave: c.codice,
                sinistra: `${c.nome} · ${c.fase}`,
                destra: c.bloccata ? 'bloccata' : c.schedaTecnica ? 'scheda ok' : 'senza scheda',
                critico: c.bloccata,
              }))}
            />
            <p className="text-xs text-heemia-grey">{produzione.nota}</p>
            <Link to="/produzione" className="text-xs text-heemia-grey underline hover:text-heemia-black">
              Apri la pipeline →
            </Link>
          </div>
        </Card>
      )}

      {economia && (
        <Card>
          <CardHeader title="Margini e costi fissi" subtitle="Chi guadagna poco, e quanto pesa il fisso su ogni capo." />
          <div className="space-y-3 p-5 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dato etichetta="Costi fissi/anno" valore={formatCurrency(economia.costiFissiAnnui)} />
              <Dato etichetta="Al mese" valore={formatCurrency(economia.costiFissiMensili)} />
              <Dato
                etichetta="Quota per capo"
                valore={economia.quotaCalcolabile ? formatCurrency(economia.quotaPerCapo) : 'da impostare'}
                forte
              />
              <Dato etichetta="Sotto soglia" valore={economia.prodottiSottoSoglia} />
            </div>
            <Elenco
              titolo="Margini più bassi"
              vuoto="Nessun margine calcolabile: manca il costo diretto in scheda tecnica."
              righe={economia.marginiPeggiori.map((m) => ({
                chiave: m.prodotto,
                sinistra: m.prodotto,
                destra: `${formatPercent(m.marginePercentuale)} · costo ${formatCurrency(m.costoTotale)}`,
                critico: m.sottoSoglia,
              }))}
            />
            <Elenco
              titolo="Voci di costo fisso principali"
              vuoto="Nessuna voce di costo fisso inserita."
              righe={economia.vociCostoFissoPrincipali.map((v) => ({
                chiave: v.nome,
                sinistra: v.nome,
                destra: `${formatCurrency(v.importoAnnuo)} · ${v.percentuale}%`,
              }))}
            />
            <p className="text-xs text-heemia-grey">{economia.nota}</p>
          </div>
        </Card>
      )}

      {fornitori && (
        <Card>
          <CardHeader
            title="Fornitori con informazioni mancanti"
            subtitle={`${fornitori.completi} schede complete su ${fornitori.totale}.`}
          />
          <div className="space-y-3 p-5 text-sm">
            <Elenco
              titolo=""
              vuoto="Tutte le schede fornitore sono complete."
              righe={fornitori.incompleti.map((f) => ({
                chiave: f.nome,
                sinistra: `${f.nome} · ${f.categoria}`,
                destra: f.mancano.join(', '),
              }))}
            />
            <Link to="/fornitori" className="text-xs text-heemia-grey underline hover:text-heemia-black">
              Apri l'anagrafica fornitori →
            </Link>
          </div>
        </Card>
      )}

      {contesto.sezioniNonVisibili.length > 0 && (
        <Card className="lg:col-span-2">
          <div className="p-5 text-sm text-heemia-grey">
            Con il ruolo attivo non sono accessibili: {contesto.sezioniNonVisibili.join(', ')}. L'assistente non
            risponde su quei moduli — i dati non gli vengono nemmeno passati. Un amministratore può cambiarlo da
            Impostazioni → Preferenze e permessi.
          </div>
        </Card>
      )}
    </div>
  )
}

function Dato({ etichetta, valore, forte = false }: { etichetta: string; valore: string | number; forte?: boolean }) {
  return (
    <div>
      <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{etichetta}</p>
      <p className={`font-mono-heemia tabular-nums ${forte ? 'text-base text-heemia-black' : 'text-sm text-heemia-grey'}`}>
        {valore}
      </p>
    </div>
  )
}

function Elenco({
  titolo,
  vuoto,
  righe,
}: {
  titolo: string
  vuoto: string
  righe: { chiave: string; sinistra: string; destra: string; critico?: boolean }[]
}) {
  return (
    <div>
      {titolo && (
        <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{titolo}</p>
      )}
      {righe.length === 0 ? (
        <p className="text-xs text-heemia-grey">{vuoto}</p>
      ) : (
        <ul className="divide-y divide-heemia-border/70">
          {righe.map((r) => (
            <li key={r.chiave} className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-heemia-black">{r.sinistra}</span>
              {r.critico ? (
                <Badge variant="critical">{r.destra}</Badge>
              ) : (
                <span className="font-mono-heemia shrink-0 text-[11px] text-heemia-grey">{r.destra}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
