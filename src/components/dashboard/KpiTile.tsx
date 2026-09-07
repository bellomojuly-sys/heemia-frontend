import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { InfoTooltip } from '../ui/InfoTooltip'
import { AREE, STILE_CRITICO, type Area } from '../../lib/aree'

// Card KPI singola e autonoma: ogni tile porta il proprio bordo/sfondo, così le card
// restano visivamente separate quando vanno a capo su più righe.
//
// 2026-09-07 — la card dice a colpo d'occhio **di cosa parla**.
//
// Prima erano sette rettangoli bianchi identici, distinguibili solo leggendo l'etichetta
// in grigio chiaro a 10px: per trovare «In magazzino» bisognava scorrerle tutte. Ora ogni
// card porta il colore della sua area (`src/lib/aree.ts`) su tre segni coordinati — una
// barra verticale a sinistra, l'icona, il numero — e le stesse aree sono quelle della
// barra laterale, quindi il colore si impara una volta sola e vale ovunque.
//
// Il colore **non è decorazione**: se lo si togliesse, l'informazione «questa card
// riguarda il magazzino» andrebbe persa e resterebbe solo il testo. Per chi non distingue
// i colori, però, l'etichetta resta la fonte primaria — il colore raggruppa, non sostituisce.
//
// Il critico (carminio) vince sempre sull'area: «qui c'è un problema» è una domanda
// diversa da «di cosa parla», ed è quella per cui si apre la dashboard.
//
// Leggibilità: l'etichetta è passata da 10px a 11px con contrasto pieno
// (`text-heemia-grey` invece di grigio chiaro), il numero da 1.75rem a 2rem con cifre
// tabulari, e il tooltip resta accanto all'etichetta.
export type KpiTone = 'positive' | 'informational' | 'neutral'

// `to`: backlog "Note" §7 — ogni KPI della dashboard deve aprire la pagina già filtrata.
// La tile diventa un Link solo quando la destinazione c'è, così le tile informative
// restano non cliccabili e senza affordance ingannevole.
export function KpiTile({
  label,
  value,
  tooltip,
  critical = false,
  weight = 'primary',
  area,
  icon,
  to,
  dettaglio,
}: {
  label: string
  value: string | number
  tooltip?: string
  critical?: boolean
  weight?: 'primary' | 'secondary'
  /** Area dell'app a cui la card appartiene: decide il colore. */
  area?: Area
  icon?: ReactNode
  to?: string
  /** Riga sotto il numero: l'unità o il contesto che rende leggibile la cifra. */
  dettaglio?: string
}) {
  const isPrimary = weight === 'primary'
  const stile = critical ? STILE_CRITICO : area ? AREE[area] : null

  const valueColor = stile ? stile.valore : isPrimary ? 'text-heemia-black' : 'text-heemia-grey'
  const valueSize = isPrimary ? 'text-[2rem]' : 'text-[1.375rem]'

  const contenuto = (
    <>
      {/* La barra è il segno che si vede prima di leggere: raggruppa le card per area
          anche con la coda dell'occhio. */}
      {stile && <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] rounded-l-heemia-lg ${stile.barra}`} />}

      {icon && (
        <span
          aria-hidden
          className={`absolute right-4 top-3 transition-colors duration-200 ease-heemia [&>svg]:h-4 [&>svg]:w-4 ${
            stile ? stile.icona : 'text-heemia-grey-light group-hover:text-heemia-grey'
          }`}
        >
          {icon}
        </span>
      )}

      <div className="flex items-center gap-1.5 pr-6">
        {critical && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-heemia-carmine" />}
        <p className="font-sans text-[11px] font-medium uppercase tracking-[0.07em] text-heemia-grey">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>

      <p className={`font-sans mt-1.5 leading-none font-medium tabular-nums ${valueSize} ${valueColor}`}>
        {value}
      </p>

      {dettaglio && <p className="mt-1 text-[11px] leading-snug text-heemia-grey">{dettaglio}</p>}
    </>
  )

  // La tile cliccabile usa `.surface-interactive` (sollevamento + affondamento al click),
  // quella informativa `.surface-raised` (solo sollevamento): far "affondare" un riquadro
  // che poi non porta da nessuna parte è una promessa non mantenuta.
  const base = `group relative min-w-[10.5rem] flex-1 overflow-hidden rounded-heemia-lg border bg-white pl-[1.125rem] pr-4 py-3 shadow-heemia-sm ${
    stile ? stile.bordo : 'border-heemia-border'
  }`

  if (to) {
    return (
      <Link to={to} className={`${base} surface-interactive block`}>
        {contenuto}
      </Link>
    )
  }

  return <div className={`${base} surface-raised`}>{contenuto}</div>
}
