import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Button } from '../../components/ui/Button'
import { Modal, Field, FormActions, fieldClass } from '../../components/ui/Modal'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { suppliers, products, invoices } from '../../mock'
import type { Material } from '../../types'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'
import { useMockStore, type NewMaterialInput } from '../../context/MockStore'

const emptyForm = {
  nome: '',
  codice: '',
  supplierId: '',
  composizione: '',
  colore: '',
  altezzaCm: '',
  prezzoAlMetro: '',
  metriAcquistati: '',
  sogliaMinima: '',
  stagione: '',
}

function AddMaterialForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: NewMaterialInput) => void }) {
  const [form, setForm] = useState(emptyForm)

  const submit = () => {
    if (!form.nome.trim() || !form.codice.trim() || !form.supplierId) return
    onSubmit({
      nome: form.nome.trim(),
      codice: form.codice.trim(),
      supplierId: form.supplierId,
      composizione: form.composizione.trim(),
      colore: form.colore.trim(),
      altezzaCm: form.altezzaCm ? Number(form.altezzaCm) : undefined,
      prezzoAlMetro: Number(form.prezzoAlMetro || 0),
      metriAcquistati: Number(form.metriAcquistati || 0),
      sogliaMinima: Number(form.sogliaMinima || 0),
      stagione: form.stagione.trim(),
    })
    onClose()
  }

  return (
    <Modal title="Aggiungi tessuto" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome tessuto">
          <input className={fieldClass} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </Field>
        <Field label="Codice">
          <input className={fieldClass} value={form.codice} onChange={(e) => setForm({ ...form, codice: e.target.value })} placeholder="TES-XXX-01" />
        </Field>
        <Field label="Fornitore">
          <select className={fieldClass} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
            <option value="">Seleziona…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Field>
        <Field label="Colore">
          <input className={fieldClass} value={form.colore} onChange={(e) => setForm({ ...form, colore: e.target.value })} />
        </Field>
        <Field label="Composizione">
          <input className={fieldClass} value={form.composizione} onChange={(e) => setForm({ ...form, composizione: e.target.value })} placeholder="100% Cotone" />
        </Field>
        <Field label="Stagione">
          <input className={fieldClass} value={form.stagione} onChange={(e) => setForm({ ...form, stagione: e.target.value })} placeholder="FW26" />
        </Field>
        <Field label="Altezza (cm)">
          <input type="number" min="0" className={fieldClass} value={form.altezzaCm} onChange={(e) => setForm({ ...form, altezzaCm: e.target.value })} />
        </Field>
        <Field label="Prezzo al metro (€)">
          <input type="number" min="0" step="0.01" className={fieldClass} value={form.prezzoAlMetro} onChange={(e) => setForm({ ...form, prezzoAlMetro: e.target.value })} />
        </Field>
        <Field label="Metri acquistati">
          <input type="number" min="0" step="0.1" className={fieldClass} value={form.metriAcquistati} onChange={(e) => setForm({ ...form, metriAcquistati: e.target.value })} />
        </Field>
        <Field label="Soglia minima">
          <input type="number" min="0" step="0.1" className={fieldClass} value={form.sogliaMinima} onChange={(e) => setForm({ ...form, sogliaMinima: e.target.value })} />
        </Field>
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button onClick={submit} disabled={!form.nome.trim() || !form.codice.trim() || !form.supplierId}>Salva tessuto</Button>
      </FormActions>
    </Modal>
  )
}

export function FabricsInventory() {
  const { role } = useRole()
  const { materials, addMaterial } = useMockStore()
  const [search, setSearch] = useState('')
  const [stato, setStato] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const rows = useMemo(
    () =>
      materials.filter((m) => {
        if (search && !`${m.nome} ${m.codice}`.toLowerCase().includes(search.toLowerCase())) return false
        if (stato && m.stato !== stato) return false
        return true
      }),
    [materials, search, stato],
  )

  const columns: DataTableColumn<Material>[] = [
    {
      header: 'Tessuto',
      accessor: (m) => (
        <div>
          <p className="font-display italic text-heemia-black">{m.nome}</p>
          <p className="font-mono-heemia text-[11px] text-heemia-grey">{m.codice}</p>
        </div>
      ),
    },
    { header: 'Fornitore', accessor: (m) => suppliers.find((s) => s.id === m.supplierId)?.nome ?? '–' },
    { header: 'Colore', accessor: (m) => m.colore },
    { header: 'Prezzo/m', accessor: (m) => formatCurrency(m.prezzoAlMetro), align: 'right' },
    { header: 'Residui', accessor: (m) => `${(m.metriAcquistati - m.metriUtilizzati).toFixed(1)} ${m.unitaMisura}`, align: 'right' },
    { header: 'Stato', accessor: (m) => <StatusBadge status={m.stato} /> },
    {
      header: '',
      accessor: (m) =>
        canEdit(role) && (m.stato === 'sotto_soglia' || m.stato === 'esaurito') ? (
          <Link
            to="/fornitori"
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium text-heemia-carmine hover:underline"
          >
            Genera richiesta →
          </Link>
        ) : null,
    },
  ]

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-heemia-grey">Scorte, soglie minime e fornitori collegati. Apri una riga per la scheda completa.</p>
        {canEdit(role) && <Button onClick={() => setAddOpen(true)}>Aggiungi tessuto</Button>}
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
        keyExtractor={(m) => m.id}
        emptyTitle="Nessun tessuto trovato"
        emptyDescription="Nessun tessuto corrisponde ai filtri selezionati."
        renderDetail={(m) => {
          const invoice = invoices.find((i) => i.id === m.fatturaId)
          const linkedProducts = m.prodottiCollegatiIds.map((pid) => products.find((p) => p.id === pid)?.nome).filter(Boolean)
          return (
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
              <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Composizione</p><p className="mt-0.5 text-heemia-black">{m.composizione}</p></div>
              <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Altezza</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{m.altezzaCm ? `${m.altezzaCm} cm` : '–'}</p></div>
              <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Data acquisto</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{formatDateIt(m.dataAcquisto)}</p></div>
              <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Stagione</p><p className="mt-0.5 text-heemia-black">{m.stagione}</p></div>
              <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Acquistati / utilizzati</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{m.metriAcquistati} / {m.metriUtilizzati} {m.unitaMisura}</p></div>
              <div>
                <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Fattura collegata</p>
                <p className="mt-0.5 text-heemia-black">
                  {invoice ? <Link to="/fatture" onClick={(e) => e.stopPropagation()} className="hover:underline">{invoice.numero}</Link> : '–'}
                </p>
              </div>
              <div className="col-span-2"><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Prodotti collegati</p><p className="mt-0.5 text-heemia-black">{linkedProducts.length > 0 ? linkedProducts.join(', ') : '–'}</p></div>
              <div className="col-span-2 sm:col-span-4"><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Consigli di lavaggio</p><p className="mt-0.5 text-heemia-black">{m.consigliLavaggio ?? '–'}</p></div>
              <div className="col-span-2 sm:col-span-4"><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Note tecniche</p><p className="mt-0.5 text-heemia-black">{m.noteTecniche ?? '–'}</p></div>
            </div>
          )
        }}
      />

      {addOpen && <AddMaterialForm onClose={() => setAddOpen(false)} onSubmit={addMaterial} />}
    </div>
  )
}
