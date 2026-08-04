import { useRef, useState } from 'react'
import { Plus, Trash2, Wand2, Upload, FileText, Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Field, fieldClass } from '../ui/Modal'
import { InfoTooltip } from '../ui/InfoTooltip'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { estimateConsumption, weightedAverageUnitCost } from '../../lib/materialCosting'
import { VOCE_LABEL } from '../../lib/sheetCost'
import { api, ApiError } from '../../lib/api'
import { useMockStore, type TechnicalSheetInput } from '../../context/MockStore'
import type {
  Product,
  SheetCostLine,
  SheetCostVoce,
  SheetMaterialUsage,
  StatoScheda,
  TechnicalSheet,
  TechnicalSheetPhoto,
  TechnicalSheetVersion,
} from '../../types'

// Form di compilazione della scheda tecnica (spec §1/§2/§4). Pannello full-width inline,
// non modale: i campi sono troppi per il Modal stretto usato altrove nel prototipo.
// Il costo unitario dei materiali è risolto automaticamente dalle fatture collegate
// (lib/materialCosting) e la quantità è stimata dall'app ma sempre correggibile a mano:
// vengono conservati sia il valore suggerito sia quello confermato dall'utente.

const VERSION_LABEL: Record<TechnicalSheetVersion, string> = {
  preliminare: 'V1 · Preliminare',
  finale: 'V2 · Finale',
  piazzamento: 'V3 · Piazzamento e taglio',
}

const STATO_LABEL: Record<StatoScheda, string> = {
  bozza: 'Bozza',
  in_revisione: 'In revisione',
  approvata: 'Approvata',
  archiviata: 'Archiviata',
}

// Voci di costo che per natura si ammortizzano sui capi prodotti (spec §4).
const VOCI_AMMORTIZZABILI: SheetCostVoce[] = ['sviluppo_modello', 'disegno', 'scheda_tecnica', 'prototipazione']

let uid = 0
function localId(prefix: string): string {
  uid += 1
  return `${prefix}-${Date.now().toString(36)}-${uid}`
}

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

/** Ridimensiona l'immagine caricata prima di salvarla come data URL: le foto a piena
 *  risoluzione saturerebbero la quota di localStorage. Lato lungo max 1000px, JPEG 0.8. */
function fileToDownscaledDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('lettura fallita'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('immagine non valida'))
      img.onload = () => {
        const max = 1000
        const scala = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scala)
        const h = Math.round(img.height * scala)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas non disponibile'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = String(reader.result ?? '')
    }
    reader.readAsDataURL(file)
  })
}

