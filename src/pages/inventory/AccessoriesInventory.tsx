import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Button } from '../../components/ui/Button'
import { Modal, Field, FormActions, fieldClass } from '../../components/ui/Modal'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency } from '../../lib/format'
import type { Accessory } from '../../types'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'
import { useMockStore, type NewAccessoryInput } from '../../context/MockStore'

const emptyForm = {
  nome: '',
  codice: '',
  categoria: '',
  supplierId: '',
  costoUnitario: '',
  quantitaAcquistata: '',
  sogliaMinima: '',
}

function AddAccessoryForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: NewAccessoryInput) => void }) {
  const { suppliers } = useMockStore()
  const [form, setForm] = useState(emptyForm)

  const submit = () => {
    if (!form.nome.trim() || !form.codice.trim() || !form.supplierId) return
    onSubmit({
      nome: form.nome.trim(),
      codice: form.codice.trim(),
      categoria: form.categoria.trim(),
      supplierId: form.supplierId,
      costoUnitario: Number(form.costoUnitario || 0),
      quantitaAcquistata: Number(form.quantitaAcquistata || 0),
      sogliaMinima: Number(form.sogliaMinima || 0),
    })
    onClose()
  }

  return (
    <Modal title="Aggiungi accessorio" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome">
          <input className={fieldClass} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </Field>
        <Field label="Codice">
          <input className={fieldClass} value={form.codice} onChange={(e) => setForm({ ...form, codice: e.target.value })} placeholder="ACC-XXX-01" />
        </Field>
        <Field label="Categoria">
          <input className={fieldClass} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Bottoni, zip, etichette…" />
        </Field>
        <Field label="Fornitore">
          <select className={fieldClass} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
            <option value="">Seleziona…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Field>
        <Field label="Costo unitario (€)">
          <input type="number" min="0" step="0.01" className={fieldClass} value={form.costoUnitario} onChange={(e) => setForm({ ...form, costoUnitario: e.target.value })} />
        </Field>
        <Field label="Quantità acquistata">
          <input type="number" min="0" className={fieldClass} value={form.quantitaAcquistata} onChange={(e) => setForm({ ...form, quantitaAcquistata: e.target.value })} />
        </Field>
        <Field label="Soglia minima">
          <input type="number" min="0" className={fieldClass} value={form.sogliaMinima} onChange={(e) => setForm({ ...form, sogliaMinima: e.target.value })} />
        </Field>
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button onClick={submit} disabled={!form.nome.trim() || !form.codice.trim() || !form.supplierId}>Salva accessorio</Button>
      </FormActions>
    </Modal>
  )
}

export function AccessoriesInventory() {
  const { role } = useRole()
  const navigate = useNavigate()
  const { accessories, suppliers, products, invoices, addAccessory, addSupplierRequest } = useMockStore()
  const [search, setSearch] = useState('')
  const [stato, setStato] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const rows = useMemo(
    () =>
      accessories.filter((a) => {
        if (search && !`${a.nome} ${a.codice}`.toLowerCase().includes(search.toLowerCase())) return false
        if (stato && a.stato !== stato) return false
        return true
      }),
    [accessories, search, stato],
  )

  const columns: DataTableColumn<Accessory>[] = [
    {
      header: 'Accessorio',
      accessor: (a) => (
        <div>
          <p className="font-display italic text-heemia-black">{a.nome}</p>
          <p className="font-mono-heemia text-[11px] text-heemia-grey">{a.codice}</p>
        </div>
      ),
    },
    { header: 'Categoria', accessor: (a) => a.categoria },
    { header: 'Fornitore', accessor: (a) => suppliers.find((s) => s.id === a.supplierId)?.nome ?? '–' },
    { header: 'Costo unitario', accessor: (a) => formatCurrency(a.costoUnitario), align: 'right' },
    { header: 'Residui', accessor: (a) => `${a.quantitaAcquistata - a.quantitaUtilizzata} ${a.unitaMisura}`, align: 'right' },
    { header: 'Stato', accessor: (a) => <StatusBadge status={a.stato} /> },
    {
      header: '',
      accessor: (a) =>
        canEdit(role) && (a.stato === 'sotto_soglia' || a.stato === 'esaurito') ? (
          <button
            type="button"
            onClick={(e) => {
              // FR-05: genera una bozza email fornitore precompilata e apre la sezione Fornitori.
              e.stopPropagation()
              addSupplierRequest({ accessoryId: a.id })
              navigate('/fornitori')
            }}
            className="text-xs font-medium text-heemia-carmine hover:underline"
          >
            Genera richiesta →
          </button>
        ) : null,
    },
  ]

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-heemia-grey">Bottoni, zip, etichette, packaging e altri accessori. Apri una riga per la scheda completa.</p>
        {canEdit(role) && <Button onClick={() => setAddOpen(true)}>Aggiungi accessorio</Button>}
      </div>
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca per nome o codice…"
        filters={[
          {
            label: 'Stato',
            value: stato,
            onChange: setStato,
            options: [
              { value: 'disponibile', label: 'Disponibile' },
              { value: 'sotto_soglia', label: 'Sotto soglia' },
              { value: 'esaurito', label: 'Esaurito' },
              { value: 'da_verificare', label: 'Da verificare' },
            ],
          },
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        keyExtractor={(a) => a.id}
        emptyTitle="Nessun accessorio trovato"
        emptyDescription="Nessun accessorio corrisponde ai filtri selezionati."
        renderDetail={(a) => {
          const invoice = invoices.find((i) => i.id === a.fatturaId)
          const linkedProducts = a.prodottiCollegatiIds.map((pid) => products.find((p) => p.id === pid)?.nome).filter(Boolean)
          return (
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
              <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Acquistati / utilizzati</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{a.quantitaAcquistata} / {a.quantitaUtilizzata} {a.unitaMisura}</p></div>
              <div>
                <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Fattura collegata</p>
                <p className="mt-0.5 text-heemia-black">
                  {invoice ? <Link to="/fatture" onClick={(e) => e.stopPropagation()} className="hover:underline">{invoice.numero}</Link> : '–'}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-2">
                <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Prodotti collegati</p>
                <p className="mt-0.5 text-heemia-black">{linkedProducts.length > 0 ? linkedProducts.join(', ') : '–'}</p>
              </div>
            </div>
          )
        }}
      />

      {addOpen && <AddAccessoryForm onClose={() => setAddOpen(false)} onSubmit={addAccessory} />}
    </div>
  )
}
