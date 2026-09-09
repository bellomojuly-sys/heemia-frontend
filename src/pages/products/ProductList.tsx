import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Images, LayoutGrid, List as ListIcon, Trash2, X } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { AddProductForm } from '../../components/products/AddProductForm'
import { DeleteProductModal } from '../../components/products/DeleteProductModal'
import { ProductGallery } from '../../components/products/ProductGallery'
import { AbbinaFotoDrive } from '../../components/products/AbbinaFotoDrive'
import { ProductImage } from '../../components/products/ProductImage'
import { StatusBadge } from '../../lib/statusBadge'
import { coverImageUrl } from '../../lib/driveImage'
import { stageLabel } from '../../lib/production'
import { formatCurrency, formatPercent } from '../../lib/format'
import { PRODUCT_STAGES, type Product, type ProductStage } from '../../types'
import {
  ORDINAMENTI, RAGGRUPPAMENTI, ordinaProdotti, ordinaVarianti, raggruppaProdotti,
  type Ordinamento, type Raggruppamento,
} from '../../lib/catalogo'
import { CatalogoRaggruppato } from '../../components/products/CatalogoRaggruppato'
import { useRole } from '../../context/RoleContext'
import { canAccessModule, canDeleteProducts, canWrite } from '../../lib/permissions'
import { useDataStore } from '../../context/DataStore'
import { useLiveMargins } from '../../hooks/useLiveMargins'

// Backlog "Note" §7: i KPI della dashboard aprono questa pagina già filtrata. Il filtro
// arriva come `?vista=`, non come stato del componente, così il link è condivisibile e il
// tasto Indietro del browser lo toglie. Le definizioni ricalcano una a una quelle dei KPI
// lato server (server/src/modules/dashboard/service.ts): se cambia una, va cambiata l'altra.
const IN_SVILUPPO: ProductStage[] = ['concept', 'sviluppo_modello', 'scelta_tessuto', 'scelta_accessori', 'prototipo', 'campionario']

const VISTE: Record<string, { label: string; test: (p: Product) => boolean }> = {
  attivi: { label: 'Prodotti attivi', test: (p) => p.stato !== 'idea' && p.stato !== 'archivio' },
  sviluppo: { label: 'In sviluppo', test: (p) => IN_SVILUPPO.includes(p.stato) },
  produzione: { label: 'In produzione', test: (p) => p.stato === 'produzione' },
  shopify: { label: 'Online su Shopify', test: (p) => p.statoPubblicazioneShopify === 'pubblicato' },
}

