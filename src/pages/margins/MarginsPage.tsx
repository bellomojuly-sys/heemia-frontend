import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { InfoTooltip } from '../../components/ui/InfoTooltip'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { MarginSummaryCard } from '../../components/margins/MarginSummaryCard'
import { formatCurrency, formatDateIt, formatPercent } from '../../lib/format'
import { computeQuotaPerCapo, recomputeMargin } from '../../lib/margins'
import { margins, MARGIN_THRESHOLD_PERCENT, costAllocations } from '../../mock'
import type { Margin } from '../../types'
import { useMockStore } from '../../context/MockStore'

const ALLOCATION_LABEL: Record<string, string> = {
  diretto_prodotto: 'Diretto prodotto', per_categoria: 'Per categoria', per_collezione: 'Per collezione',
  per_numero_capi: 'Per numero capi', per_fatturato: 'Per fatturato', per_mese: 'Per mese', non_allocabile: 'Non allocabile',
}

function FixedCostsCard() {
  const { fixedCostItems, capiProdottiAnnui, quotaHistory, updateFixedCostItem, addFixedCostItem, removeFixedCostItem, setCapiProdottiAnnui, saveQuotaSnapshot } = useMockStore()
  const [newNome, setNewNome] = useState('')
  const [newImporto, setNewImporto] = useState('')
  const [periodo, setPeriodo] = useState('')

  const totaleAnnuo = fixedCostItems.reduce((sum, item) => sum + item.importoAnnuo, 0)
  const quotaPerCapo = computeQuotaPerCapo(fixedCostItems, capiProdottiAnnui)

  const submitNew = () => {
    if (!newNome.trim() || !newImporto) return
    addFixedCostItem(newNome.trim(), Number(newImporto))
    setNewNome('')
    setNewImporto('')
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Costi fissi annui"
        subtitle="Affitto, dipendenti, utenze e altre voci aziendali: la somma, divisa per i capi prodotti nell'anno, dà la quota costi fissi per capo usata nel calcolo margini."
      />
      <div className="p-5">
        <ul className="mb-4 divide-y divide-heemia-border">
          {fixedCostItems.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="text-heemia-black">{item.nome}</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="font-mono-heemia text-xs text-heemia-grey">€</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.importoAnnuo}
                    onChange={(e) => updateFixedCostItem(item.id, Number(e.target.value))}
                    className="font-mono-heemia w-28 rounded-[3px] border border-heemia-border bg-white px-2 py-1 text-right text-sm text-heemia-black focus:border-heemia-black focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeFixedCostItem(item.id)}
                  aria-label={`Rimuovi ${item.nome}`}
                  className="text-xs text-heemia-grey transition-colors hover:text-heemia-carmine"
                >
                  Rimuovi
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mb-5 flex flex-wrap items-end gap-2 border-t border-heemia-border pt-4">
          <div className="flex-1">
            <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Nuova voce</span>
            <input
              type="text"
              value={newNome}
              onChange={(e) => setNewNome(e.target.value)}
              placeholder="Es. Magazzino esterno"
              className="w-full rounded-[3px] border border-heemia-border bg-white px-3 py-1.5 text-sm text-heemia-black focus:border-heemia-black focus:outline-none"
            />
          </div>
          <div>
            <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Costo annuo (€)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={newImporto}
              onChange={(e) => setNewImporto(e.target.value)}
              className="w-32 rounded-[3px] border border-heemia-border bg-white px-3 py-1.5 text-sm text-heemia-black focus:border-heemia-black focus:outline-none"
            />
          </div>
          <Button variant="secondary" onClick={submitNew} disabled={!newNome.trim() || !newImporto}>Aggiungi voce</Button>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded-[3px] border border-heemia-border-strong bg-heemia-cream p-4 sm:grid-cols-3">
          <div>
            <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Totale costi fissi annui</p>
            <p className="font-mono-heemia mt-0.5 text-lg text-heemia-black">{formatCurrency(totaleAnnuo)}</p>
          </div>
          <div>
            <label className="font-mono-heemia mb-0.5 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey" htmlFor="capi-prodotti-annui">
              Capi prodotti nell'anno
            </label>
            <input
              id="capi-prodotti-annui"
              type="number"
              min="1"
              value={capiProdottiAnnui}
              onChange={(e) => setCapiProdottiAnnui(Number(e.target.value) || 1)}
              className="font-mono-heemia w-full rounded-[3px] border border-heemia-border bg-white px-3 py-1.5 text-lg text-heemia-black focus:border-heemia-black focus:outline-none"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Quota per capo</p>
              <InfoTooltip text="Totale costi fissi annui diviso i capi prodotti nell'anno. Si applica al calcolo margini di ogni prodotto, tessile e maglieria." />
            </div>
            <p className="font-mono-heemia mt-0.5 text-lg font-semibold text-heemia-black">{formatCurrency(quotaPerCapo)}</p>
          </div>
        </div>

        {/* FR-40: la quota va storicizzata per stagione/periodo, mai sovrascritta in silenzio. */}
        <div className="mt-5 border-t border-heemia-border pt-4">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Registra la quota corrente per stagione/periodo</span>
              <input
                type="text"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                placeholder="Es. FW26"
                className="w-full rounded-[3px] border border-heemia-border bg-white px-3 py-1.5 text-sm text-heemia-black focus:border-heemia-black focus:outline-none"
              />
            </div>
            <Button
              variant="secondary"
              disabled={!periodo.trim()}
              onClick={() => {
                saveQuotaSnapshot(periodo.trim())
                setPeriodo('')
              }}
            >
              Registra nello storico
            </Button>
          </div>
          <ul className="divide-y divide-heemia-border">
            {quotaHistory.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <span className="text-heemia-black">{h.periodo}</span>
                  {h.nota && <p className="text-xs text-heemia-grey">{h.nota}</p>}
                </div>
                <span className="font-mono-heemia text-xs text-heemia-grey">
                  {h.capiProdottiAnnui} capi · {formatCurrency(h.totaleCostiFissi)} → <span className="text-heemia-black">{formatCurrency(h.quotaPerCapo)}/capo</span> · {formatDateIt(h.registrataIl)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}

export function MarginsPage() {
  const { fixedCostItems, capiProdottiAnnui, products, invoices } = useMockStore()
  const quotaPerCapo = computeQuotaPerCapo(fixedCostItems, capiProdottiAnnui)

  const liveMargins = useMemo(
    () => margins.map((m) => recomputeMargin(m, quotaPerCapo, MARGIN_THRESHOLD_PERCENT)),
    [quotaPerCapo],
  )

  const sottoSoglia = liveMargins.filter((m) => m.sottoSoglia)
  const productsWithoutMargin = products.filter((p) => p.stato !== 'idea' && p.stato !== 'archivio' && !liveMargins.some((m) => m.productId === p.id))

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
      <PageHeader title="Costi e margini" subtitle={`Calcolo automatico costi, margini e break-even per prodotto. Soglia margine configurata: ${MARGIN_THRESHOLD_PERCENT}%.`} />

      <FixedCostsCard />

      {sottoSoglia.length > 0 && (
        <div className="mb-6">
          <h2 className="font-mono-heemia mb-3 text-[11px] uppercase tracking-[0.06em] text-heemia-carmine">Prodotti sotto soglia margine: richiedono attenzione</h2>
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
          <DataTable columns={columns} rows={liveMargins} keyExtractor={(m) => m.productId} />
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
        <CardHeader title="Allocazione costi indiretti" subtitle="Modalità di ripartizione applicata a ciascuna fattura." />
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
