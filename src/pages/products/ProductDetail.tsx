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
import { checkAdvance, stageLabel } from '../../lib/production'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { TODAY } from '../../lib/alerts'
import { computeQuotaPerCapo, recomputeMargin } from '../../lib/margins'
import { productVariants, technicalSheets, margins, materials, accessories, MARGIN_THRESHOLD_PERCENT } from '../../mock'
import type { Material, ProductVariant, TechnicalSheet, TechnicalSheetVersion } from '../../types'
import { useMockStore } from '../../context/MockStore'
import { useRole } from '../../context/RoleContext'
import { canAccessModule, canEdit } from '../../lib/permissions'

const VERSION_LABEL: Record<TechnicalSheetVersion, string> = {
  preliminare: 'Preliminare',
  piazzamento: 'Piazzamento taglio',
  finale: 'Finale',
}

type TabId = 'panoramica' | 'tessuto' | 'costi' | 'tecnico' | 'produzione' | 'shopify' | 'media' | 'note'

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{label}</p>
      <div className="mt-0.5 text-sm text-heemia-black">{children}</div>
    </div>
  )
}

function FabricRow({ material, ruolo }: { material: Material; ruolo: string }) {
  const residui = material.metriAcquistati - material.metriUtilizzati
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="font-display italic text-heemia-black">{material.nome}</p>
        <p className="font-mono-heemia text-[11px] text-heemia-grey">{material.codice} · {ruolo}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-heemia-black">{material.composizione}</span>
        <span className="text-heemia-grey">{material.colore}</span>
        <span className="font-mono-heemia">{formatCurrency(material.prezzoAlMetro)}/{material.unitaMisura}</span>
        <span className="font-mono-heemia text-heemia-grey">{residui.toFixed(1)} {material.unitaMisura} residui</span>
        <StatusBadge status={material.stato} />
        <Link to="/inventario/tessuti" className="text-xs text-heemia-grey hover:text-heemia-black hover:underline">
          Apri in inventario →
        </Link>
      </div>
    </li>
  )
}

