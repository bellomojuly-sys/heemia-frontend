import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { formatCurrency } from '../../lib/format'
import { getMisureForCategoria } from '../../lib/measurements'
import { fileToDownscaledDataUrl } from '../../lib/images'
import { inviaRichiesta, sessioneNonValida, type CatalogItem } from './showroomClient'

// Richiesta di personalizzazione (spec §7) e richiesta di informazioni. Non crea un ordine:
// crea la scheda che l'atelier lavora in "Richieste showroom" (DEC-044). Il prezzo indicato
// qui è quello di listino showroom, non un preventivo: quello arriva dopo, dall'atelier.

const inputClass =
  'w-full rounded-heemia border border-heemia-border px-3 py-2 text-sm transition-all duration-200 ease-heemia focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10'

const etichetta = 'font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey'

const MAX_IMMAGINI = 5

export function RichiestaForm({
  product,
  visitId,
  tipo,
  email,
  onClose,
  onInviata,
  onSessioneScaduta,
}: {
  product: CatalogItem
  visitId: string
  tipo: 'personalizzazione' | 'informazioni'
  email: string
  onClose: () => void
  onInviata: (numero: string) => void
  /** L'accesso non è più valido: si torna alla schermata di accesso invece di lasciare
   *  il cliente davanti a un errore che non può risolvere. */
  onSessioneScaduta: () => void
}) {
  const [tagliaBase, setTagliaBase] = useState('')
  const [coloreDesiderato, setColoreDesiderato] = useState('')
  const [lunghezza, setLunghezza] = useState('')
  const [modifiche, setModifiche] = useState('')
  const [note, setNote] = useState('')
  const [dataDesiderata, setDataDesiderata] = useState('')
  const [misure, setMisure] = useState<Record<string, string>>({})
  const [immagini, setImmagini] = useState<{ nome: string; dataUrl: string }[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const suMisura = tipo === 'personalizzazione'
  // Misure facoltative: se il cliente non le conosce si prendono in showroom alla prova
  // (set proposto in lib/measurements.ts, DEC-026).
  const misureDef = getMisureForCategoria(product.categoria ?? '')
  const taglie = product.taglieDisponibili.length > 0 ? product.taglieDisponibili : ['XS', 'S', 'M', 'L', 'XL']

  const caricaImmagini = async (files: FileList | null) => {
    if (!files?.length) return
    setErrore(null)
    const spazio = MAX_IMMAGINI - immagini.length
    if (spazio <= 0) {
      setErrore(`Puoi allegare al massimo ${MAX_IMMAGINI} immagini.`)
      return
    }
    try {
      const nuove = await Promise.all(
        Array.from(files).slice(0, spazio).map(async (f) => ({
          nome: f.name,
          dataUrl: await fileToDownscaledDataUrl(f),
        })),
      )
      // Aggiornamento funzionale: due caricamenti ravvicinati non si sovrascrivono.
      setImmagini((prev) => [...prev, ...nuove])
    } catch {
      setErrore('Non sono riuscito a leggere una delle immagini. Riprova con un altro file.')
    }
  }

  const invia = async () => {
    if (inCorso) return
    if (suMisura && !tagliaBase) {
      setErrore('Indica la taglia di partenza: serve al modellista come base.')
      return
    }
    if (!suMisura && !note.trim()) {
      setErrore('Scrivi la tua domanda, così possiamo risponderti.')
      return
    }
    setInCorso(true)
    setErrore(null)
    const misurePrese = Object.fromEntries(
      misureDef.filter((m) => misure[m.id]?.trim()).map((m) => [m.label.toLowerCase(), misure[m.id].trim()]),
    )
    try {
      const esito = await inviaRichiesta({
        visitId,
        tipo,
        productId: product.id,
        tagliaBase: suMisura ? tagliaBase : undefined,
        coloreDesiderato: coloreDesiderato.trim() || undefined,
        lunghezza: lunghezza.trim() || undefined,
        modifiche: modifiche.trim() || undefined,
        note: note.trim() || undefined,
        misure: suMisura && Object.keys(misurePrese).length > 0 ? misurePrese : undefined,
        dataDesiderata: dataDesiderata || undefined,
        immagini: immagini.length ? immagini : undefined,
      })
      onInviata(esito.numero)
    } catch (e) {
      if (sessioneNonValida(e)) {
        onSessioneScaduta()
        return
      }
      setErrore(e instanceof Error ? e.message : 'Invio non riuscito, riprova.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="animate-rise rounded-heemia-lg border border-heemia-border bg-white p-6 shadow-heemia-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-lg text-heemia-black">
            {suMisura ? `${product.nome} su misura` : `Informazioni su ${product.nome}`}
          </p>
          <p className="text-xs text-heemia-grey">
            {suMisura
              ? `${product.categoria ?? 'Capo'} · prezzo base ${formatCurrency(product.prezzoShowroom)}. Il prezzo finale te lo confermiamo con il preventivo, in base alle personalizzazioni.`
              : 'Scrivici cosa vuoi sapere: ti rispondiamo via email.'}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-heemia-grey hover:text-heemia-black">Chiudi</button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {suMisura && (
          <>
            <label className="block">
              <span className={etichetta}>Taglia di partenza</span>
              <select className={inputClass} value={tagliaBase} onChange={(e) => setTagliaBase(e.target.value)}>
                <option value="">Scegli la taglia…</option>
                {taglie.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={etichetta}>Colore desiderato</span>
              <input
                className={inputClass}
                list="colori-capo"
                value={coloreDesiderato}
                onChange={(e) => setColoreDesiderato(e.target.value)}
                placeholder={product.coloriDisponibili[0] ?? 'Es. nero'}
              />
              <datalist id="colori-capo">
                {product.coloriDisponibili.map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>
            <label className="block">
              <span className={etichetta}>Lunghezza</span>
              <input
                className={inputClass}
                value={lunghezza}
                onChange={(e) => setLunghezza(e.target.value)}
                placeholder="Es. al ginocchio, −5 cm"
              />
            </label>
            <label className="block">
              <span className={etichetta}>Data desiderata</span>
              <input type="date" className={inputClass} value={dataDesiderata} onChange={(e) => setDataDesiderata(e.target.value)} />
            </label>

            <div className="sm:col-span-2">
              <p className={etichetta}>Misure personali (cm)</p>
              <p className="mb-2 text-xs text-heemia-grey">Se non le conosci, le prendiamo insieme in showroom alla prova.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {misureDef.map((m) => (
                  <label key={m.id} className="block">
                    <span className="mb-0.5 block text-[11px] text-heemia-grey">{m.label}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      inputMode="decimal"
                      value={misure[m.id] ?? ''}
                      onChange={(e) => setMisure((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      className={inputClass}
                      placeholder="cm"
                    />
                  </label>
                ))}
              </div>
            </div>

            <label className="block sm:col-span-2">
              <span className={etichetta}>Modifiche richieste</span>
              <textarea
                rows={3}
                className={inputClass}
                value={modifiche}
                onChange={(e) => setModifiche(e.target.value)}
                placeholder="Es. maniche più corte, fodera in contrasto, scollo diverso…"
              />
            </label>
          </>
        )}

        <label className="block sm:col-span-2">
          <span className={etichetta}>{suMisura ? 'Note' : 'La tua domanda'}</span>
          <textarea
            rows={suMisura ? 2 : 4}
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={suMisura ? 'Qualsiasi altra indicazione utile…' : 'Es. è disponibile in altri colori? quanto tempo serve?'}
          />
        </label>

        <div className="sm:col-span-2">
          <p className={etichetta}>Immagini di riferimento (facoltative)</p>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => { void caricaImmagini(e.target.files); e.target.value = '' }}
            className="text-xs text-heemia-grey file:mr-3 file:rounded-heemia-sm file:border file:border-heemia-border file:bg-white file:px-3 file:py-1.5 file:text-xs file:text-heemia-black"
          />
          {immagini.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {immagini.map((img, i) => (
                <div key={`${img.nome}-${i}`} className="relative">
                  <img src={img.dataUrl} alt={img.nome} className="h-20 w-20 rounded-heemia-sm border border-heemia-border object-cover" />
                  <button
                    type="button"
                    onClick={() => setImmagini((prev) => prev.filter((_, k) => k !== i))}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-heemia-black px-1.5 text-[10px] text-white"
                    aria-label={`Togli ${img.nome}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {errore && (
        <p role="alert" className="mt-4 animate-rise rounded-heemia border-l-2 border-heemia-carmine bg-heemia-carmine-light px-3 py-2 text-xs text-heemia-black">
          {errore}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-heemia-grey">Ti ricontattiamo all'indirizzo {email} per conferma e prova.</p>
        <Button onClick={() => void invia()} disabled={inCorso}>
          {inCorso ? 'Invio in corso…' : suMisura ? 'Invia richiesta di personalizzazione' : 'Invia richiesta'}
        </Button>
      </div>
    </div>
  )
}
