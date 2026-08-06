import { useEffect, useMemo, useState } from 'react'
import { Heart } from 'lucide-react'
import { ProductImage } from '../../components/products/ProductImage'
import { formatCurrency } from '../../lib/format'
import { AccessoCliente } from './AccessoCliente'
import { SchedaProdottoCliente } from './SchedaProdottoCliente'
import { RichiestaForm } from './RichiestaForm'
import {
  aggiungiPreferito, caricaCatalogo, etichetteDisponibilita, leggiVisita, salvaVisita,
  sessioneNonValida, togliPreferito, tracciaVista, type CatalogItem, type VisitaCliente,
} from './showroomClient'

// FR-29 / spec 2026-08-06 — vista cliente. Sub-app separata: login proprio, nessun accesso
// al gestionale. Fuori da AppLayout/RoleGuard/NAV_GROUPS di proposito.
//
// Il catalogo è l'unica anagrafica prodotti, filtrata dai due attributi commerciali:
// «Presenti in showroom» = visibileShowroom, «Personalizzabili su misura» =
// personalizzabileSuMisura, «Tutti i modelli» = la loro unione senza duplicati (spec §5).
// Cambiando un flag in anagrafica il catalogo cambia da sé: non c'è nulla da ricaricare.

type Sezione = 'presenti' | 'su_misura' | 'tutti'

const SEZIONI: { id: Sezione; label: string }[] = [
  { id: 'presenti', label: 'Presenti in showroom' },
  { id: 'su_misura', label: 'Personalizzabili su misura' },
  { id: 'tutti', label: 'Tutti i modelli' },
]

const selectClass =
  'rounded-heemia border border-heemia-border bg-white px-2.5 py-1.5 text-xs text-heemia-black transition-all duration-200 ease-heemia focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10'

/** Elenco ordinato e senza doppioni dei valori di un campo, per popolare un filtro. */
function valoriDistinti(items: CatalogItem[], estrai: (p: CatalogItem) => string[]): string[] {
  const set = new Set<string>()
  for (const p of items) for (const v of estrai(p)) if (v.trim()) set.add(v.trim())
  return [...set].sort((a, b) => a.localeCompare(b, 'it'))
}

function CardCapo({ product, preferito, onApri }: { product: CatalogItem; preferito: boolean; onApri: () => void }) {
  const badge = etichetteDisponibilita(product)
  return (
    <button
      type="button"
      onClick={onApri}
      className="surface-interactive flex flex-col rounded-heemia-lg border border-heemia-border bg-white p-4 text-left shadow-heemia-sm"
    >
      <div className="relative mb-3">
        <ProductImage url={product.immaginiUrl[0]} nome={product.nome} className="h-44 w-full rounded-heemia" />
        {preferito && (
          <span className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow-heemia-xs">
            <Heart className="h-3.5 w-3.5 fill-heemia-carmine text-heemia-carmine" />
          </span>
        )}
      </div>
      <p className="font-display text-heemia-black">{product.nome}</p>
      <p className="mb-2 text-xs text-heemia-grey">
        {[product.categoria, product.collezione].filter(Boolean).join(' · ') || '—'}
      </p>
      <p className="font-mono-heemia mb-2 text-heemia-black">
        {product.visibileShowroom ? formatCurrency(product.prezzoShowroom) : `da ${formatCurrency(product.prezzoShowroom)}`}
      </p>
      <div className="mt-auto flex flex-wrap gap-1.5">
        {badge.map((b) => (
          <span key={b} className="rounded-full border border-heemia-border px-2 py-0.5 text-[10px] text-heemia-grey">
            {b}
          </span>
        ))}
      </div>
    </button>
  )
}

