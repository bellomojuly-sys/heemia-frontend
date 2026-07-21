import { useMemo, useRef, useState } from 'react'
import { FileText, ExternalLink, Upload, Sparkles } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Modal, Field, FormActions, fieldClass } from '../../components/ui/Modal'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { costAllocations } from '../../mock'
import type { Invoice, CategoriaCosto } from '../../types'
import { useMockStore, meseLabel, type NewInvoiceInput, type NewCashClosureInput } from '../../context/MockStore'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'

// FR-41: parsing "best-effort" dell'export scontrini di Billy. Formato non ancora verificato
// sul file reale (Billy non ha API): si accetta un CSV con una colonna importo/totale e si
// somma; l'utente può comunque correggere i valori precompilati. DA VALIDARE sul vero export.
function parseScontriniCsv(text: string): { totale: number; numero: number } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return { totale: 0, numero: 0 }
  const delim = lines[0].includes(';') ? ';' : ','
  const header = lines[0].split(delim).map((h) => h.trim().toLowerCase())
  let col = header.findIndex((h) => /(totale|importo|incass|ammontare)/i.test(h))
  if (col < 0) col = header.length - 1 // fallback: ultima colonna
  let totale = 0
  let numero = 0
  for (const line of lines.slice(1)) {
    const cells = line.split(delim)
    const raw = (cells[col] ?? '').replace(/[€\s]/g, '')
    // gestisce sia "1.234,56" (it) sia "1234.56" (en)
    const norm = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
    const val = parseFloat(norm)
    if (Number.isFinite(val)) {
      totale += val
      numero += 1
    }
  }
  return { totale: Math.round(totale * 100) / 100, numero }
}

function mesePrecedente(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const CATEGORIA_LABEL: Record<string, string> = {
  tessuto: 'Tessuto', accessori: 'Accessori', manodopera: 'Manodopera', packaging: 'Packaging',
  spedizione: 'Spedizione', marketing: 'Marketing', logistica: 'Logistica', servizi: 'Servizi', costi_generali: 'Costi generali',
}

const ALLOCATION_LABEL: Record<string, string> = {
  diretto_prodotto: 'Diretto prodotto', per_categoria: 'Per categoria', per_collezione: 'Per collezione',
  per_numero_capi: 'Per numero capi', per_fatturato: 'Per fatturato', per_mese: 'Per mese', non_allocabile: 'Non allocabile',
}

const emptyForm = {
  numero: '',
  data: new Date().toISOString().slice(0, 10),
  controparte: '' as 'fornitore' | 'cliente' | '',
  fornitoreId: '',
  clienteId: '',
  paese: 'IT' as Invoice['paese'],
  valuta: 'EUR',
  tassoCambio: '',
  dataCambio: '',
  imponibile: '',
  iva: '',
  categoriaCosto: 'servizi' as CategoriaCosto,
  metodoPagamento: 'Bonifico',
  statoPagamento: 'da_pagare' as Invoice['statoPagamento'],
  dataScadenza: '',
  documentoUrl: '',
  prodottiIds: [] as string[],
  materialiIds: [] as string[],
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

function CheckList({ label, options, selected, onToggle }: {
  label: string
  options: { id: string; nome: string }[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div>
      <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{label}</span>
      <div className="max-h-28 overflow-y-auto rounded-[3px] border border-heemia-border p-2">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 py-0.5 text-sm text-heemia-black">
            <input
              type="checkbox"
              checked={selected.includes(o.id)}
              onChange={() => onToggle(o.id)}
              className="h-3.5 w-3.5 accent-heemia-black"
            />
            {o.nome}
          </label>
        ))}
      </div>
    </div>
  )
}

function AddInvoiceForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: NewInvoiceInput) => void }) {
  const { suppliers, customers, products, materials } = useMockStore()
  const [form, setForm] = useState(emptyForm)

  const isEstera = form.valuta.trim().toUpperCase() !== 'EUR' && form.valuta.trim() !== ''

  const submit = () => {
    if (!form.numero.trim() || !form.imponibile) return
    const tasso = isEstera && form.tassoCambio ? Number(form.tassoCambio) : undefined
    const imponibileInput = Number(form.imponibile)
    const iva = Number(form.iva || 0)
    // FR-22: per le fatture estere l'importo inserito è in valuta originale;
    // la conversione in euro è calcolata automaticamente col tasso di cambio.
    const imponibileEur = tasso ? Math.round(imponibileInput * tasso * 100) / 100 : imponibileInput
    onSubmit({
      numero: form.numero.trim(),
      data: form.data,
      fornitoreId: form.controparte === 'fornitore' && form.fornitoreId ? form.fornitoreId : undefined,
      clienteId: form.controparte === 'cliente' && form.clienteId ? form.clienteId : undefined,
      paese: form.paese,
      valuta: form.valuta.trim().toUpperCase() || 'EUR',
      tassoCambio: tasso,
      dataCambio: isEstera && form.dataCambio ? form.dataCambio : undefined,
      imponibileValutaOriginale: tasso ? imponibileInput : undefined,
      totaleValutaOriginale: tasso ? Math.round((imponibileInput + iva / tasso) * 100) / 100 : undefined,
      imponibile: imponibileEur,
      iva,
      categoriaCosto: form.categoriaCosto,
      metodoPagamento: form.metodoPagamento,
      statoPagamento: form.statoPagamento,
      dataScadenza: form.dataScadenza || undefined,
      documentoUrl: form.documentoUrl.trim() || undefined,
      prodottiCollegatiIds: form.prodottiIds,
      materialiCollegatiIds: form.materialiIds,
    })
    onClose()
  }

  return (
    <Modal title="Aggiungi fattura" subtitle="Numero, importi, allegato e collegamenti a prodotti o materiali." onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Numero fattura">
          <input className={fieldClass} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="FT-2026-0001" />
        </Field>
        <Field label="Data">
          <input type="date" className={fieldClass} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
        </Field>
        <Field label="Controparte">
          <select className={fieldClass} value={form.controparte} onChange={(e) => setForm({ ...form, controparte: e.target.value as typeof form.controparte })}>
            <option value="">Nessuna</option>
            <option value="fornitore">Fornitore</option>
            <option value="cliente">Cliente</option>
          </select>
        </Field>
        {form.controparte === 'fornitore' && (
          <Field label="Fornitore">
            <select className={fieldClass} value={form.fornitoreId} onChange={(e) => setForm({ ...form, fornitoreId: e.target.value })}>
              <option value="">Seleziona…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </Field>
        )}
        {form.controparte === 'cliente' && (
          <Field label="Cliente">
            <select className={fieldClass} value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
              <option value="">Seleziona…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
        )}
        <Field label="Paese">
          <select className={fieldClass} value={form.paese} onChange={(e) => setForm({ ...form, paese: e.target.value as Invoice['paese'] })}>
            <option value="IT">Italia</option>
            <option value="EU">UE</option>
            <option value="Extra-EU">Extra-UE</option>
          </select>
        </Field>
        <Field label="Valuta">
          <input className={fieldClass} value={form.valuta} onChange={(e) => setForm({ ...form, valuta: e.target.value })} />
        </Field>
        {isEstera && (
          <>
            <Field label="Tasso di cambio → EUR">
              <input type="number" min="0" step="0.0001" className={fieldClass} value={form.tassoCambio} onChange={(e) => setForm({ ...form, tassoCambio: e.target.value })} placeholder="1.02" />
            </Field>
            <Field label="Data del cambio">
              <input type="date" className={fieldClass} value={form.dataCambio} onChange={(e) => setForm({ ...form, dataCambio: e.target.value })} />
            </Field>
          </>
        )}
        <Field label={isEstera ? `Imponibile (${form.valuta.trim().toUpperCase()})` : 'Imponibile (€)'}>
          <input type="number" min="0" step="0.01" className={fieldClass} value={form.imponibile} onChange={(e) => setForm({ ...form, imponibile: e.target.value })} />
        </Field>
        <Field label="IVA (€)">
          <input type="number" min="0" step="0.01" className={fieldClass} value={form.iva} onChange={(e) => setForm({ ...form, iva: e.target.value })} />
        </Field>
        {isEstera && form.imponibile && form.tassoCambio && (
          <div className="col-span-2 rounded-[3px] bg-heemia-cream px-3 py-2 text-xs text-heemia-grey">
            Conversione automatica: {formatCurrency(Number(form.imponibile) * Number(form.tassoCambio))} imponibile in EUR (cambio {form.tassoCambio}).
          </div>
        )}
        <Field label="Categoria costo">
          <select className={fieldClass} value={form.categoriaCosto} onChange={(e) => setForm({ ...form, categoriaCosto: e.target.value as CategoriaCosto })}>
            {Object.entries(CATEGORIA_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Metodo pagamento">
          <input className={fieldClass} value={form.metodoPagamento} onChange={(e) => setForm({ ...form, metodoPagamento: e.target.value })} />
        </Field>
        <Field label="Stato pagamento">
          <select className={fieldClass} value={form.statoPagamento} onChange={(e) => setForm({ ...form, statoPagamento: e.target.value as Invoice['statoPagamento'] })}>
            <option value="da_pagare">Da pagare</option>
            <option value="pagata">Pagata</option>
            <option value="scaduta">Scaduta</option>
          </select>
        </Field>
        <Field label="Data scadenza">
          <input type="date" className={fieldClass} value={form.dataScadenza} onChange={(e) => setForm({ ...form, dataScadenza: e.target.value })} />
        </Field>
        <div className="col-span-2">
          <Field label="Documento allegato (link Drive al PDF)">
            <input className={fieldClass} value={form.documentoUrl} onChange={(e) => setForm({ ...form, documentoUrl: e.target.value })} placeholder="https://drive.google.com/…" />
          </Field>
        </div>
        <CheckList
          label="Prodotti collegati"
          options={products.map((p) => ({ id: p.id, nome: p.nome }))}
          selected={form.prodottiIds}
          onToggle={(id) => setForm({ ...form, prodottiIds: toggleId(form.prodottiIds, id) })}
        />
        <CheckList
          label="Materiali collegati"
          options={materials.map((m) => ({ id: m.id, nome: m.nome }))}
          selected={form.materialiIds}
          onToggle={(id) => setForm({ ...form, materialiIds: toggleId(form.materialiIds, id) })}
        />
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button onClick={submit} disabled={!form.numero.trim() || !form.imponibile}>Salva fattura</Button>
      </FormActions>
    </Modal>
  )
}

// Dettaglio riga: collegamenti correnti e, per chi può modificare, associazione a
// prodotti/materiali anche dopo il caricamento (FR-19).
function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const { role } = useRole()
  const { products, materials, updateInvoiceAssociations } = useMockStore()
  const [prodottiIds, setProdottiIds] = useState<string[]>(invoice.prodottiCollegatiIds)
  const [materialiIds, setMaterialiIds] = useState<string[]>(invoice.materialiCollegatiIds)

  const changed =
    prodottiIds.join(',') !== invoice.prodottiCollegatiIds.join(',') ||
    materialiIds.join(',') !== invoice.materialiCollegatiIds.join(',')

  return (
    <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
      <div>
        <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Documento allegato</p>
        {invoice.documentoUrl ? (
          <a href={invoice.documentoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-heemia-black hover:underline">
            <FileText aria-hidden className="h-4 w-4 text-heemia-grey" /> Apri PDF fattura <ExternalLink aria-hidden className="h-3 w-3" />
          </a>
        ) : (
          <p className="text-heemia-grey">Nessun documento collegato.</p>
        )}
        {invoice.tassoCambio && (
          <div className="mt-3">
            <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Cambio applicato</p>
            <p className="font-mono-heemia text-heemia-black">
              {invoice.totaleValutaOriginale?.toFixed(2)} {invoice.valuta} × {invoice.tassoCambio} = {formatCurrency(invoice.totale)}
            </p>
            {invoice.dataCambio && <p className="text-xs text-heemia-grey">Cambio del {formatDateIt(invoice.dataCambio)}</p>}
          </div>
        )}
      </div>
      {canEdit(role) ? (
        <>
          <CheckList
            label="Prodotti collegati"
            options={products.map((p) => ({ id: p.id, nome: p.nome }))}
            selected={prodottiIds}
            onToggle={(id) => setProdottiIds((prev) => toggleId(prev, id))}
          />
          <div className="flex flex-col gap-3">
            <CheckList
              label="Materiali collegati"
              options={materials.map((m) => ({ id: m.id, nome: m.nome }))}
              selected={materialiIds}
              onToggle={(id) => setMaterialiIds((prev) => toggleId(prev, id))}
            />
            <div>
              <Button
                disabled={!changed}
                onClick={(e) => {
                  e.stopPropagation()
                  updateInvoiceAssociations(invoice.id, prodottiIds, materialiIds)
                }}
              >
                Salva associazioni
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="sm:col-span-2">
          <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Collegamenti</p>
          <p className="text-heemia-black">
            {[
              ...invoice.prodottiCollegatiIds.map((pid) => products.find((p) => p.id === pid)?.nome),
              ...invoice.materialiCollegatiIds.map((mid) => materials.find((m) => m.id === mid)?.nome),
            ].filter(Boolean).join(', ') || 'Nessuno'}
          </p>
        </div>
      )}
    </div>
  )
}

function CashClosureModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: NewCashClosureInput) => void }) {
  const [mese, setMese] = useState(mesePrecedente())
  const [totale, setTotale] = useState('')
  const [numero, setNumero] = useState('')
  const [fileNome, setFileNome] = useState('')
  const [note, setNote] = useState('')
  const [parseInfo, setParseInfo] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = (file: File) => {
    setFileNome(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const { totale: t, numero: n } = parseScontriniCsv(String(reader.result ?? ''))
      if (n > 0) {
        setTotale(String(t))
        setNumero(String(n))
        setParseInfo(`Letti ${n} scontrini dall'export, totale ${formatCurrency(t)}. Verifica e correggi se serve.`)
      } else {
        setParseInfo('Non sono riuscito a leggere automaticamente gli importi da questo file: inseriscili a mano qui sotto.')
      }
    }
    reader.readAsText(file)
  }

  const submit = () => {
    if (!mese || !totale) return
    onSubmit({
      mese,
      totaleIncassato: Number(totale),
      numeroScontrini: Number(numero || 0),
      fileNome: fileNome || undefined,
      note: note.trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal title="Chiusura di cassa mensile" subtitle="Carica l'export scontrini scaricato da Billy: il totale del mese viene calcolato in automatico." onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Mese di riferimento">
          <input type="month" className={fieldClass} value={mese} onChange={(e) => setMese(e.target.value)} />
        </Field>
        <Field label="Export scontrini (Billy)">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden className="mr-1.5 inline h-3.5 w-3.5" />
            {fileNome || 'Carica file CSV'}
          </Button>
        </Field>
      </div>
      {parseInfo && <p className="mt-2 rounded-[3px] bg-heemia-cream px-3 py-2 text-xs text-heemia-black">{parseInfo}</p>}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Totale incassato (EUR)">
          <input type="number" step="0.01" className={fieldClass} value={totale} onChange={(e) => setTotale(e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Numero scontrini">
          <input type="number" className={fieldClass} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="0" />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Note (opzionale)">
          <input className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. include il mercatino del 12" />
        </Field>
      </div>
      <FormActions>
        <Button variant="secondary" onClick={onClose}>Annulla</Button>
        <Button onClick={submit} disabled={!mese || !totale}>Registra chiusura</Button>
      </FormActions>
    </Modal>
  )
}

function CashClosureSection() {
  const { role } = useRole()
  const { cashClosures, addCashClosure } = useMockStore()
  const [open, setOpen] = useState(false)

  const closures = useMemo(() => [...cashClosures].sort((a, b) => b.mese.localeCompare(a.mese)), [cashClosures])
  const ultima = closures[0]
  const mesePrec = mesePrecedente()
  const mancaPrec = !cashClosures.some((c) => c.mese === mesePrec)

  return (
    <Card className="mb-6">
      <CardHeader
        title="Chiusura di cassa mensile"
        subtitle="Vendiamo con scontrino, non con fattura: qui carichi una volta al mese l'export scontrini da Billy per sapere quanto hai incassato."
        action={canEdit(role) ? <Button onClick={() => setOpen(true)}>Registra chiusura del mese</Button> : undefined}
      />
      <div className="space-y-4 p-4">
        {mancaPrec && (
          <div className="rounded-[3px] border-l-2 border-heemia-carmine bg-heemia-cream px-3 py-2 text-sm text-heemia-black">
            Promemoria: la chiusura di <strong>{meseLabel(mesePrec)}</strong> non è ancora stata registrata. Vai su Billy, scarica l'export scontrini del mese e caricalo qui.
          </div>
        )}

        {ultima && (
          <div className="rounded-[3px] border border-heemia-border p-3">
            <div className="flex items-center gap-1.5">
              <Sparkles aria-hidden className="h-3.5 w-3.5 text-heemia-grey" />
              <span className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Riepilogo assistant · {meseLabel(ultima.mese)}</span>
            </div>
            <p className="mt-1 text-sm text-heemia-black">{ultima.riepilogoAI}</p>
          </div>
        )}

        {closures.length > 0 ? (
          <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0">
            <thead>
              <tr className="border-b border-heemia-border text-left">
                <th className="py-1.5 font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Mese</th>
                <th className="py-1.5 text-right font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Incassato</th>
                <th className="py-1.5 text-right font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Scontrini</th>
                <th className="py-1.5 font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Registrata il</th>
                <th className="py-1.5 font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">File</th>
              </tr>
            </thead>
            <tbody>
              {closures.map((c) => (
                <tr key={c.id} className="border-b border-heemia-border/60">
                  <td className="py-1.5 text-heemia-black">{meseLabel(c.mese)}</td>
                  <td className="py-1.5 text-right font-mono-heemia text-heemia-black">{formatCurrency(c.totaleIncassato)}</td>
                  <td className="py-1.5 text-right font-mono-heemia text-heemia-grey">{c.numeroScontrini}</td>
                  <td className="py-1.5 text-heemia-grey">{formatDateIt(c.importatoIl)}</td>
                  <td className="py-1.5 text-heemia-grey">{c.fileNome ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-heemia-grey">Nessuna chiusura registrata. Registra la prima chiusura per iniziare a tenere il quadro degli incassi.</p>
        )}
      </div>

      {open && <CashClosureModal onClose={() => setOpen(false)} onSubmit={addCashClosure} />}
    </Card>
  )
}

export function InvoiceList() {
  const { role } = useRole()
  const { invoices, suppliers, customers, addInvoice } = useMockStore()
  const [search, setSearch] = useState('')
  const [stato, setStato] = useState('')
  const [categoria, setCategoria] = useState('')
  const [paese, setPaese] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  const rows = useMemo(
    () =>
      invoices.filter((i) => {
        if (search && !i.numero.toLowerCase().includes(search.toLowerCase())) return false
        if (stato && i.statoPagamento !== stato) return false
        if (categoria && i.categoriaCosto !== categoria) return false
        if (paese && i.paese !== paese) return false
        return true
      }),
    [invoices, search, stato, categoria, paese],
  )

  const columns: DataTableColumn<Invoice>[] = [
    {
      header: 'Numero',
      accessor: (i) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono-heemia text-[12px] text-heemia-black">{i.numero}</span>
          {i.documentoUrl && <FileText aria-hidden className="h-3.5 w-3.5 text-heemia-grey" />}
        </span>
      ),
    },
    { header: 'Data', accessor: (i) => formatDateIt(i.data) },
    {
      header: 'Fornitore/Cliente',
      accessor: (i) => (
        <span className="font-display italic">
          {(i.fornitoreId && suppliers.find((s) => s.id === i.fornitoreId)?.nome) ||
            (i.clienteId && customers.find((c) => c.id === i.clienteId)?.nome) ||
            '–'}
        </span>
      ),
    },
    {
      header: 'Paese/Valuta',
      accessor: (i) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono-heemia text-xs">{i.paese} · {i.valuta}</span>
          {i.tassoCambio && i.totaleValutaOriginale && (
            <span className="font-mono-heemia text-[11px] text-heemia-grey">
              {i.totaleValutaOriginale.toFixed(2)} {i.valuta} · cambio {i.tassoCambio}
            </span>
          )}
          {i.reverseCharge && <Badge variant="info">Reverse charge</Badge>}
        </div>
      ),
    },
    // FR-22: gli importi sono sempre in EUR (conversione automatica per le fatture estere).
    { header: 'Totale (EUR)', accessor: (i) => formatCurrency(i.totale), align: 'right' },
    { header: 'Categoria', accessor: (i) => CATEGORIA_LABEL[i.categoriaCosto] ?? i.categoriaCosto },
    { header: 'Allocazione', accessor: (i) => {
      const ca = costAllocations.find((c) => c.invoiceId === i.id)
      return ca ? ALLOCATION_LABEL[ca.modalita] : <span className="text-heemia-grey">–</span>
    } },
    { header: 'Pagamento', accessor: (i) => <StatusBadge status={i.statoPagamento} /> },
    { header: 'Scadenza', accessor: (i) => formatDateIt(i.dataScadenza) },
    { header: 'Associata', accessor: (i) => (i.associata ? <span className="text-heemia-grey">Sì</span> : <Badge variant="warning">No, da categorizzare</Badge>) },
  ]

  return (
    <div>
      <PageHeader
        title="Fatture"
        subtitle="Fatture fornitori, clienti, materiali e costi aziendali centralizzati. Apri una riga per allegato e associazioni."
        action={canEdit(role) ? <Button onClick={() => setModalOpen(true)}>Aggiungi fattura</Button> : undefined}
      />

      <CashClosureSection />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca per numero…"
        filters={[
          { label: 'Stato pagamento', value: stato, onChange: setStato, options: [
            { value: 'da_pagare', label: 'Da pagare' }, { value: 'pagata', label: 'Pagata' }, { value: 'scaduta', label: 'Scaduta' },
          ] },
          { label: 'Categoria', value: categoria, onChange: setCategoria, options: Object.entries(CATEGORIA_LABEL).map(([value, label]) => ({ value, label })) },
          { label: 'Paese', value: paese, onChange: setPaese, options: [
            { value: 'IT', label: 'Italia' }, { value: 'EU', label: 'UE' }, { value: 'Extra-EU', label: 'Extra-UE' },
          ] },
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        keyExtractor={(i) => i.id}
        emptyTitle="Nessuna fattura trovata"
        emptyDescription="Nessuna fattura corrisponde alla combinazione di filtri selezionata."
        renderDetail={(i) => <InvoiceDetail key={i.id} invoice={i} />}
      />

      {modalOpen && <AddInvoiceForm onClose={() => setModalOpen(false)} onSubmit={addInvoice} />}
    </div>
  )
}