export function ProductList() {
  const navigate = useNavigate()
  const { role } = useRole()
  const { products, productVariants, addProduct, ricarica, caricamento } = useDataStore()
  const liveMargins = useLiveMargins()
  const canSeeMargins = canAccessModule(role, 'costi-margini')
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [stato, setStato] = useState('')
  const [linea, setLinea] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [abbinaOpen, setAbbinaOpen] = useState(false)
  const [daEliminare, setDaEliminare] = useState<Product | null>(null)
  const puoEliminare = canDeleteProducts(role)

  // Ordinamento e raggruppamento stanno nell'indirizzo insieme ai filtri, come già la
  // vista galleria: un catalogo ordinato in un certo modo si passa a qualcuno con un link,
  // e il tasto Indietro del browser riporta alla vista di prima.
  const ordinamento = (searchParams.get('ordina') ?? 'alfabetico') as Ordinamento
  const raggruppamento = (searchParams.get('raggruppa') ?? 'nessuno') as Raggruppamento
  const cambiaParam = (chiave: string, valore: string, predefinito: string) => {
    const p = new URLSearchParams(searchParams)
    if (valore === predefinito) p.delete(chiave)
    else p.set(chiave, valore)
    setSearchParams(p, { replace: true })
  }

  const vista = VISTE[searchParams.get('vista') ?? '']
  // Catalogo interno (galleria) o elenco operativo (tabella). Sta nell'indirizzo insieme
  // ai filtri, così un catalogo filtrato si può passare a qualcuno con un link.
  const galleria = searchParams.get('modo') === 'galleria'
  const cambiaModo = (a: 'lista' | 'galleria') => {
    const p = new URLSearchParams(searchParams)
    if (a === 'galleria') p.set('modo', 'galleria')
    else p.delete('modo')
    setSearchParams(p, { replace: true })
  }

  const rows = useMemo(() => {
    const filtrati = products.filter((p) => {
      if (vista && !vista.test(p)) return false
      if (search && !`${p.nome} ${p.codiceProdotto}`.toLowerCase().includes(search.toLowerCase())) return false
      if (stato && p.stato !== stato) return false
      if (linea && p.linea !== linea) return false
      return true
    })
    return ordinaProdotti(filtrati, ordinamento, PRODUCT_STAGES.map((f) => f.id))
  }, [products, vista, search, stato, linea, ordinamento])

  const gruppi = useMemo(
    () => raggruppaProdotti(rows, raggruppamento, productVariants),
    [rows, raggruppamento, productVariants],
  )

  /** Le varianti di un capo, ordinate per colore e poi per taglia (vista «per prodotto»). */
  const variantiDi = useMemo(
    () => (productId: string) => ordinaVarianti(productVariants.filter((v) => v.productId === productId)),
    [productVariants],
  )

  const columns: DataTableColumn<Product>[] = [
    {
      header: 'Prodotto',
      accessor: (p) => (
        <div className="flex items-center gap-3">
          <ProductImage
            url={coverImageUrl(p.immaginiUrl, 120) ?? undefined}
            nome={p.nome}
            className="h-9 w-9 shrink-0 rounded-heemia"
            larghezza={120}
          />
          <div>
            <p className="font-display font-medium text-heemia-black">{p.nome}</p>
            <p className="font-mono-heemia text-[11px] text-heemia-grey">{p.codiceProdotto}</p>
          </div>
        </div>
      ),
    },
    { header: 'Categoria', accessor: (p) => <span>{p.categoria} · {p.collezione}</span> },
    { header: 'Linea', accessor: (p) => <Badge variant="neutral">{p.linea === 'tessile' ? 'Tessile' : 'Maglieria'}</Badge> },
    { header: 'Fase', accessor: (p) => <Badge variant="info">{stageLabel(p.stato)}</Badge> },
    {
      header: 'Prezzo vendita',
      align: 'right',
      accessor: (p) =>
        p.prezzoVendita > 0 ? (
          formatCurrency(p.prezzoVendita)
        ) : p.stato === 'idea' ? (
          <span className="text-heemia-grey">–</span>
        ) : (
          <Badge variant="critical">Nessun prezzo</Badge>
        ),
    },
    { header: 'Shopify', accessor: (p) => <StatusBadge status={p.statoPubblicazioneShopify} /> },
    // La colonna Margine segue il gating del modulo Costi e margini (User_Roles_Permissions:
    // "Team interno non vede mai Costi e Margini") e usa i margini ricalcolati live.
    ...(canSeeMargins
      ? [
          {
            header: 'Margine',
            align: 'right' as const,
            accessor: (p: Product) => {
              const m = liveMargins.find((mg) => mg.productId === p.id)
              if (!m) return <span className="text-heemia-grey">–</span>
              return <Badge variant={m.sottoSoglia ? 'critical' : 'success'}>{formatPercent(m.marginePercentuale)}</Badge>
            },
          },
        ]
      : []),
    {
      header: 'Varianti',
      align: 'right',
      accessor: (p) => productVariants.filter((v) => v.productId === p.id).length,
    },
    // Elimina: solo Admin/CEO. `stopPropagation` perché il click sulla riga apre il capo.
    ...(puoEliminare
      ? [
          {
            header: '',
            accessor: (p: Product) => (
              <button
                type="button"
                title={`Elimina ${p.nome}`}
                aria-label={`Elimina ${p.nome}`}
                onClick={(e) => { e.stopPropagation(); setDaEliminare(p) }}
                className="rounded-heemia-sm border border-transparent p-1.5 text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-carmine/40 hover:bg-heemia-carmine-light/60 hover:text-heemia-carmine"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Anagrafica prodotti"
        subtitle="Scheda prodotto completa: dati, varianti, prezzi e stato pubblicazione."
        action={
          canWrite(role, 'prodotti') ? (
            <div className="flex items-center gap-2">
              {/* Sta qui e non nella scheda del singolo capo perché è un'operazione sul
                  catalogo intero: una passata sola riempie la galleria di tutti i capi le
                  cui foto sono su Drive, invece di novantatré incollaggi di link. */}
              <Button variant="secondary" onClick={() => setAbbinaOpen(true)}>
                <span className="inline-flex items-center gap-1.5">
                  <Images className="h-3.5 w-3.5" /> Abbina foto da Drive
                </span>
              </Button>
              <Button onClick={() => setAddOpen(true)}>Nuovo prodotto</Button>
            </div>
          ) : undefined
        }
      />

      {vista && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-heemia-grey">Filtro dalla dashboard:</span>
          <button
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            className="inline-flex items-center gap-1.5 rounded-full border border-heemia-border-strong bg-white px-3 py-1 text-xs font-medium text-heemia-black transition-colors duration-200 ease-heemia hover:border-heemia-black"
          >
            {vista.label}
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca per nome o codice…"
        filters={[
          {
            label: 'Fase',
            value: stato,
            onChange: setStato,
            options: PRODUCT_STAGES.map((s) => ({ value: s.id, label: s.label })),
          },
          {
            label: 'Linea',
            value: linea,
            onChange: setLinea,
            options: [
              { value: 'tessile', label: 'Tessile' },
              { value: 'maglieria', label: 'Maglieria' },
            ],
          },
        ]}
      />

      {/* Come si legge il catalogo: ordine e raggruppamento. Sono due domande distinte —
          «in che ordine» e «raggruppati come» — e tenerle separate evita l'elenco unico di
          combinazioni («per categoria A→Z», «per categoria Z→A», …) che cresce moltiplicando. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SelettoreCampo
            etichetta="Ordina per"
            valore={ordinamento}
            onChange={(v) => cambiaParam('ordina', v, 'alfabetico')}
            opzioni={ORDINAMENTI.map((o) => ({ value: o.id, label: o.label }))}
          />
          <SelettoreCampo
            etichetta="Raggruppa"
            valore={raggruppamento}
            onChange={(v) => cambiaParam('raggruppa', v, 'nessuno')}
            opzioni={RAGGRUPPAMENTI.map((r) => ({ value: r.id, label: r.label }))}
            titolo={RAGGRUPPAMENTI.find((r) => r.id === raggruppamento)?.descrizione}
          />
          <p className="text-xs text-heemia-grey">
            {rows.length} {rows.length === 1 ? 'capo' : 'capi'}
          </p>
        </div>
        <div className="flex rounded-heemia-sm border border-heemia-border bg-white p-0.5">
          <SelettoreModo attivo={!galleria} onClick={() => cambiaModo('lista')} titolo="Vista elenco">
            <ListIcon className="h-3.5 w-3.5" /> Elenco
          </SelettoreModo>
          <SelettoreModo attivo={galleria} onClick={() => cambiaModo('galleria')} titolo="Vista galleria: catalogo interno con le foto">
            <LayoutGrid className="h-3.5 w-3.5" /> Galleria
          </SelettoreModo>
        </div>
      </div>

      {galleria ? (
        <ProductGallery products={rows} caricamento={caricamento} onOpen={(p) => navigate(`/prodotti/${p.id}`)} />
      ) : raggruppamento === 'nessuno' ? (
        <DataTable
          loading={caricamento}
          columns={columns}
          rows={rows}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => navigate(`/prodotti/${p.id}`)}
          emptyTitle="Nessun prodotto trovato"
          emptyDescription="Nessun capo corrisponde ai filtri selezionati. Prova a modificare fase o linea."
        />
      ) : (
        <CatalogoRaggruppato
          gruppi={gruppi}
          conVarianti={raggruppamento === 'prodotto'}
          varianti={variantiDi}
          caricamento={caricamento}
          onApri={(p) => navigate(`/prodotti/${p.id}`)}
        />
      )}

      {daEliminare && (
        <DeleteProductModal product={daEliminare} onClose={() => setDaEliminare(null)} />
      )}

      {addOpen && (
        <AddProductForm
          onClose={() => setAddOpen(false)}
          onSubmit={async (input) => {
            // L'id lo assegna il database: si attende la risposta prima di aprire il dettaglio.
            const created = await addProduct(input)
            navigate(`/prodotti/${created.id}`)
          }}
        />
      )}

      {abbinaOpen && <AbbinaFotoDrive onClose={() => setAbbinaOpen(false)} onFatto={ricarica} />}
    </div>
  )
}

/**
 * Selettore compatto con etichetta a sinistra. Non è un filtro (che toglie righe): decide
 * come si legge quello che c'è, e per questo sta accanto al conteggio dei capi e non nella
 * barra dei filtri, dove sembrerebbe restringere il catalogo.
 */
function SelettoreCampo({
  etichetta,
  valore,
  onChange,
  opzioni,
  titolo,
}: {
  etichetta: string
  valore: string
  onChange: (v: string) => void
  opzioni: { value: string; label: string }[]
  titolo?: string
}) {
  return (
    <label title={titolo} className="flex items-center gap-1.5 rounded-heemia-sm border border-heemia-border bg-white py-1 pl-2.5 pr-1">
      <span className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{etichetta}</span>
      <select
        value={valore}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent py-0.5 pr-1 text-xs font-medium text-heemia-black focus:outline-none"
      >
        {opzioni.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

/** Pulsante del selettore elenco/galleria: l'attivo si legge a colpo d'occhio. */
function SelettoreModo({
  attivo,
  onClick,
  titolo,
  children,
}: {
  attivo: boolean
  onClick: () => void
  titolo: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titolo}
      aria-pressed={attivo}
      className={`inline-flex items-center gap-1.5 rounded-heemia-xs px-2.5 py-1 text-xs font-medium transition-all duration-200 ease-heemia ${
        attivo ? 'bg-heemia-black text-white' : 'text-heemia-grey hover:text-heemia-black'
      }`}
    >
      {children}
    </button>
  )
}
