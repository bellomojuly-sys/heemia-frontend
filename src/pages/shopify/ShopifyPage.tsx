import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { useMockStore } from '../../context/MockStore'

export function ShopifyPage() {
  const { products, inventoryRecords, productVariants, orders, customers } = useMockStore()
  const divergenti = inventoryRecords.filter((r) => r.divergenzaShopify)
  const shopifyOrders = orders.filter((o) => o.canale === 'shopify')

  return (
    <div>
      <PageHeader
        title="Integrazione Shopify"
        subtitle="Predisposizione dati per la sincronizzazione: nessuna sincronizzazione live in questa fase."
        action={<Badge variant="info">Predisposizione, implementazione in fase successiva</Badge>}
      />

      <Card className="mb-6">
        <CardHeader title="Stato pubblicazione prodotti" />
        <ul className="divide-y divide-heemia-border">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <Link to={`/prodotti/${p.id}`} className="font-display italic text-heemia-black hover:underline">{p.nome}</Link>
              <StatusBadge status={p.statoPubblicazioneShopify} />
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Divergenza stock interno vs Shopify" />
        {divergenti.length === 0 ? (
          <p className="p-5 text-sm text-heemia-grey">Nessuna divergenza rilevata.</p>
        ) : (
          <ul className="divide-y divide-heemia-border">
            {divergenti.map((r) => {
              const v = productVariants.find((v) => v.id === r.variantId)
              return (
                <li key={r.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="font-mono-heemia text-xs text-heemia-black">{v?.sku}</span>
                  <Badge variant="critical">Interno {r.qtaMagazzino} · Shopify {r.stockShopify}</Badge>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Ordini canale Shopify" />
        <ul className="divide-y divide-heemia-border">
          {shopifyOrders.map((o) => (
            <li key={o.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <div>
                <p className="font-mono-heemia text-xs text-heemia-black">{o.numero}</p>
                <p className="mt-0.5 text-xs text-heemia-grey">{customers.find((c) => c.id === o.customerId)?.nome} · {formatDateIt(o.data)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono-heemia">{formatCurrency(o.totale)}</span>
                <StatusBadge status={o.stato} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