export function ShowroomApp() {
  const [visita, setVisita] = useState<VisitaCliente | null>(() => leggiVisita())
  const [catalogo, setCatalogo] = useState<CatalogItem[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [erroreCatalogo, setErroreCatalogo] = useState<string | null>(null)
  const [sezione, setSezione] = useState<Sezione>('presenti')
  const [preferiti, setPreferiti] = useState<string[]>(() => leggiVisita()?.preferiti ?? [])
  const [apertoId, setApertoId] = useState<string | null>(null)
  const [richiesta, setRichiesta] = useState<{ productId: string; tipo: 'personalizzazione' | 'informazioni' } | null>(null)
  const [confermata, setConfermata] = useState<string | null>(null)

  // Filtri della specifica §5.
  const [categoria, setCategoria] = useState('')
  const [collezione, setCollezione] = useState('')
  const [colore, setColore] = useState('')
  const [taglia, setTaglia] = useState('')
  const [soloPreferiti, setSoloPreferiti] = useState(false)

  useEffect(() => {
    if (!visita) return
    setCaricamento(true)
    caricaCatalogo()
      .then((righe) => { setCatalogo(righe); setErroreCatalogo(null) })
      .catch((e) => setErroreCatalogo(e instanceof Error ? e.message : 'Catalogo non disponibile'))
      .finally(() => setCaricamento(false))
  }, [visita])

  const categorie = useMemo(() => valoriDistinti(catalogo, (p) => [p.categoria ?? '']), [catalogo])
  const collezioni = useMemo(() => valoriDistinti(catalogo, (p) => [p.collezione ?? '']), [catalogo])
  const colori = useMemo(() => valoriDistinti(catalogo, (p) => p.coloriDisponibili), [catalogo])
  const taglie = useMemo(() => valoriDistinti(catalogo, (p) => p.taglieDisponibili), [catalogo])

  const visibili = useMemo(() => {
    return catalogo.filter((p) => {
      // La sezione è essa stessa un filtro sui due attributi: "tutti" è l'unione, e siccome
      // parte da un solo elenco non può produrre doppioni.
      if (sezione === 'presenti' && !p.visibileShowroom) return false
      if (sezione === 'su_misura' && !p.personalizzabileSuMisura) return false
      if (categoria && (p.categoria ?? '') !== categoria) return false
      if (collezione && (p.collezione ?? '') !== collezione) return false
      if (colore && !p.coloriDisponibili.includes(colore)) return false
      if (taglia && !p.taglieDisponibili.includes(taglia)) return false
      if (soloPreferiti && !preferiti.includes(p.id)) return false
      return true
    })
  }, [catalogo, sezione, categoria, collezione, colore, taglia, soloPreferiti, preferiti])

  const prodottoAperto = catalogo.find((p) => p.id === apertoId) ?? null
  const prodottoRichiesta = catalogo.find((p) => p.id === richiesta?.productId) ?? null
  const filtriAttivi = Boolean(categoria || collezione || colore || taglia || soloPreferiti)

  if (!visita) {
    return (
      <AccessoCliente
        onEntrato={(v) => {
          salvaVisita(v)
          setVisita(v)
          setPreferiti(v.preferiti)
        }}
      />
    )
  }

  const apriScheda = (p: CatalogItem) => {
    setApertoId(p.id)
    setConfermata(null)
    tracciaVista(visita.visitId, p.id)
  }

  const togglePreferito = async (productId: string) => {
    const eraPreferito = preferiti.includes(productId)
    // Aggiornamento ottimistico: il cuore risponde subito; se il server rifiuta si torna indietro.
    setPreferiti((prev) => (eraPreferito ? prev.filter((id) => id !== productId) : [...prev, productId]))
    try {
      if (eraPreferito) await togliPreferito(visita.visitId, productId)
      else await aggiungiPreferito(visita.visitId, productId)
    } catch (e) {
      setPreferiti((prev) => (eraPreferito ? [...prev, productId] : prev.filter((id) => id !== productId)))
      if (sessioneNonValida(e)) esci()
    }
  }

  const esci = () => {
    salvaVisita(null)
    setVisita(null)
    setPreferiti([])
    setApertoId(null)
    setRichiesta(null)
    setConfermata(null)
  }

  return (
    <div className="min-h-screen bg-heemia-surface">
      <header className="flex items-start justify-between gap-4 border-b border-heemia-border bg-heemia-black px-4 py-5 text-white sm:px-8 sm:py-6">
        <div>
          <p className="wordmark text-base">Heemia Showroom</p>
          <p className="font-mono-heemia mt-1 text-[10px] uppercase tracking-[0.1em] text-white/50">
            {`Benvenuta/o, ${visita.nome}`}
          </p>
        </div>
        <button type="button" onClick={esci} className="text-[11px] text-white/60 underline underline-offset-2 hover:text-white">
          Esci
        </button>
      </header>

      <main className="px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-6 flex gap-5 overflow-x-auto border-b border-heemia-border">
          {SEZIONI.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setSezione(s.id); setConfermata(null) }}
              className={`-mb-px shrink-0 border-b-2 pb-2.5 text-sm transition-colors ${
                sezione === s.id ? 'border-heemia-carmine font-medium text-heemia-black' : 'border-transparent text-heemia-grey hover:text-heemia-black'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {confermata && (
          <div className="mb-6 animate-rise rounded-heemia-lg border border-heemia-border-strong bg-white p-4 text-sm text-heemia-black shadow-heemia-sm">
            Richiesta <span className="font-mono-heemia">{confermata}</span> inviata all'atelier. Ti ricontattiamo a breve
            all'indirizzo {visita.email}.
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <select className={selectClass} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Tutte le categorie</option>
            {categorie.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={selectClass} value={collezione} onChange={(e) => setCollezione(e.target.value)}>
            <option value="">Tutte le collezioni</option>
            {collezioni.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={selectClass} value={colore} onChange={(e) => setColore(e.target.value)}>
            <option value="">Tutti i colori</option>
            {colori.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={selectClass} value={taglia} onChange={(e) => setTaglia(e.target.value)}>
            <option value="">Tutte le taglie</option>
            {taglie.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setSoloPreferiti((v) => !v)}
            className={`flex items-center gap-1.5 rounded-heemia border px-2.5 py-1.5 text-xs transition-all duration-200 ease-heemia ${
              soloPreferiti ? 'border-heemia-carmine text-heemia-carmine' : 'border-heemia-border text-heemia-grey hover:text-heemia-black'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${soloPreferiti ? 'fill-heemia-carmine' : ''}`} />
            Preferiti{preferiti.length > 0 ? ` (${preferiti.length})` : ''}
          </button>
          {filtriAttivi && (
            <button
              type="button"
              onClick={() => { setCategoria(''); setCollezione(''); setColore(''); setTaglia(''); setSoloPreferiti(false) }}
              className="text-xs text-heemia-grey underline underline-offset-2 hover:text-heemia-black"
            >
              Togli i filtri
            </button>
          )}
        </div>

        {erroreCatalogo ? (
          <p role="alert" className="rounded-heemia border-l-2 border-heemia-carmine bg-heemia-carmine-light px-3 py-2 text-sm text-heemia-black">
            Catalogo non disponibile: {erroreCatalogo}
          </p>
        ) : caricamento ? (
          <p className="font-mono-heemia text-[11px] uppercase tracking-[0.18em] text-heemia-grey">Caricamento…</p>
        ) : visibili.length === 0 ? (
          <p className="text-sm text-heemia-grey">
            {filtriAttivi
              ? 'Nessun capo corrisponde ai filtri scelti.'
              : sezione === 'presenti'
                ? 'Al momento non ci sono capi esposti in showroom.'
                : sezione === 'su_misura'
                  ? 'Al momento non ci sono capi personalizzabili su misura.'
                  : 'Il catalogo è vuoto al momento.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {visibili.map((p) => (
              <CardCapo key={p.id} product={p} preferito={preferiti.includes(p.id)} onApri={() => apriScheda(p)} />
            ))}
          </div>
        )}
      </main>

      {prodottoAperto && !richiesta && (
        <SchedaProdottoCliente
          product={prodottoAperto}
          preferito={preferiti.includes(prodottoAperto.id)}
          onTogglePreferito={() => void togglePreferito(prodottoAperto.id)}
          onRichiesta={(tipo) => setRichiesta({ productId: prodottoAperto.id, tipo })}
          onClose={() => setApertoId(null)}
        />
      )}

      {richiesta && prodottoRichiesta && (
        <div className="scroll-smooth-y fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-heemia-black/50 px-4 py-8 backdrop-blur-[2px]">
          <div className="w-full max-w-2xl">
            <RichiestaForm
              product={prodottoRichiesta}
              visitId={visita.visitId}
              tipo={richiesta.tipo}
              email={visita.email}
              onSessioneScaduta={esci}
              onClose={() => setRichiesta(null)}
              onInviata={(numero) => { setRichiesta(null); setApertoId(null); setConfermata(numero) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
