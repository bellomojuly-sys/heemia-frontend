import { useMemo, useState } from 'react'
import { ArrowLeftRight, ArrowRight, ChevronDown, ChevronRight, History } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState, LoadingState } from '../ui/States'
import { QuantitaInput } from '../ui/QuantitaInput'
import { StatusBadge } from '../../lib/statusBadge'
import type { NodoColore, NodoProdotto, NodoTaglia, Totali } from '../../lib/inventarioAlbero'
import type { InventoryRecord } from '../../types'

/**
 * Inventario dei prodotti finiti in forma gerarchica: **Prodotto → colore → taglia →
 * quantità per ubicazione**.
 *
 * Sostituisce come vista predefinita la tabella piatta di 828 righe per tredici colonne,
 * che resta disponibile e invariata: quella serve quando si lavora su una variante
 * precisa, questa quando si vuole sapere quanto c'è di un capo. I dati sono gli stessi —
 * ogni foglia è un `InventoryRecord` intero — e le quantità restano modificabili qui come
 * lì, «Soglia lab.» compresa.
 *
 * Le somme dei livelli superiori sono calcolate (`lib/inventarioAlbero.ts`), non salvate:
 * modificare una taglia aggiorna il colore e il capo senza che nessuno debba ricordarsi
 * di farlo.
 */
export function InventoryTree({
  albero,
  caricamento,
  modificabile,
  onQuantita,
  onDistribuzione,
  onTrasferimento,
  onStorico,
  onDettaglioLab,
  onConfermaDistribuzione,
}: {
  albero: NodoProdotto[]
  caricamento: boolean
  modificabile: boolean
  onQuantita: (r: InventoryRecord, patch: { qtaMagazzino?: number; qtaRiservata?: number; sogliaMinimaLaboratorio?: number }) => void
  onDistribuzione: (r: InventoryRecord, ubicazione: 'magazzino' | 'laboratorio', quantita: number) => void
  onTrasferimento: (r: InventoryRecord, direzione: 'to_lab' | 'to_warehouse') => void
  onStorico: (r: InventoryRecord) => void
  onDettaglioLab: (r: InventoryRecord) => void
  onConfermaDistribuzione: (r: InventoryRecord) => void
}) {
  // I capi nascono chiusi: aprirne novantatré insieme sarebbe di nuovo la tabella piatta.
  // Se però ne resta uno solo dopo un filtro o una ricerca, tenerlo chiuso costringerebbe
  // a un clic per vedere l'unica cosa cercata.
  const apriTutto = albero.length === 1
  const [aperti, setAperti] = useState<Set<string>>(new Set())
  const chiave = (id: string) => aperti.has(id) || apriTutto

  const alterna = (id: string) =>
    setAperti((s) => {
      const nuovo = new Set(s)
      if (nuovo.has(id)) nuovo.delete(id)
      else nuovo.add(id)
      return nuovo
    })

  if (caricamento) return <LoadingState rows={6} />
  if (albero.length === 0) {
    return (
      <EmptyState
        title="Nessuna variante"
        description="Nessuna variante corrisponde al filtro o alla ricerca. Prova a scegliere «Tutto lo stock»."
      />
    )
  }

  return (
    <div className="space-y-2">
      {albero.map((nodo) => (
        <RigaProdotto
          key={nodo.prodotto.id}
          nodo={nodo}
          aperto={chiave(nodo.prodotto.id)}
          onAlterna={() => alterna(nodo.prodotto.id)}
          coloreAperto={chiave}
          onAlternaColore={alterna}
          modificabile={modificabile}
          onQuantita={onQuantita}
          onDistribuzione={onDistribuzione}
          onTrasferimento={onTrasferimento}
          onStorico={onStorico}
          onDettaglioLab={onDettaglioLab}
          onConfermaDistribuzione={onConfermaDistribuzione}
        />
      ))}
    </div>
  )
}

/** Le tre quantità che rispondono a «dove sono i pezzi». Sempre nello stesso ordine. */
function Ubicazioni({ totali, compatto = false }: { totali: Totali; compatto?: boolean }) {
  const cella = compatto ? 'w-16' : 'w-20'
  return (
    <span className="hidden shrink-0 items-center gap-1 sm:flex">
      <Cifra className={cella} etichetta="Magazzino" valore={totali.magazzino} />
      <Cifra className={cella} etichetta="Laboratorio" valore={totali.laboratorio} />
      <Cifra className={cella} etichetta="Lavorazione" valore={totali.inLavorazione} tenue />
      <Cifra className={cella} etichetta="Disponibile" valore={totali.disponibile} forte />
    </span>
  )
}

