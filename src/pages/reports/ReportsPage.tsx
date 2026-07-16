import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { formatCurrency, formatPercent, formatDateIt } from '../../lib/format'
import { monthlyReports } from '../../mock'
import { EmptyState } from '../../components/ui/States'

export function ReportsPage() {
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

      <Card className="mt-6">
        <CardHeader title="Formato export" subtitle="Formato export (PDF/Excel/entrambi) ancora da confermare." />
        <div className="p-5 text-sm text-heemia-grey">Export non disponibile in questa fase del prototipo.</div>
      </Card>
    </div>
  )
}
