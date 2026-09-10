import { useMemo, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { useDataStore } from '../../context/DataStore'
import {
  TAGLIA_UNICA, etichettaTaglia, normalizzaTaglia, ordinaTaglie, stessaTaglia, taglieProposte,
} from '../../lib/taglie'

/**
 * Le taglie di un capo: caselle da toccare.
 *
 * Prima era una riga di testo — `"XS, S, M, L"` — con tutto quello che una riga di testo si
 * porta dietro: una virgola dimenticata fondeva due taglie in una («S M»), uno spazio di
 * troppo faceva di «M » e «M» due taglie diverse per il filtro del catalogo cliente, e per
 * sapere quali taglie l'azienda usa bisognava ricordarsele.
 *
 * **Da dove escono le caselle.** Dalla scala standard, dalla taglia unica, e dalle taglie
 * che i capi già in anagrafica usano davvero (`lib/taglie.ts`). L'ultimo pezzo è quello che
 * rende utile «aggiungi misura personalizzata»: una misura creata su un capo diventa una
 * casella per tutti gli altri, senza nessuna tabella nuova da tenere allineata.
 *
 * **Compatto anche con molte taglie.** Le caselle vanno a capo da sole e restano piccole
 * (32px di lato): trenta taglie occupano tre righe, non trenta.
 */
export function TaglieSelector({
  taglie,
  onChange,
  disabled = false,
}: {
  taglie: string[]
  onChange: (taglie: string[]) => void
  disabled?: boolean
}) {
  const { products } = useDataStore()
  const [nuova, setNuova] = useState('')
  const [aggiungiAperto, setAggiungiAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const proposte = useMemo(
    () => taglieProposte(products.flatMap((p) => p.taglieDisponibili), taglie),
    [products, taglie],
  )

  const selezionata = (t: string) => taglie.some((x) => stessaTaglia(x, t))

  function commuta(t: string) {
    if (disabled) return
    onChange(
      selezionata(t)
        ? taglie.filter((x) => !stessaTaglia(x, t))
        : ordinaTaglie([...taglie, normalizzaTaglia(t)]),
    )
  }

  function aggiungiPersonalizzata() {
    const pulita = normalizzaTaglia(nuova)
    if (!pulita) {
      setErrore('Scrivi la misura da aggiungere.')
      return
    }
    if (selezionata(pulita)) {
      setErrore(`«${pulita}» è già fra le taglie di questo capo.`)
      return
    }
    onChange(ordinaTaglie([...taglie, pulita]))
    setNuova('')
    setErrore(null)
    setAggiungiAperto(false)
  }

  return (
    <div>
      <span className="font-mono-heemia mb-1.5 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
        Taglie disponibili
      </span>

      <div className="flex flex-wrap gap-1.5">
        {proposte.map((t) => {
          const attiva = selezionata(t)
          const unica = stessaTaglia(t, TAGLIA_UNICA)
          return (
            <button
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => commuta(t)}
              aria-pressed={attiva}
              title={etichettaTaglia(t)}
              className={`font-mono-heemia flex h-8 items-center justify-center rounded-heemia-sm border text-[11px] uppercase tracking-[0.04em] transition-all duration-200 ease-heemia disabled:cursor-not-allowed disabled:opacity-50 ${
                unica ? 'px-2.5' : 'min-w-[2rem] px-1.5'
              } ${
                attiva
                  ? 'border-heemia-black bg-heemia-black text-white'
                  : 'border-heemia-border bg-white text-heemia-black hover:border-heemia-black hover:bg-heemia-surface-muted'
              }`}
            >
              {unica ? 'Taglia unica' : t}
            </button>
          )
        })}

        {/* «Aggiungi misura personalizzata» sta in fondo alla stessa fila: è una casella come
            le altre, perché aggiungere una misura è la stessa azione di sceglierne una. */}
        {!aggiungiAperto && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => { setAggiungiAperto(true); setErrore(null) }}
            className="flex h-8 items-center gap-1 rounded-heemia-sm border border-dashed border-heemia-border-strong px-2.5 text-[11px] text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-black hover:text-heemia-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Aggiungi misura personalizzata
          </button>
        )}
      </div>

      {aggiungiAperto && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <input
            autoFocus
            value={nuova}
            onChange={(e) => { setNuova(e.target.value); setErrore(null) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); aggiungiPersonalizzata() }
              if (e.key === 'Escape') { setAggiungiAperto(false); setNuova(''); setErrore(null) }
            }}
            placeholder="Es. 42, 3XL, Su misura Rossi"
            className="h-8 w-56 rounded-heemia-sm border border-heemia-border bg-white px-2.5 text-sm text-heemia-black transition-all duration-200 ease-heemia placeholder:text-heemia-grey-light focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10"
          />
          <button
            type="button"
            onClick={aggiungiPersonalizzata}
            aria-label="Salva la misura"
            className="flex h-8 items-center gap-1 rounded-heemia-sm border border-heemia-black bg-heemia-black px-2.5 text-[11px] text-white transition-all duration-200 ease-heemia hover:opacity-90"
          >
            <Check className="h-3 w-3" /> Salva
          </button>
          <button
            type="button"
            onClick={() => { setAggiungiAperto(false); setNuova(''); setErrore(null) }}
            aria-label="Annulla"
            className="flex h-8 items-center rounded-heemia-sm border border-heemia-border px-2 text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-black hover:text-heemia-black"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {errore ? (
        <span role="alert" className="mt-1.5 block animate-fade-in text-[11px] text-heemia-carmine">{errore}</span>
      ) : (
        <span className="mt-1.5 block text-[11px] text-heemia-grey-light">
          {taglie.length === 0
            ? 'Nessuna taglia scelta. Tocca le caselle per aggiungerle.'
            : `${taglie.length} ${taglie.length === 1 ? 'taglia scelta' : 'taglie scelte'}: ${ordinaTaglie(taglie).map(etichettaTaglia).join(', ')}`}
        </span>
      )}
    </div>
  )
}