function Cifra({
  etichetta,
  valore,
  className = '',
  forte = false,
  tenue = false,
}: {
  etichetta: string
  valore: number
  className?: string
  forte?: boolean
  tenue?: boolean
}) {
  return (
    <span className={`flex flex-col items-end ${className}`} title={etichetta}>
      <span className="font-mono-heemia text-[9px] uppercase tracking-[0.05em] text-heemia-grey-light">{etichetta}</span>
      <span
        className={`font-mono-heemia text-sm tabular-nums ${
          forte ? 'font-medium text-heemia-black' : tenue && valore === 0 ? 'text-heemia-grey-light' : 'text-heemia-grey'
        }`}
      >
        {valore}
      </span>
    </span>
  )
}

/** Le segnalazioni del capo: si vedono senza aprirlo, che è il motivo per cui l'albero serve. */
function Segnali({ totali }: { totali: Totali }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {totali.daVerificare > 0 && <Badge variant="critical">{totali.daVerificare} sotto soglia</Badge>}
      {totali.daReintegrare > 0 && <Badge variant="warning-outline">{totali.daReintegrare} da reintegrare</Badge>}
      {totali.daDistribuire > 0 && <Badge variant="warning-outline">{totali.daDistribuire} da distribuire</Badge>}
    </span>
  )
}

