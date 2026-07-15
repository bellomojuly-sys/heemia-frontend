import { useMemo } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { KpiTile } from '../../components/dashboard/KpiTile'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { StatusBadge } from '../../lib/statusBadge'
import { Badge } from '../../components/ui/Badge'
import { getStockOverview } from '../../lib/dashboard'
import { inventoryRecords, productVariants, products } from '../../mock'
import type { InventoryRecord } from '../../types'

export function FinishedGoodsInventory() {
  const stock = useMemo(() => getStockOverview(), [])

  const columns: DataTableColumn<InventoryRecord>[] = [
    {
      header: 'SKU',
      accessor: (r) => {
        const v = productVariants.find((v) => v.id === r.variantId)
        const p = v ? products.find((p) => p.id === v.productId) : undefined
        return (
          <div>
            <p className="font-mono-heemia text-[12px] text-heemia-black">{v?.sku ?? r.variantId}</p>
            <p className="font-display text-sm italic text-heemia-grey">{p?.nome} · {v?.taglia}/{v?.colore}</p>
          </div>
        )
      },
    },
    { header: 'Magazzino', accessor: (r) => r.qtaMagazzino, align: 'right' },
    { header: 'Laboratorio', accessor: (r) => r.qtaLaboratorio, align: 'right' },
    { header: 'Riservato', accessor: (r) => r.qtaRiservata, align: 'right' },
    { header: 'Venduto', accessor: (r) => r.qtaVenduta, align: 'right' },
    { header: 'Soglia min.', accessor: (r) => r.sogliaMinima, align: 'right' },
    { header: 'Stato', accessor: (r) => <StatusBadge status={r.stato} /> },
    {
      header: 'Stock Shopify',
      accessor: (r) =>
        r.divergenzaShopify ? (
          <Badge variant="critical">Interno {r.qtaMagazzino} · Shopify {r.stockShopify}</Badge>
        ) : (
          <span className="text-heemia-grey">{r.stockShopify} (allineato)</span>
        ),
    },
  ]

  return (
    <div>
      <PageHeader title="Inventario prodotti finiti" subtitle="Stock per variante, separato dai materiali (FR-INV-01)." />

      <div className="mb-6 flex flex-wrap divide-x divide-heemia-border rounded-[3px] border border-heemia-border bg-white">
        <KpiTile label="Disponibile" value={stock.disponibile} />
        <KpiTile label="Riservato" value={stock.riservato} />
        <KpiTile label="Low stock" value={stock.lowStock} critical={stock.lowStock > 0} />
        <KpiTile label="Esaurito" value={stock.esaurito} critical={stock.esaurito > 0} />
      </div>

      <DataTable columns={columns} rows={inventoryRecords} keyExtractor={(r) => r.id} />
    </div>
  )
}
