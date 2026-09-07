import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { EmptyState, LoadingState } from '../ui/States'
import { ProductImage } from './ProductImage'
import { coverImageUrl } from '../../lib/driveImage'
import { formatCurrency } from '../../lib/format'
import { stageLabel } from '../../lib/production'
import type { GruppoCatalogo } from '../../lib/catalogo'
import type { Product, ProductVariant } from '../../types'

/**
 * Il catalogo letto per gruppi invece che come elenco piatto.
 *
 * Due forme, che rispondono a due domande diverse:
 *
 *   - **per categoria / linea / fase** — i capi stanno sotto un'intestazione che dice
 *     quanti sono. Serve a scorrere un catalogo di 94 capi senza leggerli tutti.
 *   - **per prodotto** — ogni capo si apre sulle sue varianti taglia/colore. Serve perché
 *     le varianti sono 828: in un elenco piatto di prodotti non si vedono, e in un elenco
 *     piatto di varianti non si vede più il capo.
 *
 * I gruppi nascono chiusi quando sono molti e aperti quando sono pochi: aprire ottanta
 * capi tutti insieme sarebbe di nuovo l'elenco piatto da cui si stava scappando.
 */
export function CatalogoRaggruppato({
  gruppi,
  conVarianti,
  varianti,
  caricamento,
  onApri,
}: {
  gruppi: GruppoCatalogo[]
  /** true nella modalità «per prodotto»: sotto ogni capo si aprono le sue varianti. */
  conVarianti: boolean
  varianti: (productId: string) => ProductVariant[]
  caricamento: boolean
  onApri: (p: Product) => void
}) {
  if (caricamento) return <LoadingState rows={6} />

  const capiTotali = gruppi.reduce((s, g) => s + g.prodotti.length, 0)
  if (capiTotali === 0) {
    return (
      <EmptyState
        title="Nessun prodotto trovato"
        description="Nessun capo corrisponde ai filtri selezionati. Prova a modificare fase o linea."
      />
    )
  }

  if (conVarianti) {
    return (
      <div className="space-y-2">
        {gruppi[0].prodotti.map((p) => (
          <RigaProdotto key={p.id} prodotto={p} varianti={varianti(p.id)} apertoDiDefault={capiTotali <= 5} onApri={onApri} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {gruppi.map((g) => (
        <Gruppo key={g.chiave} gruppo={g} apertoDiDefault={gruppi.length <= 6} onApri={onApri} />
      ))}
    </div>
  )
}

function Gruppo({
  gruppo,
  apertoDiDefault,
  onApri,
}: {
  gruppo: GruppoCatalogo
  apertoDiDefault: boolean
  onApri: (p: Product) => void
}) {
  const [aperto, setAperto] = useState(apertoDiDefault)
  return (
    <section className="overflow-hidden rounded-heemia-lg border border-heemia-border bg-white shadow-heemia-sm">
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        aria-expanded={aperto}
        className="flex w-full items-center gap-2 border-b border-heemia-border bg-heemia-surface px-4 py-2.5 text-left transition-colors duration-200 ease-heemia hover:bg-heemia-surface-muted"
      >
        {aperto ? (
          <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-heemia-grey" />
        ) : (
          <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-heemia-grey" />
        )}
        <span className="font-display text-sm font-medium text-heemia-black">{gruppo.titolo}</span>
        <span className="font-mono-heemia text-[11px] text-heemia-grey">{gruppo.sottotitolo}</span>
      </button>
      {aperto && (
        <ul className="divide-y divide-heemia-border">
          {gruppo.prodotti.map((p) => (
            <li key={p.id}>
              <RigaCapo prodotto={p} onApri={onApri} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Un capo con le sue varianti sotto: è la modalità «per prodotto». */
function RigaProdotto({
  prodotto,
  varianti,
  apertoDiDefault,
  onApri,
}: {
  prodotto: Product
  varianti: ProductVariant[]
  apertoDiDefault: boolean
  onApri: (p: Product) => void
}) {
  const [aperto, setAperto] = useState(apertoDiDefault)
  const colori = new Set(varianti.map((v) => v.colore))

  return (
    <section className="overflow-hidden rounded-heemia-lg border border-heemia-border bg-white shadow-heemia-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setAperto((v) => !v)}
          aria-expanded={aperto}
          aria-label={aperto ? `Chiudi le varianti di ${prodotto.nome}` : `Mostra le varianti di ${prodotto.nome}`}
          disabled={varianti.length === 0}
          className="rounded-heemia-sm p-1 text-heemia-grey transition-colors hover:text-heemia-black disabled:opacity-30"
        >
          {aperto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <button type="button" onClick={() => onApri(prodotto)} className="flex flex-1 items-center gap-3 text-left">
          <ProductImage
            url={coverImageUrl(prodotto.immaginiUrl, 120) ?? undefined}
            nome={prodotto.nome}
            className="h-9 w-9 shrink-0 rounded-heemia"
            larghezza={120}
          />
          <span className="min-w-0 flex-1">
            <span className="font-display block font-medium text-heemia-black hover:underline">{prodotto.nome}</span>
            <span className="font-mono-heemia block text-[11px] text-heemia-grey">
              {prodotto.codiceProdotto}
              {prodotto.categoria ? ` · ${prodotto.categoria}` : ''}
            </span>
          </span>
        </button>

        <span className="hidden shrink-0 items-center gap-2 sm:flex">
          <Badge variant="info">{stageLabel(prodotto.stato)}</Badge>
          <span className="font-mono-heemia w-24 text-right text-sm text-heemia-black">
            {prodotto.prezzoVendita > 0 ? formatCurrency(prodotto.prezzoVendita) : '–'}
          </span>
          <span className="font-mono-heemia w-28 text-right text-[11px] text-heemia-grey">
            {varianti.length} {varianti.length === 1 ? 'variante' : 'varianti'}
            {colori.size > 0 && ` · ${colori.size} ${colori.size === 1 ? 'colore' : 'colori'}`}
          </span>
        </span>
      </div>

      {aperto && varianti.length > 0 && (
        <ul className="border-t border-heemia-border bg-heemia-surface px-3 py-2">
          {[...colori].map((colore) => (
            <li key={colore} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1">
              <span className="font-mono-heemia w-32 shrink-0 text-[11px] uppercase tracking-[0.06em] text-heemia-grey">
                {colore || 'senza colore'}
              </span>
              {varianti
                .filter((v) => v.colore === colore)
                .map((v) => (
                  <span
                    key={v.id}
                    title={v.sku}
                    className="font-mono-heemia rounded-heemia-xs border border-heemia-border-strong bg-white px-1.5 py-0.5 text-[11px] text-heemia-black"
                  >
                    {v.taglia}
                  </span>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Riga di un capo dentro un gruppo (categoria / linea / fase). */
function RigaCapo({ prodotto, onApri }: { prodotto: Product; onApri: (p: Product) => void }) {
  return (
    <button
      type="button"
      onClick={() => onApri(prodotto)}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-200 ease-heemia hover:bg-heemia-surface"
    >
      <ProductImage
        url={coverImageUrl(prodotto.immaginiUrl, 120) ?? undefined}
        nome={prodotto.nome}
        className="h-8 w-8 shrink-0 rounded-heemia"
        larghezza={120}
      />
      <span className="min-w-0 flex-1">
        <span className="font-display block text-sm font-medium text-heemia-black">{prodotto.nome}</span>
        <span className="font-mono-heemia block text-[11px] text-heemia-grey">{prodotto.codiceProdotto}</span>
      </span>
      <Badge variant="neutral">{prodotto.linea === 'tessile' ? 'Tessile' : 'Maglieria'}</Badge>
      <Badge variant="info">{stageLabel(prodotto.stato)}</Badge>
      <span className="font-mono-heemia w-24 text-right text-sm text-heemia-black">
        {prodotto.prezzoVendita > 0 ? formatCurrency(prodotto.prezzoVendita) : '–'}
      </span>
    </button>
  )
}
