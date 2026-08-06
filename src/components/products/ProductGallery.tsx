import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/States'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency } from '../../lib/format'
import { coverImageUrl } from '../../lib/driveImage'
import { ProductImage } from './ProductImage'
import type { Product } from '../../types'

/**
 * Catalogo interno: gli stessi capi della tabella, visti come immagini.
 *
 * Serve a una domanda diversa da quella della lista — «com'è fatto questo capo?» invece di
 * «quanto costa, in che fase è» — quindi ogni card mostra il minimo per riconoscerlo:
 * foto, nome, codice, fase e prezzo. Il resto si legge aprendo la scheda.
 */
export function ProductGallery({
  products,
  onOpen,
  caricamento = false,
}: {
  products: Product[]
  onOpen: (p: Product) => void
  caricamento?: boolean
}) {
  if (caricamento) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[3/4] rounded-heemia-lg bg-heemia-surface-muted" />
            <div className="mt-2 h-3 w-2/3 rounded bg-heemia-surface-muted" />
          </div>
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <EmptyState
        title="Nessun prodotto trovato"
        description="Nessun capo corrisponde ai filtri selezionati. Prova a modificare fase o linea."
      />
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((p) => {
        const copertina = coverImageUrl(p.immaginiUrl)
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p)}
            className="surface-interactive group overflow-hidden rounded-heemia-lg border border-heemia-border bg-white text-left"
          >
            {/* 3:4 come una foto di capo in piedi: il ritratto è il taglio naturale per l'abbigliamento. */}
            <ProductImage
              url={copertina ?? undefined}
              nome={p.nome}
              className="aspect-[3/4] w-full"
              larghezza={600}
            />
            <div className="p-3">
              <p className="font-display truncate text-sm text-heemia-black" title={p.nome}>
                {p.nome}
              </p>
              <p className="font-mono-heemia truncate text-[11px] text-heemia-grey">{p.codiceProdotto}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={p.stato} />
                {p.prezzoVendita > 0 ? (
                  <span className="font-mono-heemia text-[11px] text-heemia-black">
                    {formatCurrency(p.prezzoVendita)}
                  </span>
                ) : (
                  <Badge variant="critical">Nessun prezzo</Badge>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
