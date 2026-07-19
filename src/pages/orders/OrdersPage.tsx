import { useMemo, useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../../lib/format'
import type { Order } from '../../types'
import { useMockStore } from '../../context/MockStore'

// Pagina dedicata agli ordini: la matrice permessi assegna "ordini" anche al Team interno,
// che non ha accesso a Clienti (dati commerciali e sconti, riservati ad Admin/CEO).
export function OrdersPage() {
  const { orders, customers, products } = useMockStore()
  const [search, setSearch] = useState('')
  const [stato, setStato] = useState('')
  const [canale, setCanale] = useState('')

  const rows = useMemo(
    () =>
      [...orders]
        .sort((a, b) => (a.data < b.data ? 1 : -1))
        .filter((o) => {
          if (search && !o.numero.toLowerCase().includes(search.toLowerCase())) return false
          if (stato && o.stato !== stato) return false
          if (canale && o.canale !== canale) return false
          return true
        }),
    [orders, search, stato, canale],
  )

  const columns: DataTableColumn<Order>[] = [
    { header: 'Numero', accessor: (o) => <span className="font-mono-heemia text-[12px] text-heemia-black">{o.numero}</span> },
    { header: 'Data', accessor: (o) => formatDateIt(o.data) },
    { header: 'Cliente', accessor: (o) => <span className="font-display italic">{customers.find((c) => c.id === o.customerId)?.nome ?? '–'}</span> },
    { header: 'Canale', accessor: (o) => <Badge variant="neutral">{o.canale === 'shopify' ? 'Shopify' : 'Punto vendita'}</Badge> },
    {
      header: 'Prodotti',
      accessor: (o) => o.prodottiIds.map((pid) => products.find((p) => p.id === pid)?.nome).filter(Boolean).join(', ') || '–',
    },
    { header: 'Totale', accessor: (o) => formatCurrency(o.totale), align: 'right' },
    { header: 'Priorità', accessor: (o) => (o.priorita === 'alta' ? <Badge variant="critical">Alta</Badge> : 'Normale') },
    { header: 'Stato', accessor: (o) => <StatusBadge status={o.stato} /> },
  ]

  return (
    <div>
      <PageHeader title="Ordini" subtitle="Ordini e-commerce e punto vendita, per la gestione operativa." />
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca per numero…"
        filters={[
          { label: 'Stato', value: stato, onChange: setStato, options: [
            { value: 'in_lavorazione', label: 'In lavorazione' }, { value: 'spedito', label: 'Spedito' },
            { value: 'consegnato', label: 'Consegnato' }, { value: 'annullato', label: 'Annullato' },
          ] },
          { label: 'Canale', value: canale, onChange: setCanale, options: [
            { value: 'shopify', label: 'Shopify' }, { value: 'fisico', label: 'Punto vendita' },
          ] },
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        keyExtractor={(o) => o.id}
        emptyTitle="Nessun ordine trovato"
        emptyDescription="Nessun ordine corrisponde ai filtri selezionati."
      />
    </div>
  )
}
