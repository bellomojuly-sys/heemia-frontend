import { useMemo, useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal, Field, FormActions, fieldClass } from '../../components/ui/Modal'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { costAllocations, suppliers, customers } from '../../mock'
import type { Invoice, CategoriaCosto } from '../../types'
import { useMockStore, type NewInvoiceInput } from '../../context/MockStore'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'

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
  imponibile: '',
  iva: '',
  categoriaCosto: 'servizi' as CategoriaCosto,
  metodoPagamento: 'Bonifico',
  statoPagamento: 'da_pagare' as Invoice['statoPagamento'],
  dataScadenza: '',
}

function AddInvoiceForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: NewInvoiceInput) => void }) {
  const [form, setForm] = useState(emptyForm)

  const submit = () => {
    if (!form.numero.trim() || !form.imponibile) return
    const imponibile = Number(form.imponibile)
    const iva = Number(form.iva || 0)
    onSubmit({
      numero: form.numero.trim(),
      data: form.data,
      fornitoreId: form.controparte === 'fornitore' && form.fornitoreId ? form.fornitoreId : undefined,
      clienteId: form.controparte === 'cliente' && form.clienteId ? form.clienteId : undefined,
      paese: form.paese,
      valuta: form.valuta,
      imponibile,
      iva,
      categoriaCosto: form.categoriaCosto,
      metodoPagamento: form.metodoPagamento,
      statoPagamento: form.statoPagamento,
      dataScadenza: form.dataScadenza || undefined,
    })
    onClose()
  }

  return (
    <Modal title="Aggiungi fattura" subtitle="Numero, importi e categoria costo. Puoi associare prodotti/materiali dopo il salvataggio." onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
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
        <Field label="Imponibile (€)">
          <input type="number" min="0" step="0.01" className={fieldClass} value={form.imponibile} onChange={(e) => setForm({ ...form, imponibile: e.target.value })} />
        </Field>
        <Field label="IVA (€)">
          <input type="number" min="0" step="0.01" className={fieldClass} value={form.iva} onChange={(e) => setForm({ ...form, iva: e.target.value })} />
        </Field>
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
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button onClick={submit} disabled={!form.numero.trim() || !form.imponibile}>Salva fattura</Button>
      </FormActions>
    </Modal>
  )
}

export function InvoiceList() {
  const { role } = useRole()
  const { invoices, addInvoice } = useMockStore()
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
    { header: 'Numero', accessor: (i) => <span className="font-mono-heemia text-[12px] text-heemia-black">{i.numero}</span> },
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
          {i.tassoCambio && <span className="font-mono-heemia text-[11px] text-heemia-grey">Cambio {i.tassoCambio}</span>}
          {i.reverseCharge && <Badge variant="info">Reverse charge</Badge>}
        </div>
      ),
    },
    { header: 'Totale', accessor: (i) => formatCurrency(i.totale, i.valuta), align: 'right' },
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
        subtitle="Fatture fornitori, clienti, materiali e costi aziendali centralizzati."
        action={canEdit(role) ? <Button onClick={() => setModalOpen(true)}>Aggiungi fattura</Button> : undefined}
      />
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
      />

      {modalOpen && <AddInvoiceForm onClose={() => setModalOpen(false)} onSubmit={addInvoice} />}
    </div>
  )
}
