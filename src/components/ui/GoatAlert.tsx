import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { DURATA_PREDEFINITA, type LivelloAlert } from '../../lib/goatMessages'
import goatMascot from '../../assets/goat-mascot.png'

/**
 * La capretta Heemia — non più ricostruita a mano in SVG: è l'illustrazione
 * fornita direttamente dalla founder, ritagliata dallo sfondo bianco.
 *
 * Nessuno strumento di generazione immagini era disponibile all'inizio di
 * questo lavoro, quindi la prima versione era un disegno SVG fatto a mano,
 * per quanti giri di correzione ci provassi (pupille tonde invece che a
 * fessura, naso ridotto, orecchie raccolte…) non arrivava alla qualità di
 * un'illustrazione vera. Quando la founder ha incollato il riferimento nella
 * chat, l'ho salvato su disco (nessuno strumento estrae byte da un'immagine
 * incollata: ho dovuto chiederle di salvarla lei e indicarmi dove) e ripulito
 * con un flood-fill del bianco di sfondo dai quattro angoli + una soglia
 * dedicata per l'ombra ellittica sotto le zampe (una sacca di grigio chiusa
 * fra le zampe, non collegata ai bordi: il flood-fill da solo non la
 * raggiungeva) — vedi lo script che ha prodotto `src/assets/goat-mascot.png`.
 *
 * **Compromesso accettato**: essendo un raster piatto, non è più possibile
 * animare i pezzi singolarmente (orecchie, occhi, coda ciascuno per conto
 * proprio, come nella versione SVG). Resta l'animazione sull'immagine intera
 * — il saltello con squash&stretch, `.goat-hop` in `index.css` — che è
 * comunque quanto la richiesta originale chiedeva come minimo ("piccolo
 * salto, battito di ciglia o movimento della testa").
 */
export function GoatIcon({ className = '' }: { className?: string }) {
  return <img src={goatMascot} alt="" aria-hidden className={`goat-hop object-contain ${className}`} />
}

const CORNICE: Record<LivelloAlert, string> = {
  error: 'border-heemia-carmine/35 bg-heemia-carmine-light',
  warning: 'border-heemia-orange/35 bg-heemia-orange-light',
  info: 'border-heemia-border-strong bg-white',
}

export interface GoatAlertData {
  id: number
  titolo: string
  testo: string
  livello: LivelloAlert
  durata: number
}

function GoatAlertCard({ alert, onClose }: { alert: GoatAlertData; onClose: () => void }) {
  const [uscita, setUscita] = useState(false)

  useEffect(() => {
    // Due tempi: prima parte l'animazione di uscita, poi si toglie dalla lista.
    // Togliendolo subito sparirebbe di scatto, che è esattamente ciò che questo
    // componente esiste per evitare.
    const chiusura = setTimeout(() => setUscita(true), alert.durata)
    const rimozione = setTimeout(onClose, alert.durata + 260)
    return () => {
      clearTimeout(chiusura)
      clearTimeout(rimozione)
    }
  }, [alert.durata, onClose])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`goat-alert pointer-events-auto flex w-full items-start gap-3 rounded-heemia-lg border px-4 py-3 shadow-heemia-lg ${
        CORNICE[alert.livello]
      } ${uscita ? 'goat-alert-uscita' : ''}`}
    >
      <GoatIcon className="-my-1.5 -ml-1 h-14 w-14 shrink-0 text-heemia-black" />
      <div className="min-w-0 flex-1 pt-1">
        <p className="font-display text-sm font-medium leading-snug text-heemia-black">{alert.titolo}</p>
        <p className="mt-0.5 text-xs leading-snug text-heemia-grey">{alert.testo}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          setUscita(true)
          setTimeout(onClose, 260)
        }}
        aria-label="Chiudi avviso"
        className="-mr-1 -mt-1 rounded-full p-1 text-heemia-grey transition-all duration-200 ease-heemia hover:rotate-90 hover:bg-white/70 hover:text-heemia-black"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/**
 * Pila degli avvisi. In basso a destra sul desktop, in alto e a tutta larghezza
 * sul telefono: lì il pollice sta in basso e un avviso in quella zona finirebbe
 * sotto la mano proprio mentre lo si legge.
 * `pointer-events-none` sul contenitore, `auto` sulle card: la colonna vuota non
 * deve intercettare i click destinati alla pagina sotto.
 */
export function GoatAlertStack({ alerts, onClose }: { alerts: GoatAlertData[]; onClose: (id: number) => void }) {
  if (alerts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:top-auto sm:items-end">
      {alerts.map((a) => (
        <GoatAlertCard key={a.id} alert={a} onClose={() => onClose(a.id)} />
      ))}
    </div>
  )
}

export { DURATA_PREDEFINITA }
