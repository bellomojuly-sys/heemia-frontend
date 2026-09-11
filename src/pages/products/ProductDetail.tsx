import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FileText, Upload, ExternalLink, Printer, Plus, Pencil } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/States'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { StageProgress } from '../../components/production/StageProgress'
import { MarginSummaryCard } from '../../components/margins/MarginSummaryCard'
import { EditProductForm } from '../../components/products/EditProductForm'
import { AddVariantForm } from '../../components/products/AddVariantForm'
import { TechnicalSheetForm } from '../../components/products/TechnicalSheetForm'
import { SheetCostBreakdown } from '../../components/products/SheetCostBreakdown'
import { SheetPdfDocument, type PdfVariante } from '../../components/products/SheetPdfDocument'
import { PatternDocuments } from '../../components/products/PatternDocuments'
import { ProductMedia } from '../../components/products/ProductMedia'
import { PubblicaShopify } from '../../components/products/PubblicaShopify'
import { PrezzoCalcolato } from '../../components/products/PrezzoCalcolato'
import { SampleApproval } from '../../components/production/SampleApproval'
import { StatusBadge } from '../../lib/statusBadge'
import { checkAdvance, stageLabel } from '../../lib/production'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { TODAY } from '../../lib/alerts'
import { computeQuotaPerCapo, recomputeMargin } from '../../lib/margins'
import { computeSheetCost } from '../../lib/sheetCost'
import { useMarginThreshold } from '../../hooks/useMarginThreshold'
import { useLiveMargins } from '../../hooks/useLiveMargins'
import { useServerPrezzoConsigliato } from '../../hooks/useServerPrezzoConsigliato'
import { FONTE_COMPOSIZIONE_LABEL, useServerComposizione } from '../../hooks/useServerComposizione'
import { etichettaTaglia, ordinaTaglie } from '../../lib/taglie'
import type { Material, ProductVariant, TechnicalSheet, TechnicalSheetVersion } from '../../types'
import { useDataStore } from '../../context/DataStore'
import { useRole } from '../../context/RoleContext'
import { useGoatAlert } from '../../context/GoatAlertContext'
import { ApiError } from '../../lib/api'
import { QuantitaInput } from '../../components/ui/QuantitaInput'
import { canAccessModule, canDeleteProducts, canWrite } from '../../lib/permissions'
import { DeleteProductModal } from '../../components/products/DeleteProductModal'

