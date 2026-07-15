import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { MarginSummaryCard } from '../../components/margins/MarginSummaryCard'
import { formatCurrency, formatPercent } from '../../lib/format'
import { margins, MARGIN_THRESHOLD_PERCENT, costAllocations, invoices, products } from '../../mock'
import type { Margin } from '../../types'

const ALLOCATION_LABEL: Record<string, string> = {
  diretto_prodotto: 'Diretto prodotto', per_categoria: 'Per categoria', per_collezione: 'Per collezione',
  per_numero_capi: 'Per numero capi', per_fatturato: 'Per fatturato', per_mese: 'Per mese', non_allocabile: 'Non allocabile',
}

export function MarginsPage() {
  const sottoSoglia = margins.filter((m) => m.sottoSoglia)
  const productsWithoutMargin = products.filter((p) => p.stato !== 'idea' && p.stato !== 'archivio' && !margins.some((m) => m.productId === p.id))

  const columns: DataTableColumn<Margin>[] = [
    { header: 'Prodotto', accessor: (m) => <Link to={`/prodotti/${m.productId}`} className="font-display italic text-heemia-black hover:underline">{products.find((p) => p.id === m.productId)?.nome ?? m.productId}</Link> },
    { header: 'Prezzo netto', accessor: (m) => formatCurrency(m.prezzoNettoIva), align: 'right' },
    { header: 'Costo totale', accessor: (m) => formatCurrency(m.costoTotale), align: 'right' },
    { header: 'Margine netto', accessor: (m) => formatCurrency(m.margineNettoStimato), align: 'right' },
    { header: 'Margine %', accessor: (m) => <Badge variant={m.sottoSoglia ? 'critical' : 'success'}>{formatPercent(m.marginePercentuale)}</Badge> },
    { header: 'Break-even', accessor: (m) => formatCurrency(m.breakEvenPrice), align: 'right' },
    { header: 'Dato', accessor: (m) => <Badge variant={m.tipoDato === 'reale' ? 'success' : 'neutral'}>{m.tipoDato === 'reale' ? 'Reale' : 'Stimato'}</Badge> },
  ]

  return (
    <div>
      <PageHeader title="Costi e margini" subtitle={`Calcolo automatico costi, margini e break-even per prodotto. Soglia margine configurata: ${MARGIN_THRESHOLD_PERCENT}% (FR-09, FR-10, FR-23).`} />

      {sottoSoglia.length > 0 && (
        <div className="mb-6">
          <h2 className="font-mono-heemia mb-3 text-[11px] uppercase tracking-[0.06em] text-heemia-carmine">Prodotti sotto soglia margine — richiedono attenzione</h2>
          <div className="space-y-4">
            {sottoSoglia.map((m) => (
              <MarginSummaryCard key={m.productId} margin={m} productName={products.find((p) => p.id === m.productId)?.nome ?? m.productId} />
            ))}
          </div>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader title="Tutti i prodotti" subtitle="Margine lordo, netto stimato, break-even e prezzo minimo consigliato per capo." />
        <div className="p-5">
          <DataTable columns={columns} rows={margins} keyExtractor={(m) => m.productId} />
        </div>
      </Card>

      {productsWithoutMargin.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Dati insufficienti" subtitle="Prodotti senza margine calcolabile: manca prezzo o scheda tecnica completa." />
          <ul className="divide-y divide-heemia-border">
            {productsWithoutMargin.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <Link to={`/prodotti/${p.id}`} className="font-display italic text-heemia-black hover:underline">{p.nome}</Link>
                <Badge variant="warning">{p.prezzoVendita <= 0 ? 'Nessun prezzo' : 'Costo incompleto'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Allocazione costi indiretti" subtitle="Modalità di ripartizione applicata a ciascuna fattura (FR-23)." />
        <ul className="divide-y divide-heemia-border">
          {costAllocations.map((ca) => {
            const inv = invoices.find((i) => i.id === ca.invoiceId)
            return (
              <li key={ca.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-mono-heemia text-[12px] text-heemia-black">{inv?.numero ?? ca.invoiceId}</p>
                  {ca.note && <p className="mt-0.5 text-xs text-heemia-grey">{ca.note}</p>}
                </div>
                <Badge variant="neutral">{ALLOCATION_LABEL[ca.modalita]}</Badge>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