/** Legge un file dal dispositivo come data URL (usato per il PDF della scheda). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('lettura fallita'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })
}

// Risposta di POST /api/v1/ai/scan-technical-sheet (server/src/modules/ai).
interface ScanResponse {
  analizzatoIl: string
  estrazione: {
    nomeProdotto: string | null
    codiceProdotto: string | null
    composizione: string | null
    taglie: string[]
    materiali: {
      descrizione: string
      unitaMisura: string | null
      quantita: number | null
      costoUnitario: number | null
      costoTotale: number | null
    }[]
    costi: { voce: SheetCostVoce; etichettaOriginale: string; importo: number; ammortizzabile: boolean }[]
    quantitaPrevistaProduzione: number | null
    note: string
    affidabilita: 'alta' | 'media' | 'bassa'
  }
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-center gap-1.5 border-b border-heemia-border pb-1.5">
      <h3 className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{children}</h3>
      {hint && <InfoTooltip text={hint} />}
    </div>
  )
}

export function TechnicalSheetForm({
  product,
  sheet,
  onClose,
}: {
  product: Product
  sheet: TechnicalSheet
  onClose: () => void
}) {
  const { materials, accessories, invoices, suppliers, technicalSheets, updateTechnicalSheet, recordSheetCostSnapshot } =
    useMockStore()

  const [form, setForm] = useState<TechnicalSheet>(sheet)
  const fileRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)
  const [fotoErrore, setFotoErrore] = useState('')
  const [scanInCorso, setScanInCorso] = useState(false)
  const [scanErrore, setScanErrore] = useState('')

  // La V1 Preliminare è l'unica scheda che si compila a mano. Le versioni Finale e
  // Piazzamento partono dal PDF: si carica il documento, l'AI ne estrae i costi.
  const isPreliminare = form.versione === 'preliminare'

  const set = <K extends keyof TechnicalSheet>(key: K, value: TechnicalSheet[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // Variante funzionale: obbligatoria per le liste (materiali, costi, foto). Calcolare il
  // nuovo array dalla closure di render perderebbe modifiche quando due aggiornamenti
  // avvengono nello stesso tick o dopo un await (upload foto).
  const setFrom = <K extends keyof TechnicalSheet>(key: K, updater: (prev: TechnicalSheet) => TechnicalSheet[K]) =>
    setForm((f) => ({ ...f, [key]: updater(f) }))

  const materiali = form.materiali ?? []
  const costi = form.costiAggiuntivi ?? []
  const foto = form.foto ?? []

  // --- Materiali -------------------------------------------------------------

  // Taglia usata come riferimento per la stima consumo: la mediana delle taglie disponibili, o M.
  const taglie = form.taglieDisponibili ?? []
  const tagliaRiferimento = taglie.length > 0 ? taglie[Math.floor(taglie.length / 2)] : 'M'

  /** Risolve costo unitario e stima consumo per una riga materiale, in base al materiale scelto. */
  const risolviRiga = (riga: SheetMaterialUsage): SheetMaterialUsage => {
    const material = riga.materialId ? materials.find((m) => m.id === riga.materialId) : undefined
    const accessory = riga.accessoryId ? accessories.find((a) => a.id === riga.accessoryId) : undefined
    if (!material && !accessory) return riga

    const costo = material
      ? weightedAverageUnitCost({ kind: 'material', material }, invoices)
      : weightedAverageUnitCost({ kind: 'accessory', accessory: accessory! }, invoices)

    // Gli accessori si contano a pezzo: default 1, nessuna stima da categoria.
    const stima = material
      ? estimateConsumption(product, tagliaRiferimento, technicalSheets)
      : { quantitaSuggerita: 1, criterio: 'Un pezzo per capo (accessorio).' }

    return {
      ...riga,
      descrizione: material?.nome ?? accessory?.nome ?? riga.descrizione,
      unitaMisura: material?.unitaMisura ?? accessory?.unitaMisura ?? riga.unitaMisura,
      supplierId: material?.supplierId ?? accessory?.supplierId ?? riga.supplierId,
      quantitaSuggerita: stima.quantitaSuggerita,
      costoUnitario: costo.costoUnitario,
      fonteCosto: costo.fonte,
      fatturaCostoId: costo.fatturaId,
      costoUnitarioAggiornatoIl: costo.aggiornatoIl || TODAY_ISO(),
      fattureCollegateIds: costo.fatturaId ? [costo.fatturaId] : riga.fattureCollegateIds,
    }
  }

  const addMateriale = () => {
    const riga: SheetMaterialUsage = {
      id: localId('mu'),
      descrizione: '',
      unitaMisura: 'm',
      quantitaSuggerita: 0,
      percentualeScarto: 10,
      fattureCollegateIds: [],
      costoUnitario: 0,
      fonteCosto: 'manuale',
      costoUnitarioAggiornatoIl: TODAY_ISO(),
    }
    setFrom('materiali', (f) => [...(f.materiali ?? []), riga])
  }

  const patchMateriale = (id: string, patch: Partial<SheetMaterialUsage>, ricalcola = false) => {
    setFrom('materiali', (f) =>
      (f.materiali ?? []).map((m) => {
        if (m.id !== id) return m
        const next = { ...m, ...patch }
        return ricalcola ? risolviRiga(next) : next
      }),
    )
  }

  const removeMateriale = (id: string) => setFrom('materiali', (f) => (f.materiali ?? []).filter((m) => m.id !== id))

  // --- Costi aggiuntivi ------------------------------------------------------

  const addCosto = (voce: SheetCostVoce) => {
    const ammortizzabile = VOCI_AMMORTIZZABILI.includes(voce)
    const riga: SheetCostLine = {
      id: localId('cl'),
      voce,
      label: VOCE_LABEL[voce],
      importo: 0,
      kind: ammortizzabile ? 'sviluppo_ammortizzato' : 'diretto',
      fonte: 'manuale',
      ammortizzabile,
      quantitaPrevista: ammortizzabile ? (form.quantitaPrevistaProduzione ?? 50) : undefined,
    }
    setFrom('costiAggiuntivi', (f) => [...(f.costiAggiuntivi ?? []), riga])
  }

  const patchCosto = (id: string, patch: Partial<SheetCostLine>) =>
    setFrom('costiAggiuntivi', (f) => (f.costiAggiuntivi ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const removeCosto = (id: string) => setFrom('costiAggiuntivi', (f) => (f.costiAggiuntivi ?? []).filter((c) => c.id !== id))

  // --- Foto ------------------------------------------------------------------

  const onFiles = async (files: FileList) => {
    setFotoErrore('')
    const nuove: TechnicalSheetPhoto[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      try {
        const dataUrl = await fileToDownscaledDataUrl(file)
        nuove.push({ id: localId('photo'), dataUrl, nome: file.name, caricataIl: TODAY_ISO() })
      } catch {
        setFotoErrore(`Non sono riuscito a leggere "${file.name}". Riprova con un'altra immagine.`)
      }
    }
    if (nuove.length > 0) setFrom('foto', (f) => [...(f.foto ?? []), ...nuove])
    if (fileRef.current) fileRef.current.value = ''
  }

  const removeFoto = (id: string) => setFrom('foto', (f) => (f.foto ?? []).filter((x) => x.id !== id))

  // --- PDF della scheda + scansione AI (versioni Finale e Piazzamento) -------

  const onPdf = async (file: File) => {
    setScanErrore('')
    try {
      const dataUrl = await fileToDataUrl(file)
      set('pdfFile', { dataUrl, nome: file.name, caricatoIl: TODAY_ISO() })
    } catch {
      setScanErrore(`Non sono riuscito a leggere "${file.name}".`)
    }
    if (pdfRef.current) pdfRef.current.value = ''
  }

  /**
   * Manda il PDF al backend, che lo inoltra a Claude. I costi estratti sostituiscono
   * quelli della scheda e restano marcati con fonte "ai" per la tracciabilità (spec §6):
   * l'AI propone, la persona verifica.
   */
  const analizzaPdf = async () => {
    if (!form.pdfFile) return
    setScanInCorso(true)
    setScanErrore('')
    try {
      const res = await api.post<ScanResponse>('/ai/scan-technical-sheet', {
        pdfBase64: form.pdfFile.dataUrl,
        nomeFile: form.pdfFile.nome,
      })
      const e = res.estrazione
      const oggi = TODAY_ISO()

      const materiali: SheetMaterialUsage[] = e.materiali.map((m) => ({
        id: localId('mu'),
        descrizione: m.descrizione,
        unitaMisura: m.unitaMisura ?? 'pz',
        // Se il PDF dà solo il costo totale, si ricava il costo unitario dalla quantità.
        quantitaSuggerita: m.quantita ?? 1,
        percentualeScarto: 0,
        fattureCollegateIds: [],
        costoUnitario:
          m.costoUnitario ??
          (m.costoTotale != null && m.quantita ? Math.round((m.costoTotale / m.quantita) * 100) / 100 : 0),
        fonteCosto: 'ai',
        costoUnitarioAggiornatoIl: oggi,
      }))

      const costi: SheetCostLine[] = e.costi.map((c) => ({
        id: localId('cl'),
        voce: c.voce,
        label: c.etichettaOriginale || VOCE_LABEL[c.voce],
        importo: c.importo,
        kind: c.ammortizzabile ? 'sviluppo_ammortizzato' : 'diretto',
        fonte: 'ai',
        ammortizzabile: c.ammortizzabile,
        quantitaPrevista: c.ammortizzabile
          ? (e.quantitaPrevistaProduzione ?? form.quantitaPrevistaProduzione ?? 50)
          : undefined,
      }))

      setForm((f) => ({
        ...f,
        materiali,
        costiAggiuntivi: costi,
        composizioneCompleta: e.composizione ?? f.composizioneCompleta,
        taglieDisponibili: e.taglie.length > 0 ? e.taglie : f.taglieDisponibili,
        quantitaPrevistaProduzione: e.quantitaPrevistaProduzione ?? f.quantitaPrevistaProduzione,
        scanAI: {
          analizzatoIl: res.analizzatoIl,
          nomeFile: f.pdfFile?.nome,
          note: e.note,
          affidabilita: e.affidabilita,
          vociEstratte: materiali.length + costi.length,
        },
      }))
    } catch (err) {
      setScanErrore(
        err instanceof ApiError
          ? err.message
          : "Scansione non riuscita. Puoi comunque inserire i costi a mano nella scheda preliminare.",
      )
    } finally {
      setScanInCorso(false)
    }
  }

  // --- Salvataggio -----------------------------------------------------------

  const salva = () => {
    const patch: TechnicalSheetInput = { ...form }
    delete (patch as Partial<TechnicalSheet>).id
    delete (patch as Partial<TechnicalSheet>).productId
    updateTechnicalSheet(sheet.id, patch)
    // Spec §6: ogni salvataggio registra uno snapshot del costo, senza toccare i precedenti.
    recordSheetCostSnapshot(sheet.id, 'Salvataggio scheda tecnica')
    onClose()
  }

  const selectMaterialValue = (m: SheetMaterialUsage) =>
    m.materialId ? `mat:${m.materialId}` : m.accessoryId ? `acc:${m.accessoryId}` : ''

  // --- Versioni Finale e Piazzamento: solo PDF, note e scansione AI ---------
  if (!isPreliminare) {
    const scan = form.scanAI
    return (
      <Card className="mb-4">
        <CardHeader
          title={`Scheda tecnica — ${VERSION_LABEL[form.versione]}`}
          subtitle="Carica il PDF della scheda: l'assistente lo legge e ne ricava i costi del capo. Aggiungi eventuali note."
          action={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Annulla</Button>
              <Button onClick={salva}>Salva scheda</Button>
            </div>
          }
        />

        <div className="space-y-6 p-5">
          <section>
            <SectionTitle hint="Il PDF resta salvato nel browser e viene allegato all'export della scheda.">
              Documento della scheda tecnica
            </SectionTitle>

            <input
              ref={pdfRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onPdf(e.target.files[0])}
            />

            <div className="flex flex-wrap items-center gap-3 rounded-heemia border border-heemia-border bg-heemia-cream px-4 py-3">
              <FileText aria-hidden className="h-4 w-4 shrink-0 text-heemia-grey" />
              {form.pdfFile ? (
                <div className="min-w-0 flex-1">
                  <a
                    href={form.pdfFile.dataUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm text-heemia-black hover:underline"
                    title={form.pdfFile.nome}
                  >
                    {form.pdfFile.nome}
                  </a>
                  <p className="text-xs text-heemia-grey">Caricato il {formatDateIt(form.pdfFile.caricatoIl)}</p>
                </div>
              ) : (
                <p className="flex-1 text-sm text-heemia-grey">Nessun PDF caricato per questa versione.</p>
              )}
              <Button variant="secondary" onClick={() => pdfRef.current?.click()}>
                <span className="inline-flex items-center gap-1.5">
                  <Upload aria-hidden className="h-3.5 w-3.5" />
                  {form.pdfFile ? 'Sostituisci PDF' : 'Carica PDF'}
                </span>
              </Button>
              {form.pdfFile && (
                <Button onClick={analizzaPdf} disabled={scanInCorso}>
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles aria-hidden className="h-3.5 w-3.5" />
                    {scanInCorso ? 'Lettura in corso…' : 'Ricava i costi con AI'}
                  </span>
                </Button>
              )}
            </div>

            {scanErrore && (
              <p className="mt-3 rounded-heemia border-l-2 border-heemia-carmine bg-white px-3 py-2 text-sm text-heemia-black">
                {scanErrore}
              </p>
            )}

            {scan && (
              <div className="mt-3 rounded-heemia border border-heemia-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles aria-hidden className="h-3.5 w-3.5 text-heemia-grey" />
                  <span className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                    Lettura AI del {formatDateIt(scan.analizzatoIl)}
                  </span>
                  <Badge variant={scan.affidabilita === 'alta' ? 'success' : scan.affidabilita === 'media' ? 'warning' : 'critical'}>
                    Affidabilità {scan.affidabilita}
                  </Badge>
                  <span className="text-xs text-heemia-grey">{scan.vociEstratte} voci estratte</span>
                </div>
                <p className="mt-1.5 text-sm text-heemia-black">{scan.note}</p>
                <p className="mt-2 text-xs text-heemia-grey">
                  I valori estratti alimentano il costo del capo qui sotto e restano marcati come provenienti dall'AI:
                  verificali prima di considerarli definitivi.
                </p>
              </div>
            )}
          </section>

          <section>
            <SectionTitle>Note su questa versione</SectionTitle>
            <textarea
              rows={4}
              className={fieldClass}
              value={form.noteVersione ?? ''}
              onChange={(e) => set('noteVersione', e.target.value)}
              placeholder="Es. modifiche rispetto alla preliminare, indicazioni per il confezionista, dubbi da chiarire…"
            />
          </section>

          <div className="flex justify-end gap-2 border-t border-heemia-border pt-4">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={salva}>Salva scheda</Button>
          </div>
        </div>
      </Card>
    )
  }

  // --- V1 Preliminare: la scheda che si compila a mano ----------------------
  return (
    <Card className="mb-4">
      <CardHeader
        title={`Compila scheda tecnica — ${VERSION_LABEL[form.versione]}`}
        subtitle="I costi unitari sono ricavati dalle fatture collegate; le quantità sono stimate dall'app e restano correggibili a mano."
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={salva}>Salva scheda</Button>
          </div>
        }
      />

      <div className="space-y-7 p-5">
        {/* 1. Anagrafica ---------------------------------------------------- */}
        <section>
          <SectionTitle>Anagrafica capo</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Nome prodotto">
              <input className={fieldClass} value={form.nomeProdotto ?? ''} onChange={(e) => set('nomeProdotto', e.target.value)} />
            </Field>
            <Field label="Codice prodotto">
              <input className={fieldClass} value={form.codiceProdotto ?? ''} onChange={(e) => set('codiceProdotto', e.target.value)} />
            </Field>
            <Field label="Categoria">
              <input className={fieldClass} value={form.categoria ?? ''} onChange={(e) => set('categoria', e.target.value)} placeholder="Felpa, Pantalone…" />
            </Field>
            <Field label="Collezione">
              <input className={fieldClass} value={form.collezione ?? ''} onChange={(e) => set('collezione', e.target.value)} />
            </Field>
            <Field label="Stato scheda">
              <select className={fieldClass} value={form.statoScheda ?? 'bozza'} onChange={(e) => set('statoScheda', e.target.value as StatoScheda)}>
                {Object.entries(STATO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Versione">
              <select className={fieldClass} value={form.versione} onChange={(e) => set('versione', e.target.value as TechnicalSheetVersion)}>
                {Object.entries(VERSION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-3">
              <Field label="Descrizione tecnica">
                <textarea rows={2} className={fieldClass} value={form.descrizioneTecnica ?? ''} onChange={(e) => set('descrizioneTecnica', e.target.value)} placeholder="Descrizione del capo dal punto di vista tecnico…" />
              </Field>
            </div>
          </div>
        </section>

        {/* 2. Misure e composizione ----------------------------------------- */}
        <section>
          <SectionTitle>Misure, vestibilità e composizione</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Taglie disponibili (separate da virgola)">
              <input
                className={fieldClass}
                value={taglie.join(', ')}
                onChange={(e) => set('taglieDisponibili', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
                placeholder="XS, S, M, L, XL"
              />
            </Field>
            <Field label="Peso capo (g)">
              <input type="number" min="0" className={fieldClass} value={form.pesoCapoGrammi || ''} onChange={(e) => set('pesoCapoGrammi', Number(e.target.value) || 0)} />
            </Field>
            <Field label="Composizione">
              <input className={fieldClass} value={form.composizioneCompleta} onChange={(e) => set('composizioneCompleta', e.target.value)} placeholder="100% Cotone" />
            </Field>
            <div className="sm:col-span-3">
              <Field label="Misure e vestibilità">
                <textarea rows={2} className={fieldClass} value={form.misureVestibilita ?? ''} onChange={(e) => set('misureVestibilita', e.target.value)} placeholder="Es. Oversize. Torace 60cm, lunghezza 72cm, manica 62cm (taglia M)…" />
              </Field>
            </div>
          </div>
        </section>

        {/* 3. Materiali ------------------------------------------------------ */}
        <section>
          <SectionTitle hint="Scegli un materiale dall'anagrafica: l'app stima la quantità per un capo e recupera il costo unitario dalle fatture collegate. Puoi sempre correggere la quantità: il valore suggerito resta memorizzato.">
            Materiali, accessori e componenti
          </SectionTitle>

          {materiali.length === 0 ? (
            <p className="mb-3 text-sm text-heemia-grey">Nessun materiale inserito. Aggiungi il tessuto principale e gli accessori del capo.</p>
          ) : (
            <div className="mb-3 space-y-3">
              {materiali.map((m) => {
                const suggerita = m.quantitaSuggerita
                const confermata = m.quantitaConfermata
                const usata = confermata ?? suggerita
                const totale = usata * m.costoUnitario * (1 + Math.max(0, m.percentualeScarto) / 100)
                return (
                  <div key={m.id} className="rounded-heemia border border-heemia-border bg-heemia-cream p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                      <div className="col-span-2">
                        <Field label="Materiale">
                          <select
                            className={fieldClass}
                            value={selectMaterialValue(m)}
                            onChange={(e) => {
                              const [kind, id] = e.target.value.split(':')
                              patchMateriale(
                                m.id,
                                kind === 'mat'
                                  ? { materialId: id, accessoryId: undefined }
                                  : kind === 'acc'
                                    ? { accessoryId: id, materialId: undefined }
                                    : { materialId: undefined, accessoryId: undefined },
                                true,
                              )
                            }}
                          >
                            <option value="">Seleziona…</option>
                            <optgroup label="Tessuti">
                              {materials.map((x) => <option key={x.id} value={`mat:${x.id}`}>{x.nome}</option>)}
                            </optgroup>
                            <optgroup label="Accessori">
                              {accessories.map((x) => <option key={x.id} value={`acc:${x.id}`}>{x.nome}</option>)}
                            </optgroup>
                          </select>
                        </Field>
                      </div>
                      <Field label="U.M.">
                        <input className={fieldClass} value={m.unitaMisura} onChange={(e) => patchMateriale(m.id, { unitaMisura: e.target.value })} />
                      </Field>
                      <Field label="Qtà suggerita">
                        <input readOnly className={`${fieldClass} bg-heemia-cream text-heemia-grey`} value={suggerita || 0} title="Stima automatica dell'app" />
                      </Field>
                      <Field label="Qtà confermata">
                        <input
                          type="number" min="0" step="0.01"
                          className={fieldClass}
                          value={confermata ?? ''}
                          placeholder={String(suggerita || 0)}
                          onChange={(e) => patchMateriale(m.id, { quantitaConfermata: e.target.value === '' ? undefined : Number(e.target.value) })}
                        />
                      </Field>
                      <Field label="Scarto %">
                        <input
                          type="number" min="0" step="1"
                          className={fieldClass}
                          value={m.percentualeScarto}
                          onChange={(e) => patchMateriale(m.id, { percentualeScarto: Number(e.target.value) || 0 }, true)}
                        />
                      </Field>
                      <Field label="Costo unitario">
                        <input
                          type="number" min="0" step="0.01"
                          className={fieldClass}
                          value={m.costoUnitario}
                          onChange={(e) => patchMateriale(m.id, { costoUnitario: Number(e.target.value) || 0, fonteCosto: 'manuale', fatturaCostoId: undefined, costoUnitarioAggiornatoIl: TODAY_ISO() })}
                        />
                      </Field>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-heemia-border pt-2">
                      <p className="text-xs text-heemia-grey">
                        Fonte costo: <span className="text-heemia-black">{m.fonteCosto}</span>
                        {m.fatturaCostoId && <> · fattura {invoices.find((i) => i.id === m.fatturaCostoId)?.numero ?? m.fatturaCostoId}</>}
                        {m.supplierId && <> · fornitore {suppliers.find((s) => s.id === m.supplierId)?.nome ?? '–'}</>}
                        {' · '}costo capo <span className="font-mono-heemia text-heemia-black">{formatCurrency(totale)}</span>
                      </p>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => patchMateriale(m.id, {}, true)} title="Ricalcola stima e costo dalle fatture">
                          <span className="inline-flex items-center gap-1"><Wand2 aria-hidden className="h-3.5 w-3.5" /> Ricalcola</span>
                        </Button>
                        <Button variant="ghost" onClick={() => removeMateriale(m.id)} aria-label="Rimuovi materiale">
                          <Trash2 aria-hidden className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <Button variant="secondary" onClick={addMateriale}>
            <span className="inline-flex items-center gap-1.5"><Plus aria-hidden className="h-3.5 w-3.5" /> Aggiungi materiale</span>
          </Button>
        </section>

        {/* 4. Costi aggiuntivi ---------------------------------------------- */}
        <section>
          <SectionTitle hint="I costi di sviluppo, disegno, scheda tecnica e prototipazione si ripartiscono sul numero di capi previsti; gli altri sono costi diretti del singolo capo.">
            Lavorazioni e altri costi
          </SectionTitle>

          <div className="mb-3 max-w-xs">
            <Field label="Capi previsti in produzione (divisore ammortamento)">
              <input
                type="number" min="1"
                className={fieldClass}
                value={form.quantitaPrevistaProduzione ?? 50}
                onChange={(e) => set('quantitaPrevistaProduzione', Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
          </div>

          {costi.length > 0 && (
            <div className="mb-3 space-y-2">
              {costi.map((c) => (
                <div key={c.id} className="grid grid-cols-2 items-end gap-3 rounded-heemia border border-heemia-border bg-heemia-cream p-3 sm:grid-cols-5">
                  <Field label="Voce">
                    <select className={fieldClass} value={c.voce} onChange={(e) => {
                      const voce = e.target.value as SheetCostVoce
                      const amm = VOCI_AMMORTIZZABILI.includes(voce)
                      patchCosto(c.id, { voce, label: VOCE_LABEL[voce], ammortizzabile: amm, kind: amm ? 'sviluppo_ammortizzato' : 'diretto' })
                    }}>
                      {Object.entries(VOCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Importo (€)">
                    <input type="number" min="0" step="0.01" className={fieldClass} value={c.importo || ''} onChange={(e) => patchCosto(c.id, { importo: Number(e.target.value) || 0 })} />
                  </Field>
                  <Field label="Tipo">
                    <select className={fieldClass} value={c.ammortizzabile ? 'amm' : 'dir'} onChange={(e) => {
                      const amm = e.target.value === 'amm'
                      patchCosto(c.id, { ammortizzabile: amm, kind: amm ? 'sviluppo_ammortizzato' : 'diretto', quantitaPrevista: amm ? (c.quantitaPrevista ?? form.quantitaPrevistaProduzione ?? 50) : undefined })
                    }}>
                      <option value="dir">Costo diretto del capo</option>
                      <option value="amm">Da ammortizzare sui capi</option>
                    </select>
                  </Field>
                  <Field label="Fonte">
                    <select className={fieldClass} value={c.fonte} onChange={(e) => patchCosto(c.id, { fonte: e.target.value as SheetCostLine['fonte'] })}>
                      <option value="manuale">Inserito a mano</option>
                      <option value="fattura">Da fattura</option>
                      <option value="fornitore">Preventivo fornitore</option>
                      <option value="stimato">Stimato</option>
                    </select>
                  </Field>
                  <div className="flex items-center gap-2">
                    {c.fonte === 'fattura' ? (
                      <Field label="Fattura">
                        <select className={fieldClass} value={c.fatturaId ?? ''} onChange={(e) => patchCosto(c.id, { fatturaId: e.target.value || undefined })}>
                          <option value="">Seleziona…</option>
                          {invoices.map((i) => <option key={i.id} value={i.id}>{i.numero}</option>)}
                        </select>
                      </Field>
                    ) : (
                      <p className="text-xs text-heemia-grey">
                        {c.ammortizzabile
                          ? `${formatCurrency(c.importo)} ÷ ${c.quantitaPrevista ?? form.quantitaPrevistaProduzione ?? 1} capi = ${formatCurrency(c.importo / Math.max(1, c.quantitaPrevista ?? form.quantitaPrevistaProduzione ?? 1))}/capo`
                          : `${formatCurrency(c.importo)} sul capo`}
                      </p>
                    )}
                    <Button variant="ghost" onClick={() => removeCosto(c.id)} aria-label="Rimuovi voce di costo">
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* I due gruppi sono separati perché si comportano in modo diverso nel calcolo:
              i diretti pesano per intero sul capo, gli altri si dividono per i capi previsti. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-heemia border border-heemia-border p-3">
              <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                Costi diretti del capo
              </p>
              <p className="mb-2.5 text-xs text-heemia-grey">
                Si pagano per ogni capo prodotto e pesano per intero sul costo unitario.
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(VOCE_LABEL) as SheetCostVoce[])
                  .filter((v) => !VOCI_AMMORTIZZABILI.includes(v))
                  .map((v) => (
                    <Button key={v} variant="secondary" onClick={() => addCosto(v)}>
                      <span className="inline-flex items-center gap-1"><Plus aria-hidden className="h-3 w-3" /> {VOCE_LABEL[v]}</span>
                    </Button>
                  ))}
              </div>
            </div>

            <div className="rounded-heemia border border-heemia-border bg-heemia-cream p-3">
              <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                Costi di sviluppo una-tantum
              </p>
              <p className="mb-2.5 text-xs text-heemia-grey">
                Si pagano una volta sola per il modello e si dividono per i capi previsti.
              </p>
              <div className="flex flex-wrap gap-2">
                {VOCI_AMMORTIZZABILI.map((v) => (
                  <Button key={v} variant="secondary" onClick={() => addCosto(v)}>
                    <span className="inline-flex items-center gap-1"><Plus aria-hidden className="h-3 w-3" /> {VOCE_LABEL[v]}</span>
                  </Button>
                ))}
              </div>

              {/* Riepilogo dell'ammortamento: rende evidente quanto pesa lo sviluppo su un capo. */}
              {(() => {
                const capi = Math.max(1, form.quantitaPrevistaProduzione ?? 50)
                const totaleSviluppo = costi
                  .filter((c) => c.ammortizzabile)
                  .reduce((s, c) => s + c.importo, 0)
                if (totaleSviluppo <= 0) return null
                return (
                  <p className="mt-3 border-t border-heemia-border pt-2 text-xs text-heemia-black">
                    Totale sviluppo <span className="font-mono-heemia">{formatCurrency(totaleSviluppo)}</span> ÷ {capi} capi ={' '}
                    <span className="font-mono-heemia">{formatCurrency(totaleSviluppo / capi)}</span> a capo
                  </p>
                )
              })()}
            </div>
          </div>
        </section>

        {/* 5. Lavorazioni e confezione -------------------------------------- */}
        <section>
          <SectionTitle>Lavorazioni, confezione e note</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Lavorazione">
              <textarea rows={2} className={fieldClass} value={form.lavorazione} onChange={(e) => set('lavorazione', e.target.value)} placeholder="Taglio e cucito standard, orlo a costina…" />
            </Field>
            <Field label="Istruzioni di confezione">
              <textarea rows={2} className={fieldClass} value={form.istruzioniConfezione ?? ''} onChange={(e) => set('istruzioniConfezione', e.target.value)} placeholder="Sequenza di montaggio, cuciture, rifiniture…" />
            </Field>
            <Field label="Trattamenti">
              <input className={fieldClass} value={form.trattamenti} onChange={(e) => set('trattamenti', e.target.value)} placeholder="Nessuno, impermeabilizzante…" />
            </Field>
            <Field label="Lavaggio consigliato">
              <input className={fieldClass} value={form.lavaggioConsigliato} onChange={(e) => set('lavaggioConsigliato', e.target.value)} placeholder="Lavaggio a 30°" />
            </Field>
            <Field label="Fornitore / laboratorio">
              <select className={fieldClass} value={form.fornitoreLaboratorioId ?? ''} onChange={(e) => set('fornitoreLaboratorioId', e.target.value || undefined)}>
                <option value="">Nessuno</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nome} — {s.categoria}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Difficoltà">
                <select className={fieldClass} value={form.difficoltaProduttiva} onChange={(e) => set('difficoltaProduttiva', e.target.value as TechnicalSheet['difficoltaProduttiva'])}>
                  <option value="bassa">Bassa</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                </select>
              </Field>
              <Field label="Tempi stimati (h)">
                <input type="number" min="0" step="0.5" className={fieldClass} value={form.tempiStimatiOre || ''} onChange={(e) => set('tempiStimatiOre', Number(e.target.value) || 0)} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Note tecniche">
                <textarea rows={2} className={fieldClass} value={form.noteTecniche ?? ''} onChange={(e) => set('noteTecniche', e.target.value)} placeholder="Accorgimenti, criticità, verifiche da fare prima del taglio in serie…" />
              </Field>
            </div>
          </div>
        </section>

        {/* 6. Foto prototipo ------------------------------------------------- */}
        <section>
          <SectionTitle hint="Le foto vengono ridimensionate e salvate nel browser: restano disponibili anche dopo aver ricaricato la pagina.">
            Fotografie del prototipo
          </SectionTitle>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && onFiles(e.target.files)}
          />
          <div className="mb-3 flex items-center gap-2">
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <span className="inline-flex items-center gap-1.5"><Upload aria-hidden className="h-3.5 w-3.5" /> Carica foto</span>
            </Button>
            <span className="text-xs text-heemia-grey">{foto.length > 0 ? `${foto.length} foto caricate` : 'Nessuna foto caricata'}</span>
          </div>
          {fotoErrore && <p className="mb-3 rounded-heemia border-l-2 border-heemia-carmine bg-heemia-cream px-3 py-2 text-xs text-heemia-black">{fotoErrore}</p>}

          {foto.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {foto.map((f) => (
                <figure key={f.id} className="overflow-hidden rounded-heemia border border-heemia-border bg-white">
                  <img src={f.dataUrl} alt={f.nome} className="h-28 w-full object-cover" />
                  <figcaption className="flex items-center justify-between gap-1 px-2 py-1">
                    <span className="truncate text-[10px] text-heemia-grey" title={f.nome}>{f.nome}</span>
                    <button
                      type="button"
                      onClick={() => removeFoto(f.id)}
                      aria-label={`Elimina foto ${f.nome}`}
                      className="shrink-0 text-heemia-grey transition-colors hover:text-heemia-carmine"
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-end gap-2 border-t border-heemia-border pt-4">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button onClick={salva}>Salva scheda</Button>
        </div>
      </div>
    </Card>
  )
}
