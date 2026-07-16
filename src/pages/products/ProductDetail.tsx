import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FileText, Upload, ExternalLink } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/States'
import { ImagePlaceholder } from '../../components/ui/ImagePlaceholder'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { StageProgress } from '../../components/production/StageProgress'
import { MarginSummaryCard } from '../../components/margins/MarginSummaryCard'
import { StatusBadge } from '../../lib/statusBadge'
import { checkAdvance } from '../../lib/production'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { TODAY } from '../../lib/alerts'
import { computeQuotaPerCapo, recomputeMargin } from '../../lib/margins'
import { productVariants, technicalSheets, margins, materials, accessories, MARGIN_THRESHOLD_PERCENT } from '../../mock'
import type { ProductVariant, TechnicalSheetVersion } from '../../types'
import { useMockStore } from '../../context/MockStore'
import { useRole } from '../../context/RoleContext'
import { canAccessModule, canEdit } from '../../lib/permissions'

const VERSION_LABEL: Record<TechnicalSheetVersion, string> = {
  preliminare: 'Preliminare',
  piazzamento: 'Piazzamento taglio',
  finale: 'Finale',
}

export function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const { role } = useRole()
  const { productionSteps, products, fixedCostItems, capiProdottiAnnui } = useMockStore()
  const product = products.find((p) => p.id === id)
  const sheets = technicalSheets.filter((ts) => ts.productId === id)
  const [activeVersion, setActiveVersion] = useState<TechnicalSheetVersion | null>(
    sheets.find((s) => s.versione === 'finale')?.versione ?? sheets[0]?.versione ?? null,
  )
  const activeSheet = sheets.find((s) => s.versione === activeVersion) ?? sheets[0]

  // DEC-021: documento PDF per versione, aggiunto sopra ai campi strutturati (non li sostituisce —
  // FR-09 legge costoTessuto/costoAccessori ecc. da lì). Stato locale: il prototipo non ha upload
  // reale né backend (DEC-015), quindi "caricare" un PDF significa collegare un link (stile Drive,
  // FR-16), tenuto in memoria per la sessione — si perde tornando alla lista prodotti, coerente con
  // il resto dei dati mock non persistenti di questa pagina.
  const [pdfLinks, setPdfLinks] = useState<Record<string, { url: string; caricatoIl: string }>>(() =>
    Object.fromEntries(
      sheets.filter((s) => s.pdfUrl).map((s) => [s.id, { url: s.pdfUrl!, caricatoIl: s.pdfCaricatoIl ?? s.creataIl }]),
    ),
  )
  const [uploadingSheetId, setUploadingSheetId] = useState<string | null>(null)
  const [uploadValue, setUploadValue] = useState('')

  if (!product) {
    return <EmptyState title="Prodotto non trovato" description="Il codice prodotto richiesto non esiste tra i dati mock." />
  }

  const step = productionSteps.find((s) => s.productId === product.id)
  const baseMargin = margins.find((m) => m.productId === product.id)
  const quotaPerCapo = computeQuotaPerCapo(fixedCostItems, capiProdottiAnnui)
  const margin = baseMargin ? recomputeMargin(baseMargin, quotaPerCapo, MARGIN_THRESHOLD_PERCENT) : undefined
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
        <CardHeader title="Pipeline produzione" />
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
          <CardHeader title="Dati prodotto" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-5 text-sm">
            <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Vestibilità</dt><dd className="mt-0.5 text-heemia-black">{product.vestibilita ?? '–'}</dd></div>
            <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Taglie</dt><dd className="font-mono-heemia mt-0.5 text-heemia-black">{product.taglieDisponibili.join(', ') || '–'}</dd></div>
            <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Colori</dt><dd className="mt-0.5 text-heemia-black">{product.coloriDisponibili.join(', ') || '–'}</dd></div>
            <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Prezzo showroom</dt><dd className="font-mono-heemia mt-0.5 text-heemia-black">{formatCurrency(product.prezzoShowroom)}</dd></div>
            <div className="col-span-2">
              <dt className="flex items-center gap-1.5 font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                Descrizione breve <Badge variant={product.descrizioneBreveStato === 'approvata' ? 'success' : 'warning'}>{product.descrizioneBreveStato === 'approvata' ? 'Approvata' : 'Bozza'}</Badge>
              </dt>
              <dd className="mt-1.5 text-heemia-black">{product.descrizioneBreve ?? '–'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="flex items-center gap-1.5 font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                Consigli di cura <Badge variant={product.consigliCuraStato === 'approvata' ? 'success' : 'warning'}>{product.consigliCuraStato === 'approvata' ? 'Approvata' : 'Bozza'}</Badge>
              </dt>
              <dd className="mt-1.5 text-heemia-black">{product.consigliCura ?? '–'}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Varianti" />
          <div className="p-5">
            <DataTable columns={variantColumns} rows={variants} keyExtractor={(v) => v.id} emptyTitle="Nessuna variante" emptyDescription="Nessuna combinazione taglia/colore censita per questo prodotto." />
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader title="Scheda tecnica" subtitle="Preliminare, piazzamento, finale" />
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
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-heemia-border bg-heemia-cream px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <FileText aria-hidden className="h-4 w-4 shrink-0 text-heemia-grey" />
                    {pdfLinks[activeSheet.id] ? (
                      <div>
                        <a
                          href={pdfLinks[activeSheet.id].url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-heemia-black hover:underline"
                        >
                          Apri documento PDF <ExternalLink aria-hidden className="h-3 w-3" />
                        </a>
                        <p className="text-xs text-heemia-grey">Caricato il {formatDateIt(pdfLinks[activeSheet.id].caricatoIl)}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-heemia-grey">Nessun PDF collegato per questa versione.</p>
                    )}
                  </div>
                  {canEdit(role) && uploadingSheetId !== activeSheet.id && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setUploadingSheetId(activeSheet.id)
                        setUploadValue(pdfLinks[activeSheet.id]?.url ?? '')
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Upload aria-hidden className="h-3.5 w-3.5" />
                        {pdfLinks[activeSheet.id] ? 'Sostituisci PDF' : 'Carica PDF'}
                      </span>
                    </Button>
                  )}
                </div>
              )}

              {activeSheet && uploadingSheetId === activeSheet.id && (
                <div className="mb-5 flex flex-wrap items-center gap-2 rounded-[3px] border border-heemia-border-strong bg-white p-3">
                  <input
                    type="text"
                    value={uploadValue}
                    onChange={(e) => setUploadValue(e.target.value)}
                    placeholder="Link Drive al PDF…"
                    className="min-w-[16rem] flex-1 rounded-[3px] border border-heemia-border px-3 py-1.5 text-sm text-heemia-black focus:border-heemia-black focus:outline-none"
                  />
                  <Button
                    onClick={() => {
                      if (!uploadValue.trim()) return
                      setPdfLinks((prev) => ({
                        ...prev,
                        [activeSheet.id]: { url: uploadValue.trim(), caricatoIl: TODAY.toISOString() },
                      }))
                      setUploadingSheetId(null)
                    }}
                  >
                    Salva collegamento
                  </Button>
                  <Button variant="ghost" onClick={() => setUploadingSheetId(null)}>Annulla</Button>
                </div>
              )}

              {activeSheet && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Composizione</p><p className="mt-0.5 text-heemia-black">{activeSheet.composizioneCompleta}</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Peso capo</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{activeSheet.pesoCapoGrammi}g</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Lavorazione</p><p className="mt-0.5 text-heemia-black">{activeSheet.lavorazione}</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Difficoltà</p><p className="mt-0.5 text-heemia-black capitalize">{activeSheet.difficoltaProduttiva}</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Tempi stimati</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{activeSheet.tempiStimatiOre}h</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Lavaggio consigliato</p><p className="mt-0.5 text-heemia-black">{activeSheet.lavaggioConsigliato}</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Tessuto principale</p><p className="font-display mt-0.5 italic text-heemia-black">{materials.find((m) => m.id === activeSheet.tessutoPrincipaleId)?.nome ?? '–'}</p></div>
                  <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Accessori</p><p className="mt-0.5 text-heemia-black">{activeSheet.accessoriIds.map((aid) => accessories.find((a) => a.id === aid)?.nome).filter(Boolean).join(', ') || '–'}</p></div>
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
        <p className="text-xs text-heemia-grey">Nessuna immagine caricata: integrazione Google Drive prevista in fase successiva.</p>
      </div>
    </div>
  )
}
