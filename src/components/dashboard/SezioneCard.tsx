import type { ReactNode } from 'react'
import { AREE, type Area } from '../../lib/aree'

/**
 * Card di sezione della dashboard, con il colore della sua area.
 *
 * Le sezioni erano cinque riquadri bianchi con il titolo in nero, distinguibili solo
 * leggendoli uno per uno. Qui l'intestazione prende il fondo tenue dell'area e una
 * sottile barra superiore del colore pieno: le sezioni si separano a colpo d'occhio e si
 * legano alle card KPI che parlano della stessa cosa — le vendite recenti hanno lo stesso
 * arancio dei numeri economici, i capi in lavorazione lo stesso blu dei capi.
 *
 * Il colore aggiunge un livello, non ne toglie: titolo e sottotitolo restano al pieno
 * contrasto sopra un fondo appena tinto, che è il motivo per cui i toni del sistema sono
 * desaturati.
 */
export function SezioneCard({
  area,
  titolo,
  sottotitolo,
  azione,
  className = '',
  children,
}: {
  area: Area
  titolo: string
  sottotitolo?: string
  azione?: ReactNode
  className?: string
  children: ReactNode
}) {
  const stile = AREE[area]
  return (
    <section
      className={`heemia-card overflow-hidden rounded-heemia-lg border bg-white shadow-heemia-sm ${stile.bordo} ${className}`}
    >
      <span aria-hidden className={`block h-[3px] w-full ${stile.barra}`} />
      <div
        className={`flex items-start justify-between gap-4 border-b border-heemia-border px-5 py-3.5 ${stile.fondo}`}
      >
        <div>
          <h2 className="font-display text-base font-medium text-heemia-black">{titolo}</h2>
          {sottotitolo && <p className="mt-0.5 text-xs text-heemia-grey">{sottotitolo}</p>}
        </div>
        {azione}
      </div>
      {children}
    </section>
  )
}
