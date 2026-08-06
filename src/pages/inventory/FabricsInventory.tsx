import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Button } from '../../components/ui/Button'
import { Modal, Field, FormActions, campoClass, fieldClass } from '../../components/ui/Modal'
import { useFormSubmit, regole } from '../../hooks/useFormSubmit'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../../lib/format'
import type { Material } from '../../types'
import { useRole } from '../../context/RoleContext'
import { useGoatAlert } from '../../context/GoatAlertContext'
import { ApiError } from '../../lib/api'
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

function AddMaterialForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: NewMaterialInput) => void | Promise<unknown> }) {
  const { suppliers } = useMockStore()
  const [form, setForm] = useState(emptyForm)

  const { errori, inCorso, submit, pulisci } = useFormSubmit<
    'nome' | 'codice' | 'supplierId' | 'prezzoAlMetro' | 'metriAcquistati' | 'sogliaMinima' | 'altezzaCm'
  >(
    () => ({
      nome: regole.obbligatorio(form.nome, 'Il nome del tessuto'),
      codice: regole.obbligatorio(form.codice, 'Il codice'),
      supplierId: form.supplierId ? undefined : 'Scegli il fornitore.',
      prezzoAlMetro: regole.numeroPositivo(form.prezzoAlMetro, 'Il prezzo al metro'),
      metriAcquistati: regole.numeroPositivo(form.metriAcquistati, 'I metri acquistati'),
      sogliaMinima: regole.numeroPositivo(form.sogliaMinima, 'La soglia minima'),
      altezzaCm: regole.numeroPositivo(form.altezzaCm, "L'altezza"),
    }),
    async () => {
      await onSubmit({
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
    },
  )

  return (
    <Modal title="Aggiungi tessuto" onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome tessuto" required error={errori.nome}>
          <input className={campoClass(errori.nome)} value={form.nome} onChange={(e) => { setForm({ ...form, nome: e.target.value }); pulisci('nome') }} />
        </Field>
        <Field label="Codice" required error={errori.codice}>
          <input className={campoClass(errori.codice)} value={form.codice} onChange={(e) => { setForm({ ...form, codice: e.target.value }); pulisci('codice') }} placeholder="TES-XXX-01" />
        </Field>
        <Field label="Fornitore" required error={errori.supplierId}>
          <select className={campoClass(errori.supplierId)} value={form.supplierId} onChange={(e) => { setForm({ ...form, supplierId: e.target.value }); pulisci('supplierId') }}>
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
        <Field label="Altezza (cm)" error={errori.altezzaCm}>
          <input type="number" min="0" className={campoClass(errori.altezzaCm)} value={form.altezzaCm} onChange={(e) => { setForm({ ...form, altezzaCm: e.target.value }); pulisci('altezzaCm') }} />
        </Field>
        <Field label="Prezzo al metro (€)" error={errori.prezzoAlMetro} hint="Entra nel costo diretto del capo.">
          <input type="number" min="0" step="0.01" className={campoClass(errori.prezzoAlMetro)} value={form.prezzoAlMetro} onChange={(e) => { setForm({ ...form, prezzoAlMetro: e.target.value }); pulisci('prezzoAlMetro') }} />
        </Field>
        <Field label="Metri acquistati" error={errori.metriAcquistati}>
          <input type="number" min="0" step="0.1" className={campoClass(errori.metriAcquistati)} value={form.metriAcquistati} onChange={(e) => { setForm({ ...form, metriAcquistati: e.target.value }); pulisci('metriAcquistati') }} />
        </Field>
        <Field label="Soglia minima" error={errori.sogliaMinima} hint="Sotto questa quantità scatta l'alert.">
          <input type="number" min="0" step="0.1" className={campoClass(errori.sogliaMinima)} value={form.sogliaMinima} onChange={(e) => { setForm({ ...form, sogliaMinima: e.target.value }); pulisci('sogliaMinima') }} />
        </Field>
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Annulla</Button>
        <Button onClick={() => void submit()} disabled={inCorso}>{inCorso ? 'Salvataggio…' : 'Salva tessuto'}</Button>
      </FormActions>
    </Modal>
  )
}

export function FabricsInventory() {
  const { role } = useRole()
  const navigate = useNavigate()
  const { materials, suppliers, products, invoices, addMaterial, addSupplierRequest, caricamento } = useMockStore()
  const { avvisa } = useGoatAlert()
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
          <p className="font-display text-heemia-black">{m.nome}</p>
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
          <button
            type="button"
            onClick={async (e) => {
              // FR-05: genera una bozza email fornitore precompilata e apre la sezione Fornitori.
              // Si aspetta l'esito prima di cambiare pagina: se la bozza non viene creata,
              // portare l'utente in Fornitori a cercare qualcosa che non c'è è peggio che dirlo.
              e.stopPropagation()
              try {
                await addSupplierRequest({ materialId: m.id })
                navigate('/fornitori')
              } catch (err) {
                avvisa('salvataggio', {
                  testo: err instanceof ApiError ? err.message : 'Non è stato possibile creare la bozza per il fornitore.',
                })
              }
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
        loading={caricamento}
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
