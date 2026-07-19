import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { ImagePlaceholder } from '../../components/ui/ImagePlaceholder'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { AddProductForm } from '../../components/products/AddProductForm'
import { StatusBadge } from '../../lib/statusBadge'
import { stageLabel } from '../../lib/production'
import { formatCurrency, formatPercent } from '../../lib/format'
import { PRODUCT_STAGES, type Product } from '../../types'
import { useRole } from '../../context/RoleContext'
import { canAccessModule, canEdit } from '../../lib/permissions'
import { useMockStore } from '../../context/MockStore'
import { useLiveMargins } from '../../hooks/useLiveMargins'

export function ProductList() {
  const navigate = useNavigate()
  const { role } = useRole()
  const { products, productVariants, addProduct } = useMockStore()
  const liveMargins = useLiveMargins()
  const canSeeMargins = canAccessModule(role, 'costi-margini')
  const [search, setSearch] = useState('')
  const [stato, setStato] = useState('')
  const [linea, setLinea] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const rows = useMemo(() => {
    return products.filter((p) => {
      if (search && !`${p.nome} ${p.codiceProdotto}`.toLowerCase().includes(search.toLowerCase())) return false
      if (stato && p.stato !== stato) return false
      if (linea && p.linea !== linea) return false
      return true
    })
  }, [products, search, stato, linea])

  const columns: DataTableColumn<Product>[] = [
    {
      header: 'Prodotto',
      accessor: (p) => (
        <div className="flex items-center gap-3">
          <ImagePlaceholder label={p.nome} className="h-9 w-9 text-sm" />
          <div>
            <p className="font-display italic text-heemia-black">{p.nome}</p>
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
  ]

  return (
    <div>
      <PageHeader
        title="Anagrafica prodotti"
        subtitle="Scheda prodotto completa: dati, varianti, prezzi e stato pubblicazione."
        action={canEdit(role) ? <Button onClick={() => setAddOpen(true)}>Nuovo prodotto</Button> : undefined}
      />

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
        columns={columns}
        rows={rows}
        keyExtractor={(p) => p.id}
        onRowClick={(p) => navigate(`/prodotti/${p.id}`)}
        emptyTitle="Nessun prodotto trovato"
        emptyDescription="Nessun capo corrisponde ai filtri selezionati. Prova a modificare fase o linea."
      />

      {addOpen && (
        <AddProductForm
          onClose={() => setAddOpen(false)}
          onSubmit={(input) => {
            const created = addProduct(input)
            navigate(`/prodotti/${created.id}`)
          }}
        />
      )}
    </div>
  )
}