export function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const { role } = useRole()
  const { productionSteps, products, fixedCostItems, capiProdottiAnnui } = useMockStore()
  const product = products.find((p) => p.id === id)
  const sheets = technicalSheets.filter((ts) => ts.productId === id)

  const [activeTab, setActiveTab] = useState<TabId>('panoramica')
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

  // Note operative di sessione (nessun backend: si perdono al reload, come il resto dei mock).
  const [sessionNote, setSessionNote] = useState('')
  const [savedNotes, setSavedNotes] = useState<{ testo: string; data: string }[]>([])

  if (!product) {
    return <EmptyState title="Prodotto non trovato" description="Il codice prodotto richiesto non esiste tra i dati mock." />
  }

  const step = productionSteps.find((s) => s.productId === product.id)
  const baseMargin = margins.find((m) => m.productId === product.id)
  const quotaPerCapo = computeQuotaPerCapo(fixedCostItems, capiProdottiAnnui)
  const margin = baseMargin ? recomputeMargin(baseMargin, quotaPerCapo, MARGIN_THRESHOLD_PERCENT) : undefined
  const variants = productVariants.filter((v) => v.productId === product.id)
  const canSeeEconomics = canAccessModule(role, 'costi-margini')

  // Tab Tessuto: usa la versione finale se esiste, altrimenti la più recente disponibile.
  const fabricSheet: TechnicalSheet | undefined = sheets.find((s) => s.versione === 'finale') ?? sheets[0]
  const mainFabric = fabricSheet ? materials.find((m) => m.id === fabricSheet.tessutoPrincipaleId) : undefined
  const secondaryFabrics = fabricSheet
    ? fabricSheet.tessutiSecondariId.map((mid) => materials.find((m) => m.id === mid)).filter((m): m is Material => Boolean(m))
    : []
  const sheetAccessories = fabricSheet
    ? fabricSheet.accessoriIds.map((aid) => accessories.find((a) => a.id === aid)).filter(Boolean)
    : []

  const TABS: { id: TabId; label: string; visible: boolean }[] = [
    { id: 'panoramica', label: 'Panoramica', visible: true },
    { id: 'tessuto', label: 'Tessuto', visible: true },
    { id: 'costi', label: 'Costi & Margini', visible: canSeeEconomics },
    { id: 'tecnico', label: 'Tecnico', visible: true },
    { id: 'produzione', label: 'Produzione', visible: true },
    { id: 'shopify', label: 'Shopify', visible: true },
    { id: 'media', label: 'Media', visible: true },
    { id: 'note', label: 'Note', visible: true },
  ]

  const variantColumns: DataTableColumn<ProductVariant>[] = [
    { header: 'SKU', accessor: (v) => v.sku, className: 'font-mono-heemia text-[12px]' },
    { header: 'Taglia', accessor: (v) => v.taglia },
    { header: 'Colore', accessor: (v) => v.colore },
    { header: 'Stock', accessor: (v) => v.stockDisponibile, align: 'right' },
    { header: 'Riservato', accessor: (v) => v.stockRiservato, align: 'right' },
    { header: 'Stato', accessor: (v) => <StatusBadge status={v.statoDisponibilita} /> },
  ]

  const saveNote = () => {
    if (!sessionNote.trim()) return
    setSavedNotes((prev) => [{ testo: sessionNote.trim(), data: TODAY.toISOString() }, ...prev])
    setSessionNote('')
  }

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

      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 border-b border-heemia-border">
        {TABS.filter((t) => t.visible).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px border-b-2 pb-2.5 text-sm transition-colors ${
              activeTab === tab.id
                ? 'border-heemia-carmine font-medium text-heemia-black'
                : 'border-transparent text-heemia-grey hover:text-heemia-black'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'panoramica' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Dati prodotto" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-5 text-sm">
              <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Vestibilità</dt><dd className="mt-0.5 text-heemia-black">{product.vestibilita ?? '–'}</dd></div>
              <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Fase pipeline</dt><dd className="mt-0.5 text-heemia-black">{stageLabel(step?.fase ?? product.stato)}</dd></div>
              <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Taglie</dt><dd className="font-mono-heemia mt-0.5 text-heemia-black">{product.taglieDisponibili.join(', ') || '–'}</dd></div>
              <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Colori</dt><dd className="mt-0.5 text-heemia-black">{product.coloriDisponibili.join(', ') || '–'}</dd></div>
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
            <CardHeader title="Varianti" subtitle={`${variants.length} combinazioni taglia/colore`} />
            <div className="p-5">
              <DataTable columns={variantColumns} rows={variants} keyExtractor={(v) => v.id} emptyTitle="Nessuna variante" emptyDescription="Nessuna combinazione taglia/colore censita per questo prodotto." />
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'tessuto' && (
        <Card>
          <CardHeader
            title="Tessuti e accessori del capo"
            subtitle={fabricSheet ? `Dalla scheda tecnica ${VERSION_LABEL[fabricSheet.versione].toLowerCase()}` : undefined}
          />
          <div className="p-5">
            {!fabricSheet ? (
              <EmptyState title="Nessun tessuto collegato" description="Il tessuto viene collegato tramite la scheda tecnica, non ancora creata per questo prodotto." />
            ) : (
              <div>
                <ul className="divide-y divide-heemia-border">
                  {mainFabric && <FabricRow material={mainFabric} ruolo="Tessuto principale" />}
                  {secondaryFabrics.map((m) => (
                    <FabricRow key={m.id} material={m} ruolo="Tessuto secondario" />
                  ))}
                  {!mainFabric && secondaryFabrics.length === 0 && (
                    <li className="py-3 text-sm text-heemia-grey">Nessun tessuto collegato nella scheda tecnica.</li>
                  )}
                </ul>

                <div className="mt-5 border-t border-heemia-border pt-4">
                  <p className="font-mono-heemia mb-2 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Accessori collegati</p>
                  {sheetAccessories.length === 0 ? (
                    <p className="text-sm text-heemia-grey">Nessun accessorio collegato.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {sheetAccessories.map((a) => (
                        <Badge key={a!.id} variant="neutral">{a!.nome}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-heemia-border pt-4 sm:grid-cols-3">
                  <DetailField label="Composizione completa">{fabricSheet.composizioneCompleta}</DetailField>
                  <DetailField label="Lavaggio consigliato">{fabricSheet.lavaggioConsigliato}</DetailField>
                  <DetailField label="Trattamenti">{fabricSheet.trattamenti || '–'}</DetailField>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'costi' && canSeeEconomics && (
        <div className="space-y-4">
          {margin ? (
            <MarginSummaryCard margin={margin} productName={product.nome} />
          ) : (
            <EmptyState title="Margine non calcolabile" description="Manca prezzo o costo completo per calcolare il margine di questo prodotto." />
          )}

          {activeSheet && (
            <Card>
              <CardHeader title="Costi diretti da scheda tecnica" subtitle={`Versione ${VERSION_LABEL[activeSheet.versione].toLowerCase()}`} />
              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
                <DetailField label="Tessuto"><span className="font-mono-heemia">{formatCurrency(activeSheet.costoTessuto)}</span></DetailField>
                <DetailField label="Accessori"><span className="font-mono-heemia">{formatCurrency(activeSheet.costoAccessori)}</span></DetailField>
                <DetailField label="Manodopera"><span className="font-mono-heemia">{formatCurrency(activeSheet.costoManodopera)}</span></DetailField>
                <DetailField label="Packaging"><span className="font-mono-heemia">{formatCurrency(activeSheet.costoPackaging)}</span></DetailField>
                <DetailField label="Altri diretti"><span className="font-mono-heemia">{formatCurrency(activeSheet.altriCostiDiretti)}</span></DetailField>
                <DetailField label="Quota costi fissi"><span className="font-mono-heemia">{formatCurrency(quotaPerCapo)}</span></DetailField>
              </div>
            </Card>
          )}

          <p className="text-xs text-heemia-grey">
            La quota costi fissi per capo si configura in <Link to="/margini" className="underline hover:text-heemia-black">Costi e margini</Link>.
          </p>
        </div>
      )}

      {activeTab === 'tecnico' && (
        <Card>
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
                    <DetailField label="Composizione">{activeSheet.composizioneCompleta}</DetailField>
                    <DetailField label="Peso capo"><span className="font-mono-heemia">{activeSheet.pesoCapoGrammi}g</span></DetailField>
                    <DetailField label="Lavorazione">{activeSheet.lavorazione}</DetailField>
                    <DetailField label="Difficoltà"><span className="capitalize">{activeSheet.difficoltaProduttiva}</span></DetailField>
                    <DetailField label="Tempi stimati"><span className="font-mono-heemia">{activeSheet.tempiStimatiOre}h</span></DetailField>
                    <DetailField label="Lavaggio consigliato">{activeSheet.lavaggioConsigliato}</DetailField>
                    <DetailField label="Tessuto principale">
                      <span className="font-display italic">{materials.find((m) => m.id === activeSheet.tessutoPrincipaleId)?.nome ?? '–'}</span>
                    </DetailField>
                    <DetailField label="Accessori">
                      {activeSheet.accessoriIds.map((aid) => accessories.find((a) => a.id === aid)?.nome).filter(Boolean).join(', ') || '–'}
                    </DetailField>
                    <DetailField label="Creata il"><span className="font-mono-heemia">{formatDateIt(activeSheet.creataIl)}</span></DetailField>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'produzione' && (
        <Card>
          <CardHeader title="Pipeline produzione" subtitle="Avanzamento del capo tra le 13 fasi, con eventuale blocco per scheda tecnica assente." />
          <div className="p-5">
            {step ? (
              <div>
                <StageProgress
                  currentStage={step.fase}
                  blocked={step.bloccata}
                  blockReason={step.motivoBlocco ?? checkAdvance(step).reason}
                />
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-heemia-border pt-4 sm:grid-cols-4">
                  <DetailField label="Responsabile">{step.responsabile}</DetailField>
                  <DetailField label="Iniziato il"><span className="font-mono-heemia">{step.dataInizio ? formatDateIt(step.dataInizio) : '–'}</span></DetailField>
                  <DetailField label="Stato">
                    {step.bloccata ? <span className="text-heemia-carmine">Bloccata</span> : 'In corso'}
                  </DetailField>
                  <DetailField label="Note fase">{step.note ?? '–'}</DetailField>
                </div>
                <p className="mt-4 text-xs text-heemia-grey">
                  L'avanzamento tra le fasi si gestisce dalla <Link to="/produzione" className="underline hover:text-heemia-black">Pipeline produzione</Link>.
                </p>
              </div>
            ) : (
              <div>
                <StageProgress currentStage={product.stato} />
                <p className="mt-4 text-sm text-heemia-grey">Nessuno step di produzione attivo per questo prodotto.</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'shopify' && (
        <Card>
          <CardHeader title="Shopify ed e-commerce" subtitle="Predisposizione dati: nessuna sincronizzazione live in questa fase." />
          <div className="p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <DetailField label="Stato pubblicazione"><StatusBadge status={product.statoPubblicazioneShopify} /></DetailField>
              <DetailField label="Disponibilità online">{product.disponibilitaOnline ? 'Sì' : 'No'}</DetailField>
              <DetailField label="Disponibilità showroom">{product.disponibilitaShowroom ? 'Sì' : 'No'}</DetailField>
              <DetailField label="Visibile in showroom app">{product.visibileShowroom ? 'Sì' : 'No'}</DetailField>
              <DetailField label="Prezzo vendita (IVA incl.)"><span className="font-mono-heemia">{product.prezzoVendita > 0 ? formatCurrency(product.prezzoVendita) : '–'}</span></DetailField>
              <DetailField label="Prezzo netto IVA"><span className="font-mono-heemia">{product.prezzoNettoIva > 0 ? formatCurrency(product.prezzoNettoIva) : '–'}</span></DetailField>
              <DetailField label="Prezzo showroom"><span className="font-mono-heemia">{product.prezzoShowroom > 0 ? formatCurrency(product.prezzoShowroom) : '–'}</span></DetailField>
              <DetailField label="Prezzo consigliato"><span className="font-mono-heemia">{product.prezzoConsigliato > 0 ? formatCurrency(product.prezzoConsigliato) : '–'}</span></DetailField>
            </div>
            <div className="mt-5 border-t border-heemia-border pt-4">
              <p className="font-mono-heemia mb-1.5 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Descrizione e-commerce</p>
              <p className="text-sm text-heemia-black">{product.descrizioneEcommerce ?? 'Non ancora scritta.'}</p>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'media' && (
        <Card>
          <CardHeader title="Media" subtitle="Immagini prodotto: integrazione Google Drive prevista in fase successiva." />
          <div className="p-5">
            {product.immaginiUrl.length === 0 ? (
              <div className="flex items-center gap-4">
                <ImagePlaceholder label={product.nome} className="h-28 w-28 text-2xl" />
                <p className="max-w-sm text-sm text-heemia-grey">
                  Nessuna immagine caricata. Le immagini verranno collegate da Google Drive quando l'integrazione sarà attiva.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {product.immaginiUrl.map((url) => (
                  <img key={url} src={url} alt={product.nome} className="aspect-square w-full rounded-[3px] border border-heemia-border object-cover" />
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'note' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Note strutturate" subtitle="Descrizione tecnica e note di produzione dalla scheda." />
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <DetailField label="Descrizione tecnica">{product.descrizioneTecnica ?? '–'}</DetailField>
              <DetailField label="Note di produzione (scheda tecnica)">{activeSheet?.noteProduzione ?? '–'}</DetailField>
            </div>
          </Card>

          <Card>
            <CardHeader title="Note operative" subtitle="Annotazioni libere di sessione: senza backend non vengono salvate al reload." />
            <div className="p-5">
              {canEdit(role) ? (
                <div className="mb-4 flex flex-col gap-2">
                  <textarea
                    value={sessionNote}
                    onChange={(e) => setSessionNote(e.target.value)}
                    rows={3}
                    placeholder="Scrivi una nota su questo prodotto…"
                    className="w-full rounded-[3px] border border-heemia-border p-3 text-sm text-heemia-black focus:border-heemia-black focus:outline-none"
                  />
                  <div>
                    <Button onClick={saveNote} disabled={!sessionNote.trim()}>Aggiungi nota</Button>
                  </div>
                </div>
              ) : (
                <p className="mb-4 text-xs text-heemia-grey">Sola lettura per questo ruolo.</p>
              )}
              {savedNotes.length === 0 ? (
                <p className="text-sm text-heemia-grey">Nessuna nota per questa sessione.</p>
              ) : (
                <ul className="divide-y divide-heemia-border">
                  {savedNotes.map((n, i) => (
                    <li key={i} className="py-3">
                      <p className="text-sm text-heemia-black">{n.testo}</p>
                      <p className="font-mono-heemia mt-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{formatDateIt(n.data)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