function RigaProdotto({
  nodo,
  aperto,
  onAlterna,
  coloreAperto,
  onAlternaColore,
  modificabile,
  onQuantita,
  onDistribuzione,
  onTrasferimento,
  onStorico,
  onDettaglioLab,
  onConfermaDistribuzione,
}: {
  nodo: NodoProdotto
  aperto: boolean
  onAlterna: () => void
  coloreAperto: (id: string) => boolean
  onAlternaColore: (id: string) => void
  modificabile: boolean
  onQuantita: (r: InventoryRecord, patch: { qtaMagazzino?: number; qtaRiservata?: number; sogliaMinimaLaboratorio?: number }) => void
  onDistribuzione: (r: InventoryRecord, ubicazione: 'magazzino' | 'laboratorio', quantita: number) => void
  onTrasferimento: (r: InventoryRecord, direzione: 'to_lab' | 'to_warehouse') => void
  onStorico: (r: InventoryRecord) => void
  onDettaglioLab: (r: InventoryRecord) => void
  onConfermaDistribuzione: (r: InventoryRecord) => void
}) {
  return (
    <section className="overflow-hidden rounded-heemia-lg border border-heemia-border bg-white shadow-heemia-sm">
      <button
        type="button"
        onClick={onAlterna}
        aria-expanded={aperto}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-200 ease-heemia hover:bg-heemia-surface"
      >
        {aperto ? (
          <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-heemia-grey" />
        ) : (
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-heemia-grey" />
        )}
        <span className="min-w-0 flex-1">
          <span className="font-display block font-medium text-heemia-black">{nodo.prodotto.nome}</span>
          <span className="font-mono-heemia block text-[11px] text-heemia-grey">
            {nodo.prodotto.codiceProdotto} · {nodo.colori.length} {nodo.colori.length === 1 ? 'colore' : 'colori'} ·{' '}
            {nodo.varianti} {nodo.varianti === 1 ? 'variante' : 'varianti'}
          </span>
        </span>
        <Segnali totali={nodo.totali} />
        <Ubicazioni totali={nodo.totali} />
      </button>

      {aperto && (
        <div className="border-t border-heemia-border bg-heemia-surface">
          {nodo.colori.map((colore) => (
            <RigaColore
              key={colore.colore}
              idNodo={`${nodo.prodotto.id}::${colore.colore}`}
              colore={colore}
              aperto={coloreAperto(`${nodo.prodotto.id}::${colore.colore}`)}
              onAlterna={() => onAlternaColore(`${nodo.prodotto.id}::${colore.colore}`)}
              modificabile={modificabile}
              onQuantita={onQuantita}
              onDistribuzione={onDistribuzione}
              onTrasferimento={onTrasferimento}
              onStorico={onStorico}
              onDettaglioLab={onDettaglioLab}
              onConfermaDistribuzione={onConfermaDistribuzione}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function RigaColore({
  idNodo,
  colore,
  aperto,
  onAlterna,
  modificabile,
  onQuantita,
  onDistribuzione,
  onTrasferimento,
  onStorico,
  onDettaglioLab,
  onConfermaDistribuzione,
}: {
  idNodo: string
  colore: NodoColore
  aperto: boolean
  onAlterna: () => void
  modificabile: boolean
  onQuantita: (r: InventoryRecord, patch: { qtaMagazzino?: number; qtaRiservata?: number; sogliaMinimaLaboratorio?: number }) => void
  onDistribuzione: (r: InventoryRecord, ubicazione: 'magazzino' | 'laboratorio', quantita: number) => void
  onTrasferimento: (r: InventoryRecord, direzione: 'to_lab' | 'to_warehouse') => void
  onStorico: (r: InventoryRecord) => void
  onDettaglioLab: (r: InventoryRecord) => void
  onConfermaDistribuzione: (r: InventoryRecord) => void
}) {
  const taglie = useMemo(() => colore.taglie.map((t) => t.taglia).join(' · '), [colore.taglie])

  return (
    <div className="border-b border-heemia-border last:border-0" id={idNodo}>
      <button
        type="button"
        onClick={onAlterna}
        aria-expanded={aperto}
        className="flex w-full items-center gap-2.5 py-2 pl-8 pr-3 text-left transition-colors duration-200 ease-heemia hover:bg-heemia-surface-muted"
      >
        {aperto ? (
          <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-heemia-grey-light" />
        ) : (
          <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-heemia-grey-light" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-heemia-black">{colore.colore}</span>
          <span className="font-mono-heemia block text-[10px] text-heemia-grey">{taglie}</span>
        </span>
        <Segnali totali={colore.totali} />
        <Ubicazioni totali={colore.totali} compatto />
      </button>

      {aperto && (
        <ul className="bg-white">
          {colore.taglie.map((t) => (
            <RigaTaglia
              key={t.record.id}
              nodo={t}
              modificabile={modificabile}
              onQuantita={onQuantita}
              onDistribuzione={onDistribuzione}
              onTrasferimento={onTrasferimento}
              onStorico={onStorico}
              onDettaglioLab={onDettaglioLab}
              onConfermaDistribuzione={onConfermaDistribuzione}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

const inputQta =
  'font-mono-heemia w-16 rounded-heemia border border-heemia-border bg-white px-1.5 py-0.5 text-right text-sm text-heemia-black transition-all duration-200 ease-heemia focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10'

/**
 * La foglia: una taglia, con le sue quantità modificabili.
 *
 * Le stesse regole della tabella piatta, perché è lo stesso dato:
 *   - «Disponibile» non si scrive, è magazzino + laboratorio;
 *   - finché la distribuzione iniziale non è confermata (FR-49) il numero digitato non si
 *     salva subito, ma apre la domanda su cosa significhi;
 *   - «Soglia lab.» resta modificabile: è la soglia sotto cui scatta il reintegro.
 */
function RigaTaglia({
  nodo,
  modificabile,
  onQuantita,
  onDistribuzione,
  onTrasferimento,
  onStorico,
  onDettaglioLab,
  onConfermaDistribuzione,
}: {
  nodo: NodoTaglia
  modificabile: boolean
  onQuantita: (r: InventoryRecord, patch: { qtaMagazzino?: number; qtaRiservata?: number; sogliaMinimaLaboratorio?: number }) => void
  onDistribuzione: (r: InventoryRecord, ubicazione: 'magazzino' | 'laboratorio', quantita: number) => void
  onTrasferimento: (r: InventoryRecord, direzione: 'to_lab' | 'to_warehouse') => void
  onStorico: (r: InventoryRecord) => void
  onDettaglioLab: (r: InventoryRecord) => void
  onConfermaDistribuzione: (r: InventoryRecord) => void
}) {
  const r = nodo.record
  const distribuito = r.migrazioneCompletata

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-heemia-border/60 py-2 pl-14 pr-3 last:border-0">
      <span className="flex w-28 shrink-0 flex-col">
        <span className="font-mono-heemia text-sm font-medium text-heemia-black">{nodo.taglia}</span>
        <span className="font-mono-heemia text-[10px] text-heemia-grey">{nodo.variante.sku}</span>
      </span>

      <Campo etichetta="Magazzino">
        {modificabile ? (
          <QuantitaInput
            valore={r.qtaMagazzino}
            etichetta={`Magazzino ${nodo.variante.sku}`}
            className={inputQta}
            onConferma={(q) =>
              distribuito ? onQuantita(r, { qtaMagazzino: q }) : onDistribuzione(r, 'magazzino', q)
            }
          />
        ) : (
          <Statico valore={r.qtaMagazzino} />
        )}
      </Campo>

      <Campo etichetta="Laboratorio">
        <span className="flex items-center gap-1">
          {modificabile && !distribuito ? (
            <QuantitaInput
              valore={r.qtaLaboratorio}
              etichetta={`Laboratorio ${nodo.variante.sku}`}
              className={inputQta}
              onConferma={(q) => onDistribuzione(r, 'laboratorio', q)}
            />
          ) : (
            <button
              type="button"
              onClick={() => onDettaglioLab(r)}
              title="Apri il dettaglio del laboratorio: reintegri, consumi e capi in lavorazione"
              className="font-mono-heemia rounded-heemia-sm border border-heemia-border px-2 py-0.5 text-sm text-heemia-black transition-all duration-200 ease-heemia hover:border-heemia-black hover:shadow-heemia-xs"
            >
              {r.qtaLaboratorio}
            </button>
          )}
          {r.laboratorioSottoSoglia && <Badge variant="warning-outline">Reintegro</Badge>}
        </span>
      </Campo>

      <Campo etichetta="Soglia lab.">
        {modificabile ? (
          <QuantitaInput
            valore={r.sogliaMinimaLaboratorio}
            etichetta={`Soglia laboratorio ${nodo.variante.sku}`}
            className={inputQta}
            onConferma={(q) => onQuantita(r, { sogliaMinimaLaboratorio: q })}
          />
        ) : (
          <Statico valore={r.sogliaMinimaLaboratorio} />
        )}
      </Campo>

      <Campo etichetta="Riservato">
        {modificabile ? (
          <QuantitaInput
            valore={r.qtaRiservata}
            etichetta={`Riservato ${nodo.variante.sku}`}
            className={inputQta}
            onConferma={(q) => onQuantita(r, { qtaRiservata: q })}
          />
        ) : (
          <Statico valore={r.qtaRiservata} />
        )}
      </Campo>

      <Campo etichetta="Lavorazione">
        <Statico valore={r.qtaInProduzione} tenue />
      </Campo>

      <Campo etichetta="Venduto">
        <Statico valore={r.qtaVenduta} tenue />
      </Campo>

      <span className="flex items-center gap-1.5">
        <StatusBadge status={r.stato} />
        {r.divergenzaShopify && (
          <Badge variant="critical">Shopify {r.stockShopify} ≠ {r.disponibileTotale}</Badge>
        )}
      </span>

      <span className="ml-auto flex items-center gap-1">
        {modificabile && distribuito && (
          <>
            <IconButton titolo="Invia al laboratorio" disabled={r.qtaMagazzino <= 0} onClick={() => onTrasferimento(r, 'to_lab')}>
              <ArrowRight className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton titolo="Riporta in magazzino" disabled={r.qtaLaboratorio <= 0} onClick={() => onTrasferimento(r, 'to_warehouse')}>
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </IconButton>
          </>
        )}
        <IconButton titolo="Storico movimenti" onClick={() => onStorico(r)}>
          <History className="h-3.5 w-3.5" />
        </IconButton>
      </span>

      {/* Distribuzione iniziale (FR-49): finché non è confermata la variante non ha una
          gestione ordinaria delle scorte, e dirlo qui evita di far sembrare un errore i
          numeri provvisori. */}
      {!distribuito && (
        <div className="w-full rounded-heemia-sm border border-heemia-border bg-heemia-surface px-2.5 py-1.5">
          <p className="font-mono-heemia text-[11px] text-heemia-grey">
            Distribuzione iniziale: {r.totaleDistribuito} distribuiti su {r.totaleDichiarato} registrati
            {r.differenzaMigrazione !== 0 && (
              <span className="text-heemia-carmine">
                {' '}
                ·{' '}
                {r.differenzaMigrazione > 0
                  ? `${r.differenzaMigrazione} in più del totale`
                  : `mancano ${Math.abs(r.differenzaMigrazione)}`}
              </span>
            )}
          </p>
          {modificabile && (
            <Button
              variant="secondary"
              className="mt-1"
              disabled={!r.migrazioneConfermabile}
              title={
                r.migrazioneConfermabile
                  ? 'Chiudi la distribuzione iniziale di questa variante'
                  : 'La somma delle ubicazioni deve coincidere con il totale registrato'
              }
              onClick={() => onConfermaDistribuzione(r)}
            >
              Conferma distribuzione
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

function Campo({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-mono-heemia text-[9px] uppercase tracking-[0.05em] text-heemia-grey-light">{etichetta}</span>
      {children}
    </span>
  )
}

function Statico({ valore, tenue = false }: { valore: number; tenue?: boolean }) {
  return (
    <span className={`font-mono-heemia w-16 pr-1.5 text-right text-sm tabular-nums ${tenue && valore === 0 ? 'text-heemia-grey-light' : 'text-heemia-black'}`}>
      {valore}
    </span>
  )
}

function IconButton({
  titolo,
  onClick,
  disabled = false,
  children,
}: {
  titolo: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={titolo}
      aria-label={titolo}
      onClick={onClick}
      disabled={disabled}
      className="rounded-heemia-sm border border-heemia-border p-1.5 text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-black hover:text-heemia-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-heemia-border disabled:hover:text-heemia-grey"
    >
      {children}
    </button>
  )
}
