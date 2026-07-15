import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/States'
import { ImagePlaceholder } from '../../components/ui/ImagePlaceholder'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { StageProgress } from '../../components/production/StageProgress'
import { MarginSummaryCard } from '../../components/margins/MarginSummaryCard'
import { StatusBadge } from '../../lib/statusBadge'
import { checkAdvance } from '../../lib/production'
import { formatCurrency } from '../../lib/format'
import { products, productVariants, technicalSheets, margins, materials, accessories } from '../../mock'
import type { ProductVariant, TechnicalSheetVersion } from '../../types'
import { useMockStore } from '../../context/MockStore'
import { useRole } from '../../context/RoleContext'
import { canAccessModule } from '../../lib/permissions'

const VERSION_LABEL: Record<TechnicalSheetVersion, string> = {
  preliminare: 'Preliminare',
  piazzamento: 'Piazzamento taglio',
  finale: 'Finale',
}

export function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const { role } = useRole()
  const { productionSteps } = useMockStore()
  const product = products.find((p) => p.id === id)
  const sheets = technicalSheets.filter((ts) => ts.productId === id)
  const [activeVersion, setActiveVersion] = useState<TechnicalSheetVersion | null>(
    sheets.find((s) => s.versione === 'finale')?.versione ?? sheets[0]?.versione ?? null,
  )
  const activeSheet = sheets.find((s) => s.versione === activeVersion) ?? sheets[0]

  if (!product) {
    return <EmptyState title="Prodotto non trovato" description="Il codice prodotto richiesto non esiste tra i dati mock." />
  }

  const step = productionSteps.find((s) => s.productId === product.id)
  const margin = margins.find((m) => m.productId === product.id)
  const variants = productVariants.filter((v) => v.productId === product.id)

  const variantColumns: DataTableColumn<ProductVariant>[] = [
    { header: 'SKU', accessor: (v) => v.sku, className: 'font-mono-heemia text-[12px]' },
    { header: 'Taglia', accessor: (v) => v.taglia },
    { header: 'Colore', accessor: (v) => v.colore },
    { header: 'Stock', accessor: (v) => v.stockDisponibile, align: 'right' },
    { header: 'Riservato', accessor: (v) => v.stockRiservato, align: 'right' },
    { header: 'Stato', accessor: (v) => <StatusBadge status={v.statoDisponibilita} /> },
  ]

  return (
    <div>
      <Link to="/prodotti" className="mb-4 inline-block text-xs text-heemia-grey hover:text-heemia-black">← Torna all'anagrafica</Link>

      <PageHeader
        title={product.nome}
        subtitle={`${product.codiceProdotto} · ${product.categoria} · ${product.collezione} · ${product.stagione}`}
        action={
          <div className="flex gap-2">
            <Badge variant="neutral">{product.linea === 'tessile' ? 'Tessile' : 'Maglieria'}</Badge>
            <StatusBadge status={product.statoPubblicazioneShopify} />
          </div>
        }
      />

      <Card className="mb-4">
        <CardHeader title="Pipeline produzione" subtitle="FR-07" />
        <div className="p-5">
          {step ? (
            <StageProgress
              currentStage={step.fase}
              blocked={step.bloccata}
              blockReason={step.motivoBlocco ?? checkAdvance(step).reason}
            />
          ) : (
            <StageProgress currentStage={product.stato} />
          )}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Dati prodotto" subtitle="FR-01" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-5 text-sm">
            <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Vestibilità</dt><dd className="mt-0.5 text-heemia-black">{product.vestibilita ?? '—'}</dd></div>
            <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Taglie</dt><dd className="font-mono-heemia mt-0.5 text-heemia-black">{product.taglieDisponibili.join(', ') || '—'}</dd></div>
            <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Colori</dt><dd className="mt-0.5 text-heemia-black">{product.coloriDisponibili.join(', ') || '—'}</dd></div>
            <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Prezzo showroom</dt><dd className="font-mono-heemia mt-0.5 text-heemia-black">{formatCurrency(product.prezzoShowroom)}</dd></div>
            <div className="col-span-2">
              <dt className="flex items-center gap-1.5 font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                Descrizione breve <Badge variant={product.descrizioneBreveStato === 'approvata' ? 'success' : 'warning'}>{product.descrizioneBreveStato === 'approvata' ? 'Approvata' : 'Bozza'}</Badge>
              </dt>
              <dd className="mt-1.5 text-heemia-black">{product.descrizioneBreve ?? '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="flex items-center gap-1.5 font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                Consigli di cura <Badge variant={product.consigliCuraStato === 'approvata' ? 'success' : 'warning'}>{product.consigliCuraStato === 'approvata' ? 'Approvata' : 'Bozza'}</Badge>
              </dt>
              <dd className="mt-1.5 text-heemia-black">{product.consigliCura ?? '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Varianti" subtitle="FR-03" />
          <div className="p-5">
            <DataTable columns={variantColumns} rows={variants} keyExtractor={(v) => v.id} emptyTitle="Nessuna variante" emptyDescription="Nessuna combinazione taglia/colore censita per questo prodotto." />
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader title="Scheda tecnica" subtitle="FR-14 — preliminare, piazzamento, finale" />
        <div className="p-5">
          {sheets.length === 0 ? (
            <EmptyState
              title="Nessuna scheda tecnica"
              description={
                step
                  ? (step.motivoBlocco ?? checkAdvance(step).reason ?? 'Scheda tecnica non ancora creata per questo prodotto.')
                  : 'Scheda tecnica non ancora creata per questo prodotto.'
              }
            />
          ) : (
            <div>
              <div className="mb-5 flex gap-5 border-b border-heemia-border">
                {sheets.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveVersion(s.versione)}
                    className={`font-mono-heemia -mb-px border-b-2 pb-2 text-[11px] uppercase tracking-[0.06em] transition-colors ${
                      activeVersion === s.versione
                        ? 'border-heemia-carmine text-heemia-black'
                        : 'border-transparent text-heemia-grey hover:text-heemia-black'
                    }`}
                  >
                    {VERSION_LABEL[s.versione]}
                  </button>
                ))}
              </div>
              {activeSheet && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Composizione</p><p className="mt-0.5 text-heemia-black">{activeSheet.composizioneCompleta}</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Peso capo</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{activeSheet.pesoCapoGrammi}g</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Lavorazione</p><p className="mt-0.5 text-heemia-black">{activeSheet.lavorazione}</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Difficoltà</p><p className="mt-0.5 text-heemia-black capitalize">{activeSheet.difficoltaProduttiva}</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Tempi stimati</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{activeSheet.tempiStimatiOre}h</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Lavaggio consigliato</p><p className="mt-0.5 text-heemia-black">{activeSheet.lavaggioConsigliato}</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Tessuto principale</p><p className="font-display mt-0.5 italic text-heemia-black">{materials.find((m) => m.id === activeSheet.tessutoPrincipaleId)?.nome ?? '—'}</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Accessori</p><p className="mt-0.5 text-heemia-black">{activeSheet.accessoriIds.map((aid) => accessories.find((a) => a.id === aid)?.nome).filter(Boolean).join(', ') || '—'}</p></div>
                  <div className="col-span-2 sm:col-span-3">
                    <p className="font-mono-heemia mb-1.5 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Costi diretti scheda</p>
                    <div className="font-mono-heemia flex flex-wrap gap-5 text-heemia-black">
                      <span>Tessuto {formatCurrency(activeSheet.costoTessuto)}</span>
                      <span>Accessori {formatCurrency(activeSheet.costoAccessori)}</span>
                      <span>Manodopera {formatCurrency(activeSheet.costoManodopera)}</span>
                      <span>Packaging {formatCurrency(activeSheet.costoPackaging)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {canAccessModule(role, 'costi-margini') && margin && (
        <MarginSummaryCard margin={margin} productName={product.nome} />
      )}
      {canAccessModule(role, 'costi-margini') && !margin && (
        <EmptyState title="Margine non calcolabile" description="Manca prezzo o costo completo per calcolare il margine di questo prodotto." />
      )}

      <div className="mt-4 flex items-center gap-3">
        <ImagePlaceholder label={product.nome} className="h-16 w-16 text-lg" />
        <p className="text-xs text-heemia-grey">Nessuna immagine caricata — integrazione Google Drive prevista in fase successiva (FR-16).</p>
      </div>
    </div>
  )
}
