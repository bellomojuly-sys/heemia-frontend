import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Trash2, X } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { ImagePlaceholder } from '../../components/ui/ImagePlaceholder'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { AddProductForm } from '../../components/products/AddProductForm'
import { DeleteProductModal } from '../../components/products/DeleteProductModal'
import { StatusBadge } from '../../lib/statusBadge'
import { stageLabel } from '../../lib/production'
import { formatCurrency, formatPercent } from '../../lib/format'
import { PRODUCT_STAGES, type Product, type ProductStage } from '../../types'
import { useRole } from '../../context/RoleContext'
import { canAccessModule, canDeleteProducts, canEdit } from '../../lib/permissions'
import { useMockStore } from '../../context/MockStore'
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
  const { products, productVariants, addProduct, caricamento } = useMockStore()
  const liveMargins = useLiveMargins()
  const canSeeMargins = canAccessModule(role, 'costi-margini')
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [stato, setStato] = useState('')
  const [linea, setLinea] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [daEliminare, setDaEliminare] = useState<Product | null>(null)
  const puoEliminare = canDeleteProducts(role)

  const vista = VISTE[searchParams.get('vista') ?? '']

  const rows = useMemo(() => {
    return products.filter((p) => {
      if (vista && !vista.test(p)) return false
      if (search && !`${p.nome} ${p.codiceProdotto}`.toLowerCase().includes(search.toLowerCase())) return false
      if (stato && p.stato !== stato) return false
      if (linea && p.linea !== linea) return false
      return true
    })
  }, [products, vista, search, stato, linea])

  const columns: DataTableColumn<Product>[] = [
    {
      header: 'Prodotto',
      accessor: (p) => (
        <div className="flex items-center gap-3">
          <ImagePlaceholder label={p.nome} className="h-9 w-9 text-sm" />
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
        action={canEdit(role) ? <Button onClick={() => setAddOpen(true)}>Nuovo prodotto</Button> : undefined}
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

      <DataTable
        loading={caricamento}
        columns={columns}
        rows={rows}
        keyExtractor={(p) => p.id}
        onRowClick={(p) => navigate(`/prodotti/${p.id}`)}
        emptyTitle="Nessun prodotto trovato"
        emptyDescription="Nessun capo corrisponde ai filtri selezionati. Prova a modificare fase o linea."
      />

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
    </div>
  )
}