// Ordine storico delle vecchie versioni: serve solo a scegliere quale scheda mostrare
// quando un prodotto ne ha più di una in archivio.
const VERSION_ORDER: TechnicalSheetVersion[] = ['preliminare', 'finale', 'piazzamento']

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
        <p className="font-display text-heemia-black">{material.nome}</p>
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
  const navigate = useNavigate()
  const {
    productionSteps, products, productVariants, updateProduct, addVariant, updateVariantQuantities,
    fixedCostItems, capiProdottiAnnui, technicalSheets, invoices, suppliers, addTechnicalSheet, persistenzaAvviso,
    setSheetPdfUrl,
    materials, accessories, inventoryRecords,
  } = useDataStore()
  const { avvisa } = useGoatAlert()
  // Margini dal server: stessa formula, ma su prodotti e schede reali.
  const liveMargins = useLiveMargins()
  const MARGIN_THRESHOLD_PERCENT = useMarginThreshold()
  const product = products.find((p) => p.id === id)
  // I tessuti collegati al capo si risolvono contro il magazzino gia' in memoria: il legame
  // arriva come elenco di id (DEC-067), i dati del tessuto stanno nello store.
  const tessutiDelCapo = (product?.materialiCollegatiIds ?? [])
    .map((mid) => materials.find((m) => m.id === mid))
    .filter((m): m is Material => Boolean(m))
  // Una sola scheda tecnica per prodotto: quella compilata qui dentro. Le vecchie schede
  // Finale e Piazzamento restano leggibili, ma non se ne creano di nuove — cartamodelli e
  // piazzamenti sono documenti della modellista e stanno nella sezione dedicata.
  const sheets = technicalSheets
    .filter((ts) => ts.productId === id)
    .slice()
    .sort((a, b) => VERSION_ORDER.indexOf(a.versione) - VERSION_ORDER.indexOf(b.versione))

  const [activeTab, setActiveTab] = useState<TabId>('panoramica')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [addVariantOpen, setAddVariantOpen] = useState(false)
  const [sheetFormId, setSheetFormId] = useState<string | null>(null)
  // Quale versione del documento stampare. Il montaggio deve precedere window.print(),
  // altrimenti si stampa quella precedente: la stampa parte dall'effetto qui sotto.
  const [pdfVariante, setPdfVariante] = useState<PdfVariante>('completa')
  const [stampaRichiesta, setStampaRichiesta] = useState(false)

  useEffect(() => {
    if (!stampaRichiesta) return
    setStampaRichiesta(false)
    window.print()
  }, [stampaRichiesta])
  const activeSheet = sheets[0]

  // DEC-021: documento PDF per versione, aggiunto sopra ai campi strutturati (non li sostituisce —
  // FR-09 legge costoTessuto/costoAccessori ecc. da lì). "Caricare" un PDF qui significa collegare
  // un link (stile Drive, FR-16): il link vive sulla scheda nel database (colonna `pdf_url`), non
  // nello stato della pagina — prima restava in memoria e spariva al reload.
  const [uploadingSheetId, setUploadingSheetId] = useState<string | null>(null)
  const [uploadValue, setUploadValue] = useState('')

  // Note operative di sessione (nessun backend: si perdono al reload, come il resto dei mock).
  const [sessionNote, setSessionNote] = useState('')
  const [savedNotes, setSavedNotes] = useState<{ testo: string; data: string }[]>([])

  // Prezzo e composizione non sono campi del capo: sono risultati, e li calcola il server —
  // il prezzo dai costi della scheda tecnica, la composizione dai tessuti. Qui si leggono per
  // mostrarli, e per proporre di applicarli quando il capo dice ancora altro.
  //
  // Stanno **sopra** al `return` per prodotto non trovato qui sotto: un hook chiamato dopo un
  // return condizionale cambia l'ordine degli hook fra un render e l'altro, e React se ne
  // accorge rompendo la pagina. Per questo prendono `id` e non `product.id`: senza prodotto
  // non chiedono niente al server.
  const { prezzo: prezzoCalcolato, applica: applicaPrezzo } = useServerPrezzoConsigliato(id)
  const { composizione: composizioneRicavata, inCorso: composizioneInCorso, applica: applicaComposizione } =
    useServerComposizione(id)
  const [prezzoInCorso, setPrezzoInCorso] = useState(false)

  if (!product) {
    return <EmptyState title="Prodotto non trovato" description="Il codice prodotto richiesto non esiste tra i dati mock." />
  }

  const step = productionSteps.find((s) => s.productId === product.id)
  const baseMargin = liveMargins.find((m) => m.productId === product.id)
  const quotaPerCapo = computeQuotaPerCapo(fixedCostItems, capiProdottiAnnui)
  // Se la scheda tecnica attiva ha costi strutturati compilati, quello è il costo diretto reale
  // del capo: prevale sul valore statico del mock margini, che copriva il solo tessuto.
  const sheetCost = activeSheet ? computeSheetCost(activeSheet, { materials, accessories, invoices }) : undefined
  const hasSheetCost = Boolean(sheetCost && sheetCost.righe.length > 0 && sheetCost.costoTotaleUnitario > 0)
  const marginBase = baseMargin && hasSheetCost ? { ...baseMargin, costoDiretto: sheetCost!.costoTotaleUnitario } : baseMargin
  const margin = marginBase ? recomputeMargin(marginBase, quotaPerCapo, MARGIN_THRESHOLD_PERCENT) : undefined
  const variants = productVariants.filter((v) => v.productId === product.id)
  const stockModello = variants.reduce((sum, v) => sum + v.stockDisponibile, 0)
  const canSeeEconomics = canAccessModule(role, 'costi-margini')
  const userCanEdit = canWrite(role, 'prodotti')

  // Tab Tessuto: le schede nuove collegano tessuti e accessori nelle righe strutturate.
  // I tre array legacy restano come fallback per le vecchie schede già presenti.
  const fabricSheet: TechnicalSheet | undefined = activeSheet
  const fabricIds = fabricSheet
    ? Array.from(new Set([
        fabricSheet.tessutoPrincipaleId,
        ...(fabricSheet.materiali ?? []).map((riga) => riga.materialId),
        ...fabricSheet.tessutiSecondariId,
      ].filter((materialId): materialId is string => Boolean(materialId))))
    : []
  const linkedFabrics = fabricIds
    .map((materialId) => materials.find((materiale) => materiale.id === materialId))
    .filter((materiale): materiale is Material => Boolean(materiale))
  const mainFabric = linkedFabrics[0]
  const secondaryFabrics = linkedFabrics.slice(1)
  const accessoryIds = fabricSheet
    ? Array.from(new Set([
        ...(fabricSheet.materiali ?? []).map((riga) => riga.accessoryId),
        ...fabricSheet.accessoriIds,
      ].filter((accessoryId): accessoryId is string => Boolean(accessoryId))))
    : []
  const sheetAccessories = accessoryIds
    .map((accessoryId) => accessories.find((accessorio) => accessorio.id === accessoryId))
    .filter((accessorio) => Boolean(accessorio))

  const TABS: { id: TabId; label: string; visible: boolean }[] = [
    { id: 'panoramica', label: 'Panoramica', visible: true },
    { id: 'tessuto', label: 'Tessuto', visible: true },
    { id: 'costi', label: 'Costi & Margini', visible: canSeeEconomics },
    // Scheda tecnica e documenti della modellista sono lo stesso lavoro sul capo: un unico tab.
    { id: 'tecnico', label: 'Tecnico & Modellista', visible: true },
    { id: 'produzione', label: 'Produzione', visible: true },
    { id: 'shopify', label: 'Shopify', visible: true },
    { id: 'media', label: 'Media', visible: true },
    { id: 'note', label: 'Note', visible: true },
  ]

  const qtyInputClass =
    'font-mono-heemia w-20 rounded-heemia border border-heemia-border bg-white px-2 py-1 text-right text-sm text-heemia-black transition-all duration-200 ease-heemia focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10'

  /**
   * Ogni modifica attende il server e, se viene rifiutata, lo dice: senza `await` un
   * rifiuto spariva in una promise non gestita e il numero tornava indietro da solo.
   */
  const salva = async (azione: Promise<unknown>, ricaduta: string) => {
    try {
      await azione
    } catch (e) {
      avvisa('salvataggio', { testo: e instanceof ApiError ? e.message : ricaduta })
    }
  }

  // Le giacenze si modificano **per ubicazione**, non sul totale. Prima qui c'era una sola
  // colonna "Stock" che mostrava `stockDisponibile` (magazzino + laboratorio) ma scriveva su
  // `qtaMagazzino`: riscrivendo nel campo lo stesso numero che mostrava, la giacenza cresceva
  // della quantità in laboratorio (7 + 5 mostrava 12; confermando 12 diventava 17). Colpiva
  // ogni variante importata, che nasce tutta in laboratorio (FR-49/DEC-045).
  const variantColumns: DataTableColumn<ProductVariant>[] = [
    { header: 'SKU', accessor: (v) => v.sku, className: 'font-mono-heemia text-[12px]' },
    { header: 'Taglia', accessor: (v) => v.taglia },
    { header: 'Colore', accessor: (v) => v.colore },
    {
      header: 'Magazzino',
      align: 'right',
      accessor: (v) => {
        const rec = inventoryRecords.find((r) => r.variantId === v.id)
        if (!userCanEdit || !rec) return rec?.qtaMagazzino ?? v.stockDisponibile
        // In distribuzione iniziale il numero è ambiguo (capi già nel totale o mai contati?):
        // la domanda si fa in Inventario, che è l'unico posto che sa porla. Il server rifiuta
        // comunque la scrittura, ma qui è meglio non offrire un campo che verrà respinto.
        if (!rec.migrazioneCompletata) {
          return (
            <span
              className="font-mono-heemia text-heemia-grey"
              title="Distribuzione iniziale da completare: si sistema da Inventario › Prodotti finiti."
            >
              {rec.qtaMagazzino}
            </span>
          )
        }
        return (
          <QuantitaInput
            valore={rec.qtaMagazzino}
            etichetta={`Magazzino ${v.sku}`}
            className={qtyInputClass}
            onConferma={(qtaMagazzino) =>
              salva(
                updateVariantQuantities(v.id, { qtaMagazzino }),
                'Non è stato possibile aggiornare il magazzino.',
              )
            }
          />
        )
      },
    },
    {
      header: 'Laboratorio',
      align: 'right',
      accessor: (v) => {
        const rec = inventoryRecords.find((r) => r.variantId === v.id)
        return <span className="font-mono-heemia">{rec?.qtaLaboratorio ?? 0}</span>
      },
    },
    {
      header: 'Disponibile',
      align: 'right',
      accessor: (v) => (
        <span className="font-mono-heemia" title="Magazzino + laboratorio: i capi finiti in casa.">
          {v.stockDisponibile}
        </span>
      ),
    },
    {
      header: 'Riservato',
      align: 'right',
      accessor: (v) =>
        userCanEdit ? (
          <QuantitaInput
            valore={v.stockRiservato}
            etichetta={`Riservato ${v.sku}`}
            className={qtyInputClass}
            onConferma={(qtaRiservata) =>
              salva(
                updateVariantQuantities(v.id, { qtaRiservata }),
                'Non è stato possibile aggiornare i capi riservati.',
              )
            }
          />
        ) : (
          v.stockRiservato
        ),
    },
    {
      header: 'Immagine',
      accessor: (v) =>
        v.immagineUrl ? (
          <a href={v.immagineUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-heemia-black hover:underline">
            Apri →
          </a>
        ) : (
          <span className="text-xs text-heemia-grey-light">–</span>
        ),
    },
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
        subtitle={`${product.codiceProdotto} · ${product.categoria} · ${product.collezione}`}
        action={
          <div className="flex items-center gap-2">
            <Badge variant="neutral">{product.linea === 'tessile' ? 'Tessile' : 'Maglieria'}</Badge>
            <StatusBadge status={product.statoPubblicazioneShopify} />
            {canWrite(role, 'prodotti') && <Button variant="secondary" onClick={() => setEditOpen(true)}>Modifica dati</Button>}
            {/* Eliminazione (solo Admin/CEO): dopo la cancellazione il capo non esiste
                più, quindi si torna all'anagrafica invece di restare su una pagina vuota. */}
            {canDeleteProducts(role) && (
              <Button variant="ghost" onClick={() => setDeleteOpen(true)}>Elimina</Button>
            )}
          </div>
        }
      />

      {deleteOpen && (
        <DeleteProductModal
          product={product}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => navigate('/prodotti')}
        />
      )}

      {editOpen && (
        <EditProductForm
          product={product}
          onClose={() => setEditOpen(false)}
          onSave={(patch) => updateProduct(product.id, patch)}
        />
      )}

      {addVariantOpen && (
        <AddVariantForm product={product} onClose={() => setAddVariantOpen(false)} onSubmit={addVariant} />
      )}

      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 border-b border-heemia-border">
        {TABS.filter((t) => t.visible).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px rounded-t-heemia-sm border-b-2 px-2 pb-2.5 pt-1 text-sm transition-all duration-200 ease-heemia ${
              activeTab === tab.id
                ? 'border-heemia-carmine font-medium text-heemia-black'
                : 'border-transparent text-heemia-grey hover:border-heemia-border-strong hover:bg-heemia-surface-muted/40 hover:text-heemia-black'
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
              <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Taglie</dt><dd className="mt-1 flex flex-wrap gap-1">{product.taglieDisponibili.length === 0 ? <span className="text-heemia-black">–</span> : ordinaTaglie(product.taglieDisponibili).map((t) => (<span key={t} className="font-mono-heemia rounded-heemia-sm border border-heemia-border bg-heemia-surface px-1.5 py-0.5 text-[11px] uppercase tracking-[0.04em] text-heemia-black">{etichettaTaglia(t)}</span>))}</dd></div>
              <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Colori</dt><dd className="mt-0.5 text-heemia-black">{product.coloriDisponibili.join(', ') || '–'}</dd></div>
              {/* La composizione non si scrive più a mano: si ricava dai tessuti del capo.
                  Qui si vede quella salvata, e — se i tessuti ne dicono un'altra — anche
                  quella ricavata, con il pulsante per allinearle. */}
              <div className="col-span-2">
                <dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Composizione</dt>
                <dd className="mt-0.5 text-heemia-black">{product.composizione ?? '–'}</dd>
                {composizioneRicavata?.composizione &&
                  composizioneRicavata.composizione !== (product.composizione ?? '') && (
                    <dd className="mt-1.5 rounded-heemia-sm border border-dashed border-heemia-border bg-heemia-surface-muted px-2.5 py-2 text-xs text-heemia-grey">
                      Dai tessuti del capo ({FONTE_COMPOSIZIONE_LABEL[composizioneRicavata.fonte]}):{' '}
                      <span className="text-heemia-black">{composizioneRicavata.composizione}</span>
                      {composizioneRicavata.daConfermare && (
                        <span className="mt-1 block text-heemia-carmine">
                          Il capo ha più tessuti: le percentuali non si sommano fra loro, va confermata da una persona.
                        </span>
                      )}
                      {userCanEdit && (
                        <span className="mt-2 block">
                          <Button
                            variant="secondary"
                            disabled={composizioneInCorso}
                            onClick={() => {
                              void applicaComposizione()
                                .then(() => avvisa('generico', { titolo: 'Composizione aggiornata', testo: 'Ricavata dai tessuti del capo.' }))
                                .catch((e: unknown) => avvisa('salvataggio', { testo: e instanceof Error ? e.message : 'Composizione non aggiornata.' }))
                            }}
                          >
                            {composizioneInCorso ? 'Applico…' : 'Usa questa composizione'}
                          </Button>
                        </span>
                      )}
                    </dd>
                  )}
              </div>
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
            <CardHeader
              title="Varianti e quantità"
              subtitle={`${variants.length} combinazioni taglia/colore · ${stockModello} capi disponibili sul modello`}
              action={userCanEdit ? <Button variant="secondary" onClick={() => setAddVariantOpen(true)}>Aggiungi variante</Button> : undefined}
            />
            <div className="p-5">
              <DataTable columns={variantColumns} rows={variants} keyExtractor={(v) => v.id} emptyTitle="Nessuna variante" emptyDescription="Nessuna combinazione taglia/colore censita per questo prodotto. Usa 'Aggiungi variante' per crearne una con il suo stock." />
              <p className="mt-3 text-xs text-heemia-grey">
                Le quantità sono collegate all'<Link to="/inventario/prodotti-finiti" className="underline hover:text-heemia-black">inventario prodotti finiti</Link>: una modifica qui aggiorna la giacenza e viceversa.
              </p>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'tessuto' && (
        <Card>
          <CardHeader
            title="Tessuti e accessori del capo"
            subtitle={fabricSheet ? 'Dalla scheda tecnica del capo' : undefined}
          />
          <div className="p-5">
            {/* Il tessuto del capo (DEC-067) esiste anche senza scheda tecnica: e' il legame
                al magazzino, quello da cui il costo del tessuto arrivera' al costo del capo
                quando la scheda portera' i consumi. Prima questa linguetta guardava solo la
                scheda, e senza scheda diceva "nessun tessuto" anche a un capo che il tessuto
                ce l'aveva eccome. */}
            {tessutiDelCapo.length > 0 && (
              <div className="mb-5">
                <p className="font-mono-heemia mb-2 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                  Tessuto del capo
                </p>
                <ul className="divide-y divide-heemia-border">
                  {tessutiDelCapo.map((m) => <FabricRow key={m.id} material={m} ruolo="Collegato al capo" />)}
                </ul>
                <p className="mt-2 text-xs text-heemia-grey">
                  Il consumo — quanti metri servono per un capo — si compila nella scheda tecnica.
                  Finche' manca, questo costo non entra nel costo del capo.
                </p>
              </div>
            )}
            {tessutiDelCapo.length === 0 && (product?.tessuto ?? '') !== '' && (
              <div className="mb-5 rounded border border-heemia-border bg-heemia-surface-muted p-3 text-sm text-heemia-grey">
                Il capo dichiara il tessuto <span className="text-heemia-black">«{product?.tessuto}»</span>, che
                pero' non ha una riga di magazzino: il suo costo non potra' entrare nel costo del capo finche'
                qualcuno non lo collega a mano.
              </div>
            )}
            {!fabricSheet ? (
              tessutiDelCapo.length === 0 ? (
                <EmptyState title="Nessun tessuto collegato" description="Il tessuto viene collegato tramite la scheda tecnica, non ancora creata per questo prodotto." />
              ) : null
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

          {activeSheet && sheetCost && (
            <Card>
              <CardHeader
                title="Costi diretti da scheda tecnica"
                subtitle="Il dettaglio completo con la tracciabilità è nel tab Tecnico & Modellista."
              />
              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
                <DetailField label="Materiali"><span className="font-mono-heemia">{formatCurrency(sheetCost.costoMateriali)}</span></DetailField>
                <DetailField label="Accessori"><span className="font-mono-heemia">{formatCurrency(sheetCost.costoAccessori)}</span></DetailField>
                <DetailField label="Lavorazioni"><span className="font-mono-heemia">{formatCurrency(sheetCost.costoLavorazioni)}</span></DetailField>
                <DetailField label="Quota sviluppo"><span className="font-mono-heemia">{formatCurrency(sheetCost.quotaSviluppo)}</span></DetailField>
                <DetailField label="Altri diretti"><span className="font-mono-heemia">{formatCurrency(sheetCost.altriCosti)}</span></DetailField>
                <DetailField label="Quota costi fissi"><span className="font-mono-heemia">{formatCurrency(quotaPerCapo)}</span></DetailField>
              </div>
            </Card>
          )}

          <p className="text-xs text-heemia-grey">
            La quota costi fissi per capo si configura in <Link to="/margini/costi" className="underline hover:text-heemia-black">Costi e margini</Link>.
          </p>
        </div>
      )}

      {activeTab === 'tecnico' && (
        <div className="space-y-4">
          {persistenzaAvviso && (
            <p className="rounded-heemia border-l-2 border-heemia-carmine bg-white px-3 py-2 text-xs text-heemia-black">
              {persistenzaAvviso}
            </p>
          )}

          {/* Form di compilazione: sostituisce la vista finché è aperto. */}
          {sheetFormId && activeSheet && sheetFormId === activeSheet.id ? (
            <TechnicalSheetForm product={product} sheet={activeSheet} onClose={() => setSheetFormId(null)} />
          ) : (
        <Card>
          <CardHeader
            title="Scheda tecnica"
            subtitle="Una sola scheda per capo: si compila qui e si esporta in PDF."
            action={
              userCanEdit ? (
                <div className="flex flex-wrap items-center gap-2">
                  {sheets.length === 0 && (
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        // L'id lo assegna il database: si attende la risposta prima di aprire il form.
                        const creata = await addTechnicalSheet(product.id, 'preliminare')
                        setSheetFormId(creata.id)
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Plus aria-hidden className="h-3.5 w-3.5" /> Crea scheda tecnica
                      </span>
                    </Button>
                  )}
                  {activeSheet && (
                    <>
                      <Button variant="secondary" onClick={() => setSheetFormId(activeSheet.id)}>
                        <span className="inline-flex items-center gap-1.5">
                          <Pencil aria-hidden className="h-3.5 w-3.5" /> Compila / modifica
                        </span>
                      </Button>
                      <Button
                        variant="secondary"
                        title="Scheda per la modellista: lavorazione e misure, nessun dato economico"
                        onClick={() => {
                          setPdfVariante('tecnica')
                          setStampaRichiesta(true)
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Printer aria-hidden className="h-3.5 w-3.5" /> PDF per la modellista
                        </span>
                      </Button>
                      <Button
                        onClick={() => {
                          setPdfVariante('completa')
                          setStampaRichiesta(true)
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Printer aria-hidden className="h-3.5 w-3.5" /> Esporta PDF
                        </span>
                      </Button>
                    </>
                  )}
                </div>
              ) : undefined
            }
          />
          <div className="p-5">
            {sheets.length === 0 ? (
              <EmptyState
                title="Nessuna scheda tecnica"
                description={
                  step
                    ? (step.motivoBlocco ?? checkAdvance(step, { materials, accessories, technicalSheets, products }).reason ?? 'Scheda tecnica non ancora creata per questo prodotto.')
                    : 'Scheda tecnica non ancora creata per questo prodotto.'
                }
              />
            ) : (
              <div>
                {activeSheet && (
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-heemia border border-heemia-border bg-heemia-surface px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <FileText aria-hidden className="h-4 w-4 shrink-0 text-heemia-grey" />
                      {/* Due origini possibili: il PDF caricato dal dispositivo e il vecchio
                          collegamento a un file su Drive (DEC-021). */}
                      {activeSheet.pdfFile ? (
                        <div className="min-w-0">
                          <a
                            href={activeSheet.pdfFile.dataUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-heemia-black hover:underline"
                            title={activeSheet.pdfFile.nome}
                          >
                            {activeSheet.pdfFile.nome} <ExternalLink aria-hidden className="h-3 w-3 shrink-0" />
                          </a>
                          <p className="text-xs text-heemia-grey">Caricato il {formatDateIt(activeSheet.pdfFile.caricatoIl)}</p>
                        </div>
                      ) : activeSheet.pdfUrl ? (
                        <div>
                          <a
                            href={activeSheet.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-heemia-black hover:underline"
                          >
                            Apri documento PDF <ExternalLink aria-hidden className="h-3 w-3" />
                          </a>
                          <p className="text-xs text-heemia-grey">Caricato il {formatDateIt(activeSheet.pdfCaricatoIl ?? activeSheet.creataIl)}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-heemia-grey">Nessun PDF collegato per questa versione.</p>
                      )}
                    </div>
                    {canWrite(role, 'prodotti') && uploadingSheetId !== activeSheet.id && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setUploadingSheetId(activeSheet.id)
                          setUploadValue(activeSheet.pdfUrl ?? '')
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Upload aria-hidden className="h-3.5 w-3.5" />
                          {activeSheet.pdfUrl ? 'Sostituisci PDF' : 'Carica PDF'}
                        </span>
                      </Button>
                    )}
                  </div>
                )}

                {activeSheet && uploadingSheetId === activeSheet.id && (
                  <div className="mb-5 flex flex-wrap items-center gap-2 rounded-heemia border border-heemia-border-strong bg-white p-3">
                    <input
                      type="text"
                      value={uploadValue}
                      onChange={(e) => setUploadValue(e.target.value)}
                      placeholder="Link Drive al PDF…"
                      className="min-w-[16rem] flex-1 rounded-heemia border border-heemia-border px-3 py-1.5 text-sm text-heemia-black transition-all duration-200 ease-heemia focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10"
                    />
                    <Button
                      onClick={async () => {
                        if (!uploadValue.trim()) return
                        try {
                          await setSheetPdfUrl(activeSheet.id, uploadValue.trim())
                          setUploadingSheetId(null)
                        } catch {
                          // `persistenzaAvviso` mostra già il motivo: il campo resta aperto
                          // con il link digitato, così non va perso.
                        }
                      }}
                    >
                      Salva collegamento
                    </Button>
                    <Button variant="ghost" onClick={() => setUploadingSheetId(null)}>Annulla</Button>
                  </div>
                )}

                {activeSheet && (
                  <>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                      <DetailField label="Stato scheda"><span className="capitalize">{(activeSheet.statoScheda ?? 'bozza').replace('_', ' ')}</span></DetailField>
                      <DetailField label="Composizione">{activeSheet.composizioneCompleta || '–'}</DetailField>
                      <DetailField label="Peso capo"><span className="font-mono-heemia">{activeSheet.pesoCapoGrammi ? `${activeSheet.pesoCapoGrammi}g` : '–'}</span></DetailField>
                      <DetailField label="Taglie disponibili">{(activeSheet.taglieDisponibili ?? []).join(', ') || '–'}</DetailField>
                      <DetailField label="Misure e vestibilità">{activeSheet.misureVestibilita ?? '–'}</DetailField>
                      <DetailField label="Descrizione tecnica">{activeSheet.descrizioneTecnica ?? '–'}</DetailField>
                      <DetailField label="Lavorazione">{activeSheet.lavorazione || '–'}</DetailField>
                      <DetailField label="Istruzioni di confezione">{activeSheet.istruzioniConfezione ?? '–'}</DetailField>
                      <DetailField label="Difficoltà"><span className="capitalize">{activeSheet.difficoltaProduttiva}</span></DetailField>
                      <DetailField label="Tempi stimati"><span className="font-mono-heemia">{activeSheet.tempiStimatiOre ? `${activeSheet.tempiStimatiOre}h` : '–'}</span></DetailField>
                      <DetailField label="Lavaggio consigliato">{activeSheet.lavaggioConsigliato || '–'}</DetailField>
                      <DetailField label="Trattamenti">{activeSheet.trattamenti || '–'}</DetailField>
                      <DetailField label="Tessuto principale">
                        <span className="font-display">
                          {materials.find((m) => m.id === activeSheet.tessutoPrincipaleId)?.nome ??
                            (activeSheet.materiali ?? []).find((m) => m.materialId)?.descrizione ??
                            '–'}
                        </span>
                      </DetailField>
                      <DetailField label="Accessori">
                        {activeSheet.accessoriIds.map((aid) => accessories.find((a) => a.id === aid)?.nome).filter(Boolean).join(', ') ||
                          (activeSheet.materiali ?? []).filter((m) => m.accessoryId).map((m) => m.descrizione).join(', ') || '–'}
                      </DetailField>
                      <DetailField label="Fornitore / laboratorio">
                        {activeSheet.fornitoreLaboratorioId ? suppliers.find((s) => s.id === activeSheet.fornitoreLaboratorioId)?.nome ?? '–' : '–'}
                      </DetailField>
                      <DetailField label="Note tecniche">{activeSheet.noteTecniche ?? '–'}</DetailField>
                      <DetailField label="Creata il"><span className="font-mono-heemia">{formatDateIt(activeSheet.creataIl)}</span></DetailField>
                      <DetailField label="Ultimo aggiornamento"><span className="font-mono-heemia">{activeSheet.aggiornataIl ? formatDateIt(activeSheet.aggiornataIl) : '–'}</span></DetailField>
                    </div>

                    {/* Versioni Finale e Piazzamento: note della versione ed esito della lettura AI. */}
                    {activeSheet.noteVersione && (
                      <div className="mt-6 border-t border-heemia-border pt-4">
                        <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                          Note su questa versione
                        </p>
                        <p className="text-sm text-heemia-black">{activeSheet.noteVersione}</p>
                      </div>
                    )}

                    {activeSheet.scanAI && (
                      <div className="mt-4 rounded-heemia border border-heemia-border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                            Costi letti dal PDF il {formatDateIt(activeSheet.scanAI.analizzatoIl)}
                          </span>
                          <Badge
                            variant={
                              activeSheet.scanAI.affidabilita === 'alta' ? 'success'
                                : activeSheet.scanAI.affidabilita === 'media' ? 'warning' : 'critical'
                            }
                          >
                            Affidabilità {activeSheet.scanAI.affidabilita}
                          </Badge>
                          <span className="text-xs text-heemia-grey">{activeSheet.scanAI.vociEstratte} voci estratte</span>
                        </div>
                        <p className="mt-1.5 text-sm text-heemia-black">{activeSheet.scanAI.note}</p>
                      </div>
                    )}

                    {(activeSheet.foto ?? []).length > 0 && (
                      <div className="mt-6 border-t border-heemia-border pt-4">
                        <p className="font-mono-heemia mb-2 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                          Fotografie del prototipo
                        </p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                          {(activeSheet.foto ?? []).map((f) => (
                            <figure key={f.id} className="overflow-hidden rounded-heemia border border-heemia-border bg-white">
                              <img src={f.dataUrl} alt={f.nome} className="h-28 w-full object-cover" />
                              <figcaption className="truncate px-2 py-1 text-[10px] text-heemia-grey" title={f.nome}>{f.nome}</figcaption>
                            </figure>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </Card>
          )}

          {/* Costo del capo e break-even calcolati da questa scheda (spec §4/§5/§6). */}
          {activeSheet && canSeeEconomics && !sheetFormId && <SheetCostBreakdown sheet={activeSheet} />}

          {/* Documenti ricevuti dalla modellista: stesso tab della scheda, non una pagina separata.
              Nascosti mentre il form di compilazione è aperto, come il riepilogo costi. */}
          {!sheetFormId && (
            <Card>
              <CardHeader
                title="Documenti della modellista"
                subtitle="Cartamodelli, piazzamenti, schede misure e revisioni, con note e versioni."
              />
              <div className="p-5">
                <PatternDocuments productId={product.id} canEdit={userCanEdit} />
              </div>
            </Card>
          )}

          {/* Documento nascosto a schermo, stampato da "Esporta PDF". */}
          {activeSheet && <SheetPdfDocument product={product} sheet={activeSheet} variante={pdfVariante} />}
        </div>
      )}

      {activeTab === 'produzione' && (
        <Card>
          <CardHeader
            title="Pipeline produzione"
            subtitle="Avanzamento del capo lungo il percorso, con eventuale blocco per scheda tecnica assente. Completata la produzione il capo esce dalla pipeline ed entra nello stock."
          />
          <div className="p-5">
            {step ? (
              <div>
                <StageProgress
                  currentStage={step.fase}
                  blocked={step.bloccata}
                  blockReason={step.motivoBlocco ?? checkAdvance(step, { materials, accessories, technicalSheets, products }).reason}
                />
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-heemia-border pt-4 sm:grid-cols-3">
                  <DetailField label="Iniziato il"><span className="font-mono-heemia">{step.dataInizio ? formatDateIt(step.dataInizio) : '–'}</span></DetailField>
                  <DetailField label="Stato">
                    {step.bloccata ? <span className="text-heemia-carmine">Bloccata</span> : 'In corso'}
                  </DetailField>
                  <DetailField label="Note fase">{step.note ?? '–'}</DetailField>
                </div>
                <SampleApproval productId={product.id} canEdit={userCanEdit} />
                <p className="mt-4 text-xs text-heemia-grey">
                  L'avanzamento tra le fasi si gestisce dalla <Link to="/produzione" className="underline hover:text-heemia-black">Pipeline produzione</Link>.
                </p>
              </div>
            ) : (
              <div>
                <StageProgress currentStage={product.stato} />
                <p className="mt-4 text-sm text-heemia-grey">Nessuno step di produzione attivo per questo prodotto.</p>
                <SampleApproval productId={product.id} canEdit={userCanEdit} />
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'shopify' && (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Shopify ed e-commerce"
              subtitle="Il capo si manda in vetrina da qui, con i dati che ha già: nessuna scheda da riscrivere nel negozio."
            />
            <div className="p-5">
              <PubblicaShopify product={product} canEdit={userCanEdit} onPubblicato={() => void applicaPrezzo().catch(() => undefined)} />

              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <DetailField label="Stato pubblicazione"><StatusBadge status={product.statoPubblicazioneShopify} /></DetailField>
                <DetailField label="Disponibilità online">{product.disponibilitaOnline ? 'Sì' : 'No'}</DetailField>
                <DetailField label="Disponibilità showroom">{product.disponibilitaShowroom ? 'Sì' : 'No'}</DetailField>
                {/* I due attributi che decidono la vista cliente (DEC-044). */}
                <DetailField label="Visibile in showroom">{product.visibileShowroom ? 'Sì' : 'No'}</DetailField>
                <DetailField label="Personalizzabile su misura">{product.personalizzabileSuMisura ? 'Sì' : 'No'}</DetailField>
                <DetailField label="Tempi di realizzazione">{product.tempiRealizzazione || '–'}</DetailField>
                <DetailField label="Prezzo standard (IVA incl.)"><span className="font-mono-heemia">{product.prezzoVendita > 0 ? formatCurrency(product.prezzoVendita) : '–'}</span></DetailField>
                <DetailField label="Prezzo netto IVA"><span className="font-mono-heemia">{product.prezzoNettoIva > 0 ? formatCurrency(product.prezzoNettoIva) : '–'}</span></DetailField>
                {/* Non è più un campo da scrivere: è il listino meno il 10% (regola
                    2026-09-10). Si mostra perché è il prezzo dello stand, e nasconderlo
                    obbligherebbe a rifare il conto a mente ogni volta. */}
                <DetailField label="Prezzo showroom (listino −10%)"><span className="font-mono-heemia">{product.prezzoShowroom > 0 ? formatCurrency(product.prezzoShowroom) : '–'}</span></DetailField>
                <DetailField label="Composizione">{product.composizione ?? '–'}</DetailField>
              </div>
              <div className="mt-5 border-t border-heemia-border pt-4">
                <p className="font-mono-heemia mb-1.5 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Descrizione e-commerce</p>
                <p className="text-sm text-heemia-black">{product.descrizioneEcommerce ?? 'Non ancora scritta.'}</p>
              </div>
            </div>
          </Card>

          {prezzoCalcolato && (
            <Card>
              <CardHeader title="Prezzo del capo" subtitle="Calcolato dai costi della scheda tecnica: non si digita più." />
              <div className="p-5">
                <PrezzoCalcolato
                  prezzo={prezzoCalcolato}
                  canEdit={userCanEdit}
                  inCorso={prezzoInCorso}
                  onApplica={() => {
                    setPrezzoInCorso(true)
                    void applicaPrezzo()
                      .then((esito) => {
                        avvisa('generico', {
                          titolo: esito.applicato ? 'Prezzi aggiornati' : 'Nessuna modifica',
                          testo: esito.applicato
                            ? `Listino ${formatCurrency(esito.calcolato.prezzoVendita)}, showroom ${formatCurrency(esito.calcolato.prezzoShowroom)}.`
                            : 'Il capo aveva già i prezzi calcolati.',
                        })
                      })
                      .catch((e: unknown) =>
                        avvisa('salvataggio', { testo: e instanceof Error ? e.message : 'Prezzo non applicato.' }),
                      )
                      .finally(() => setPrezzoInCorso(false))
                  }}
                />
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'media' && (
        <ProductMedia product={product} canEdit={userCanEdit} onSave={(urls) => updateProduct(product.id, { immaginiUrl: urls })} />
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
              {canWrite(role, 'prodotti') ? (
                <div className="mb-4 flex flex-col gap-2">
                  <textarea
                    value={sessionNote}
                    onChange={(e) => setSessionNote(e.target.value)}
                    rows={3}
                    placeholder="Scrivi una nota su questo prodotto…"
                    className="w-full rounded-heemia border border-heemia-border p-3 text-sm text-heemia-black transition-all duration-200 ease-heemia focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10"
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
