import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../ui/Card'
import { useAnalyticsWidget } from '../../hooks/useServerAnalytics'

// Backlog "Note" §11 — riquadro Analytics in dashboard: imbuto degli ultimi 7 giorni,
// con la variazione delle aggiunte al carrello rispetto ai 7 giorni precedenti (è il dato
// che segnala l'interesse commerciale prima dell'acquisto). Tutto il riquadro è un link
// alla pagina Analytics completa.
//
// Se Google Analytics non è collegato, o il ruolo non ha il modulo, il riquadro **non
// compare affatto**: la dashboard appena riordinata (§8) non deve riempirsi di caselle
// che dicono solo "manca qualcosa".
const numero = (n: number) => n.toLocaleString('it-IT')

export function AnalyticsWidget({ attivo }: { attivo: boolean }) {
  const { dati, daCollegare, errore } = useAnalyticsWidget(attivo)

  if (!attivo || daCollegare || errore || !dati) return null

  const variazione = dati.variazioneAggiunteCarrello
  const segno = variazione === null ? null : variazione >= 0 ? '+' : ''

  return (
    <Link to="/analytics" className="mb-4 block">
      <Card interactive>
        <CardHeader title="Sito, ultimi 7 giorni" subtitle="Dal prodotto guardato all'acquisto." />
        <div className="p-5">
          <div className="flex items-baseline gap-3">
            <span className="font-sans text-[1.75rem] leading-none font-medium tabular-nums text-heemia-black">
              {numero(dati.aggiunteCarrello)}
            </span>
            <span className="text-sm text-heemia-grey">aggiunte al carrello</span>
            {variazione !== null && (
              <span className={`font-mono-heemia text-xs ${variazione >= 0 ? 'text-heemia-green' : 'text-heemia-carmine'}`}>
                {segno}{variazione.toFixed(0)}%
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Passo etichetta="Prodotti visti" valore={dati.visualizzazioniProdotto} />
            <Passo etichetta="Al carrello" valore={dati.aggiunteCarrello} />
            <Passo etichetta="Checkout" valore={dati.checkoutAvviati} />
            <Passo etichetta="Acquisti" valore={dati.acquisti} />
          </div>

          <p className="mt-3 text-xs text-heemia-grey">
            Tasso di conversione {dati.tassoConversione.toFixed(1).replace('.', ',')}% · apri Analytics →
          </p>
        </div>
      </Card>
    </Link>
  )
}

function Passo({ etichetta, valore }: { etichetta: string; valore: number }) {
  return (
    <div>
      <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{etichetta}</p>
      <p className="font-sans mt-0.5 text-base font-medium tabular-nums text-heemia-black">{numero(valore)}</p>
    </div>
  )
}
