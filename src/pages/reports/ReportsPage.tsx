import { useMemo } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { formatCurrency, formatPercent, formatDateIt } from '../../lib/format'
import { monthlyReports } from '../../mock'
import { EmptyState } from '../../components/ui/States'
import { useMockStore } from '../../context/MockStore'
import { useLiveMargins } from '../../hooks/useLiveMargins'

function StatRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0 truncate text-heemia-black">{label}</span>
      <span className={`font-mono-heemia ${accent ? 'text-heemia-carmine' : 'text-heemia-grey'}`}>{value}</span>
    </li>
  )
}

export function ReportsPage() {
  const { products, materials, accessories, invoices, orders, suppliers, inventoryRecords, productVariants } = useMockStore()
  const liveMargins = useLiveMargins()

  // FR-26: margine per categoria/collezione, costi per fornitore/materiale, valore magazzini
  // e andamento mensile, derivati dai dati correnti (stato di sessione incluso).
  const stats = useMemo(() => {
    const byGroup = (key: 'categoria' | 'collezione') => {
      const groups = new Map<string, { sum: number; n: number }>()
      for (const m of liveMargins) {
        const p = products.find((pr) => pr.id === m.productId)
        if (!p) continue
        const g = groups.get(p[key]) ?? { sum: 0, n: 0 }
        g.sum += m.marginePercentuale
        g.n += 1
        groups.set(p[key], g)
      }
      return [...groups.entries()].map(([label, g]) => ({ label, media: g.sum / g.n })).sort((a, b) => b.media - a.media)
    }

    const costiPerFornitore = new Map<string, number>()
    for (const i of invoices) {
      if (!i.fornitoreId) continue
      costiPerFornitore.set(i.fornitoreId, (costiPerFornitore.get(i.fornitoreId) ?? 0) + i.totale)
    }

    const perMese = new Map<string, { costi: number; ricavi: number }>()
    for (const i of invoices) {
      const mese = i.data.slice(0, 7)
      const rec = perMese.get(mese) ?? { costi: 0, ricavi: 0 }
      rec.costi += i.totale
      perMese.set(mese, rec)
    }
    for (const o of orders) {
      if (o.stato === 'annullato') continue
      const mese = o.data.slice(0, 7)
      const rec = perMese.get(mese) ?? { costi: 0, ricavi: 0 }
      rec.ricavi += o.totale
      perMese.set(mese, rec)
    }

    const valoreTessuti = materials.reduce((s, m) => s + Math.max(m.metriAcquistati - m.metriUtilizzati, 0) * m.prezzoAlMetro, 0)
    const valoreAccessori = accessories.reduce((s, a) => s + Math.max(a.quantitaAcquistata - a.quantitaUtilizzata, 0) * a.costoUnitario, 0)
    const valoreProdotti = inventoryRecords.reduce((s, r) => {
      const v = productVariants.find((pv) => pv.id === r.variantId)
      const p = v ? products.find((pr) => pr.id === v.productId) : undefined
      return s + r.qtaMagazzino * (p?.prezzoNettoIva ?? 0)
    }, 0)

    return {
      perCategoria: byGroup('categoria'),
      perCollezione: byGroup('collezione'),
      costiPerFornitore: [...costiPerFornitore.entries()]
        .map(([id, tot]) => ({ nome: suppliers.find((s) => s.id === id)?.nome ?? id, tot }))
        .sort((a, b) => b.tot - a.tot),
      perMese: [...perMese.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      valoreTessuti,
      valoreAccessori,
      valoreProdotti,
    }
  }, [liveMargins, products, materials, accessories, invoices, orders, suppliers, inventoryRecords, productVariants])

  return (
    <div>
      <PageHeader title="Report economici" subtitle="Report mensili generati automaticamente, con notifica alla data di generazione." />

      {monthlyReports.length === 0 ? (
        <EmptyState title="Nessun report generato" description="Il primo report mensile verrà generato automaticamente a fine mese." />
      ) : (
        <div className="space-y-4">
          {monthlyReports.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="mb-5 flex items-center justify-between">
                <p className="font-display text-lg italic text-heemia-black">{r.mese}</p>
                <Badge variant="info">Report pronto: {formatDateIt(r.generatoIl)}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Margine medio</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{formatPercent(r.margineMedio)}</p></div>
                <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Costo medio prodotto</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{formatCurrency(r.costoMedioProdotto)}</p></div>
                <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Ricavi totali</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{formatCurrency(r.ricaviTotali)}</p></div>
                <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Costi totali</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{formatCurrency(r.costiTotali)}</p></div>
                <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Prodotto più costoso</p><p className="font-display mt-0.5 italic text-heemia-black">{r.prodottoPiuCostoso}</p></div>
                <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Prodotto meno redditizio</p><p className="font-display mt-0.5 italic text-heemia-carmine">{r.prodottoMenoRedditizio}</p></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Margine medio per categoria e collezione" subtitle="Calcolato sui margini correnti (quota costi fissi inclusa)." />
          <div className="grid grid-cols-2 gap-4 p-5">
            <div>
              <p className="font-mono-heemia mb-1.5 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Per categoria</p>
              <ul className="divide-y divide-heemia-border">
                {stats.perCategoria.map((g) => (
                  <StatRow key={g.label} label={g.label} value={formatPercent(g.media)} accent={g.media < 0} />
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono-heemia mb-1.5 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Per collezione</p>
              <ul className="divide-y divide-heemia-border">
                {stats.perCollezione.map((g) => (
                  <StatRow key={g.label} label={g.label} value={formatPercent(g.media)} accent={g.media < 0} />
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Andamento mensile" subtitle="Costi da fatture e ricavi da ordini, per mese." />
          <div className="p-5">
            <ul className="divide-y divide-heemia-border">
              {stats.perMese.map(([mese, rec]) => (
                <li key={mese} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="font-mono-heemia text-xs text-heemia-black">{mese}</span>
                  <span className="font-mono-heemia text-xs text-heemia-grey">
                    costi {formatCurrency(rec.costi)} · ricavi {formatCurrency(rec.ricavi)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title="Costi per fornitore" subtitle="Totale fatture ricevute per fornitore." />
          <div className="p-5">
            <ul className="divide-y divide-heemia-border">
              {stats.costiPerFornitore.map((f) => (
                <StatRow key={f.nome} label={f.nome} value={formatCurrency(f.tot)} />
              ))}
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title="Valore magazzino" subtitle="Tessuti e accessori a costo, prodotti finiti a prezzo netto IVA." />
          <div className="grid grid-cols-3 gap-4 p-5 text-sm">
            <div>
              <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Tessuti</p>
              <p className="font-mono-heemia mt-0.5 text-heemia-black">{formatCurrency(stats.valoreTessuti)}</p>
            </div>
            <div>
              <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Accessori</p>
              <p className="font-mono-heemia mt-0.5 text-heemia-black">{formatCurrency(stats.valoreAccessori)}</p>
            </div>
            <div>
              <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Prodotti disponibili</p>
              <p className="font-mono-heemia mt-0.5 text-heemia-black">{formatCurrency(stats.valoreProdotti)}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Formato export" subtitle="Formato export (PDF/Excel/entrambi) ancora da confermare." />
        <div className="p-5 text-sm text-heemia-grey">Export non disponibile in questa fase del prototipo.</div>
      </Card>
    </div>
  )
}
