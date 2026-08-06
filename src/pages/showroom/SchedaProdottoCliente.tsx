import { useState } from 'react'
import { Heart, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ProductImage } from '../../components/products/ProductImage'
import { formatCurrency } from '../../lib/format'
import { etichetteDisponibilita, fraseDisponibilita, type CatalogItem } from './showroomClient'

// Scheda prodotto della vista cliente (spec §6): mostra SOLO le informazioni commerciali
// autorizzate. Costi, margini, fornitori, note interne e giacenze non arrivano nemmeno dal
// server (whitelist in modules/showroom/service.ts), quindi qui non c'è niente da nascondere.

export function SchedaProdottoCliente({
  product,
  preferito,
  onTogglePreferito,
  onRichiesta,
  onClose,
}: {
  product: CatalogItem
  preferito: boolean
  onTogglePreferito: () => void
  onRichiesta: (tipo: 'personalizzazione' | 'informazioni') => void
  onClose: () => void
}) {
  const [immagineAttiva, setImmagineAttiva] = useState(0)
  const badge = etichetteDisponibilita(product)
  // Combinazioni taglia/colore effettivamente esistenti: al cliente servono per capire cosa
  // può provare, senza numeri di magazzino.
  const varianti = product.variants.slice(0, 40)

  return (
    <div className="scroll-smooth-y fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-heemia-black/50 px-4 py-8 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={product.nome}
        className="w-full max-w-3xl animate-pop rounded-heemia-xl border border-heemia-border bg-white shadow-heemia-lg"
      >
        <div className="flex items-start justify-between gap-4 border-b border-heemia-border px-6 py-4">
          <div>
            <h2 className="font-display text-xl text-heemia-black">{product.nome}</h2>
            <p className="mt-0.5 text-xs text-heemia-grey">
              {[product.categoria, product.collezione].filter(Boolean).join(' · ') || 'Collezione Heemia'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onTogglePreferito}
              aria-label={preferito ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}
              aria-pressed={preferito}
              className="rounded-full p-2 text-heemia-grey transition-all duration-200 ease-heemia hover:bg-heemia-surface hover:text-heemia-carmine"
            >
              <Heart className={`h-4 w-4 ${preferito ? 'fill-heemia-carmine text-heemia-carmine' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="rounded-full p-2 text-heemia-grey transition-all duration-200 ease-heemia hover:rotate-90 hover:bg-heemia-surface hover:text-heemia-black"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2">
          <div>
            <ProductImage
              url={product.immaginiUrl[immagineAttiva]}
              nome={product.nome}
              className="h-72 w-full rounded-heemia-lg"
            />
            {product.immaginiUrl.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {product.immaginiUrl.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => setImmagineAttiva(i)}
                    className={`shrink-0 rounded-heemia-sm border ${i === immagineAttiva ? 'border-heemia-black' : 'border-heemia-border'}`}
                    aria-label={`Immagine ${i + 1}`}
                  >
                    <ProductImage url={url} nome={product.nome} className="h-14 w-14 rounded-heemia-sm" larghezza={120} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              {badge.map((b) => (
                <span
                  key={b}
                  className="rounded-full border border-heemia-border-strong px-2.5 py-0.5 text-[11px] text-heemia-black"
                >
                  {b}
                </span>
              ))}
            </div>
            <p className="font-mono-heemia text-lg text-heemia-black">{formatCurrency(product.prezzoShowroom)}</p>
            <p className="mt-1 text-xs text-heemia-grey">{fraseDisponibilita(product)}</p>

            {(product.descrizioneBreve || product.descrizioneEcommerce) && (
              <p className="mt-4 text-sm leading-relaxed text-heemia-black">
                {product.descrizioneBreve || product.descrizioneEcommerce}
              </p>
            )}

            <dl className="mt-4 space-y-2 text-xs text-heemia-grey">
              {product.coloriDisponibili.length > 0 && (
                <div>
                  <dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em]">Colori</dt>
                  <dd className="text-heemia-black">{product.coloriDisponibili.join(', ')}</dd>
                </div>
              )}
              {product.taglieDisponibili.length > 0 && (
                <div>
                  <dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em]">Taglie</dt>
                  <dd className="text-heemia-black">{product.taglieDisponibili.join(', ')}</dd>
                </div>
              )}
              {varianti.length > 0 && (
                <div>
                  <dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em]">Varianti</dt>
                  <dd className="text-heemia-black">
                    {varianti.map((v) => `${v.taglia} ${v.colore}`).join(' · ')}
                  </dd>
                </div>
              )}
              {product.personalizzabileSuMisura && product.tempiRealizzazione && (
                <div>
                  <dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em]">Tempi di realizzazione</dt>
                  <dd className="text-heemia-black">{product.tempiRealizzazione}</dd>
                </div>
              )}
            </dl>

            <div className="mt-6 flex flex-col gap-2">
              {/* Il su misura compare solo se il capo è personalizzabile (spec §2): sugli
                  altri il cliente non deve nemmeno vedere l'offerta del servizio. */}
              {product.personalizzabileSuMisura && (
                <Button onClick={() => onRichiesta('personalizzazione')}>Richiedi personalizzazione</Button>
              )}
              <Button variant="secondary" onClick={() => onRichiesta('informazioni')}>
                Richiedi informazioni
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
