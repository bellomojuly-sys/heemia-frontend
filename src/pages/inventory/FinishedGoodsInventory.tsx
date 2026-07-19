import { KpiTile } from '../../components/dashboard/KpiTile'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { StatusBadge } from '../../lib/statusBadge'
import { Badge } from '../../components/ui/Badge'
import { getStockOverview } from '../../lib/dashboard'
import type { InventoryRecord } from '../../types'
import { useMockStore } from '../../context/MockStore'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'

export function FinishedGoodsInventory() {
  const { role } = useRole()
  const { inventoryRecords, productVariants, products, updateVariantQuantities } = useMockStore()
  const userCanEdit = canEdit(role)
  const stock = getStockOverview(inventoryRecords)

  const qtyInputClass =
    'font-mono-heemia w-20 rounded-[3px] border border-heemia-border bg-white px-2 py-1 text-right text-sm text-heemia-black focus:border-heemia-black focus:outline-none'

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
    {
      header: 'Magazzino',
      align: 'right',
      // Modificabile: aggiorna anche la variante del prodotto (stessa fonte, updateVariantQuantities).
      accessor: (r) =>
        userCanEdit ? (
          <input
            type="number"
            min="0"
            value={r.qtaMagazzino}
            onChange={(e) => updateVariantQuantities(r.variantId, { qtaMagazzino: Math.max(0, Number(e.target.value) || 0) })}
            className={qtyInputClass}
            aria-label={`Magazzino ${r.variantId}`}
          />
        ) : (
          r.qtaMagazzino
        ),
    },
    {
      header: 'Laboratorio',
      align: 'right',
      // Capi piazzati in laboratorio (FR-INV-01): modificabile come Magazzino/Riservato.
      accessor: (r) =>
        userCanEdit ? (
          <input
            type="number"
            min="0"
            value={r.qtaLaboratorio}
            onChange={(e) => updateVariantQuantities(r.variantId, { qtaLaboratorio: Math.max(0, Number(e.target.value) || 0) })}
            className={qtyInputClass}
            aria-label={`Laboratorio ${r.variantId}`}
          />
        ) : (
          r.qtaLaboratorio
        ),
    },
    {
      header: 'Riservato',
      align: 'right',
      accessor: (r) =>
        userCanEdit ? (
          <input
            type="number"
            min="0"
            value={r.qtaRiservata}
            onChange={(e) => updateVariantQuantities(r.variantId, { qtaRiservata: Math.max(0, Number(e.target.value) || 0) })}
            className={qtyInputClass}
            aria-label={`Riservato ${r.variantId}`}
          />
        ) : (
          r.qtaRiservata
        ),
    },
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
      <p className="mb-4 text-sm text-heemia-grey">Stock per variante, separato dai materiali. Le quantità sono modificabili e collegate alle varianti in Anagrafica prodotti.</p>

      <div className="mb-6 flex flex-wrap gap-3">
        <KpiTile label="Disponibile" value={stock.disponibile} />
        <KpiTile label="Riservato" value={stock.riservato} />
        <KpiTile label="Low stock" value={stock.lowStock} critical={stock.lowStock > 0} />
        <KpiTile label="Esaurito" value={stock.esaurito} critical={stock.esaurito > 0} />
      </div>

      <DataTable columns={columns} rows={inventoryRecords} keyExtractor={(r) => r.id} />
    </div>
  )
}
