import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal, Field, FormActions, campoClass, fieldClass } from '../../components/ui/Modal'
import { useFormSubmit, regole } from '../../hooks/useFormSubmit'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../../lib/format'
import type { Customer, TipologiaCliente } from '../../types'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'
import { useMockStore, type NewCustomerInput, type NewOrderInput } from '../../context/MockStore'

const TIPOLOGIA_LABEL: Record<string, string> = {
  ecommerce: 'E-commerce', showroom: 'Showroom', b2b: 'B2B', retailer: 'Retailer', showroom_partner: 'Showroom partner',
}

const emptyCustomerForm = { nome: '', email: '', paese: 'IT', tipologia: 'ecommerce' as TipologiaCliente }

function AddCustomerForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: NewCustomerInput) => void | Promise<unknown> }) {
  const [form, setForm] = useState(emptyCustomerForm)

  const { errori, inCorso, submit, pulisci } = useFormSubmit<'nome' | 'email'>(
    () => ({
      nome: regole.obbligatorio(form.nome, 'Il nome del cliente'),
      email: regole.email(form.email),
    }),
    async () => {
      await onSubmit({
        nome: form.nome.trim(),
        email: form.email.trim() || undefined,
        paese: form.paese,
        tipologia: form.tipologia,
      })
      onClose()
    },
  )

  return (
    <Modal title="Aggiungi cliente" onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome" required error={errori.nome}>
          <input className={campoClass(errori.nome)} value={form.nome} onChange={(e) => { setForm({ ...form, nome: e.target.value }); pulisci('nome') }} />
        </Field>
        <Field label="Email" error={errori.email} hint="Se già presente, il cliente viene riconosciuto.">
          <input type="email" className={campoClass(errori.email)} value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); pulisci('email') }} />
        </Field>
        <Field label="Paese">
          <input className={fieldClass} value={form.paese} onChange={(e) => setForm({ ...form, paese: e.target.value })} />
        </Field>
        <Field label="Tipologia">
          <select className={fieldClass} value={form.tipologia} onChange={(e) => setForm({ ...form, tipologia: e.target.value as TipologiaCliente })}>
            {Object.entries(TIPOLOGIA_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Annulla</Button>
        <Button onClick={() => void submit()} disabled={inCorso}>{inCorso ? 'Salvataggio…' : 'Salva cliente'}</Button>
      </FormActions>
    </Modal>
  )
}

const emptyOrderForm = { numero: '', canale: 'shopify' as 'shopify' | 'fisico', stato: 'in_lavorazione' as NewOrderInput['stato'], data: new Date().toISOString().slice(0, 10), totale: '' }

function AddOrderForm({ customerName, onClose, onSubmit }: { customerName: string; onClose: () => void; onSubmit: (input: Omit<NewOrderInput, 'customerId'>) => void | Promise<unknown> }) {
  const [form, setForm] = useState(emptyOrderForm)

  const { errori, inCorso, submit, pulisci } = useFormSubmit<'numero' | 'totale' | 'data'>(
    () => ({
      numero: regole.obbligatorio(form.numero, 'Il numero ordine'),
      totale: regole.numeroRichiesto(form.totale, 'Il totale'),
      data: form.data ? undefined : 'La data è obbligatoria.',
    }),
    async () => {
      await onSubmit({ numero: form.numero.trim(), canale: form.canale, stato: form.stato, data: form.data, totale: Number(form.totale) })
      onClose()
    },
  )

  return (
    <Modal title="Aggiungi ordine" subtitle={`Cliente: ${customerName}`} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Numero ordine" required error={errori.numero}>
          <input className={campoClass(errori.numero)} value={form.numero} onChange={(e) => { setForm({ ...form, numero: e.target.value }); pulisci('numero') }} placeholder="SH-10099" />
        </Field>
        <Field label="Data" required error={errori.data}>
          <input type="date" className={campoClass(errori.data)} value={form.data} onChange={(e) => { setForm({ ...form, data: e.target.value }); pulisci('data') }} />
        </Field>
        <Field label="Canale">
          <select className={fieldClass} value={form.canale} onChange={(e) => setForm({ ...form, canale: e.target.value as 'shopify' | 'fisico' })}>
            <option value="shopify">Shopify</option>
            <option value="fisico">Punto vendita</option>
          </select>
        </Field>
        <Field label="Stato">
          <select className={fieldClass} value={form.stato} onChange={(e) => setForm({ ...form, stato: e.target.value as NewOrderInput['stato'] })}>
            <option value="in_lavorazione">In lavorazione</option>
            <option value="spedito">Spedito</option>
            <option value="consegnato">Consegnato</option>
            <option value="annullato">Annullato</option>
          </select>
        </Field>
        <Field label="Totale (€)" required error={errori.totale}>
          <input type="number" min="0" step="0.01" className={campoClass(errori.totale)} value={form.totale} onChange={(e) => { setForm({ ...form, totale: e.target.value }); pulisci('totale') }} />
        </Field>
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Annulla</Button>
        <Button onClick={() => void submit()} disabled={inCorso}>{inCorso ? 'Salvataggio…' : 'Salva ordine'}</Button>
      </FormActions>
    </Modal>
  )
}

export function CustomerList() {
  const { role } = useRole()
  const { customers, orders, invoices, products, addCustomer, addOrder, caricamento } = useMockStore()
  const [search, setSearch] = useState('')
  const [tipologia, setTipologia] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const [addOrderOpen, setAddOrderOpen] = useState(false)

  const rows = useMemo(
    () =>
      customers.filter((c) => {
        if (search && !c.nome.toLowerCase().includes(search.toLowerCase())) return false
        if (tipologia && c.tipologia !== tipologia) return false
        return true
      }),
    [customers, search, tipologia],
  )

  const columns: DataTableColumn<Customer>[] = [
    { header: 'Cliente', accessor: (c) => <span className="font-display font-medium text-heemia-black">{c.nome}</span> },
    { header: 'Email', accessor: (c) => <span className="font-mono-heemia text-xs">{c.email ?? '–'}</span> },
    { header: 'Paese', accessor: (c) => c.paese },
    { header: 'Tipologia', accessor: (c) => <Badge variant="neutral">{TIPOLOGIA_LABEL[c.tipologia]}</Badge> },
    { header: 'Valore acquistato', accessor: (c) => formatCurrency(c.valoreTotaleAcquistato), align: 'right' },
    { header: 'Ordini', accessor: (c) => c.numeroOrdini, align: 'right' },
    { header: 'Sconto', accessor: (c) => (c.sconto ? `${c.sconto}%` : '–'), align: 'right' },
  ]

  const expandedCustomer = customers.find((c) => c.id === expandedId)
  const expandedOrders = expandedId ? orders.filter((o) => o.customerId === expandedId) : []
  // FR-25: fatture collegate al cliente e prodotti acquistati (derivati dagli ordini).
  const expandedInvoices = expandedId ? invoices.filter((i) => i.clienteId === expandedId) : []
  const purchasedProducts = [...new Set(expandedOrders.flatMap((o) => o.prodottiIds))]
    .map((pid) => products.find((p) => p.id === pid)?.nome)
    .filter(Boolean)

  return (
    <div>
      <PageHeader
        title="Clienti"
        subtitle="E-commerce, showroom, B2B e retailer."
        action={canEdit(role) ? <Button onClick={() => setAddCustomerOpen(true)}>Aggiungi cliente</Button> : undefined}
      />
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca cliente…"
        filters={[{ label: 'Tipologia', value: tipologia, onChange: setTipologia, options: Object.entries(TIPOLOGIA_LABEL).map(([value, label]) => ({ value, label })) }]}
      />
      <DataTable
        loading={caricamento}
        columns={columns}
        rows={rows}
        keyExtractor={(c) => c.id}
        onRowClick={(c) => setExpandedId(expandedId === c.id ? null : c.id)}
        emptyTitle="Nessun cliente trovato"
        emptyDescription="Nessun cliente corrisponde a questa tipologia."
      />

      {expandedId && expandedCustomer && (
        <div className="mt-4 animate-rise rounded-heemia-lg border border-heemia-border bg-white p-5 shadow-heemia-sm">
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="font-display text-heemia-black">Ordini di {expandedCustomer.nome}</p>
            {canEdit(role) && <Button variant="secondary" onClick={() => setAddOrderOpen(true)}>Aggiungi ordine</Button>}
          </div>
          {expandedOrders.length === 0 ? (
            <p className="text-sm text-heemia-grey">Nessun ordine registrato.</p>
          ) : (
            <ul className="divide-y divide-heemia-border">
              {expandedOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-mono-heemia text-xs">{o.numero} · {formatDateIt(o.data)}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono-heemia">{formatCurrency(o.totale)}</span>
                    <StatusBadge status={o.stato} />
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 border-t border-heemia-border pt-4 text-sm sm:grid-cols-3">
            <div>
              <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Prodotti acquistati</p>
              <p className="text-heemia-black">{purchasedProducts.join(', ') || '–'}</p>
            </div>
            <div>
              <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Fatture collegate</p>
              {expandedInvoices.length === 0 ? (
                <p className="text-heemia-black">–</p>
              ) : (
                <ul className="space-y-0.5">
                  {expandedInvoices.map((i) => (
                    <li key={i.id}>
                      <Link to="/fatture" className="font-mono-heemia text-xs text-heemia-black hover:underline">
                        {i.numero} · {formatCurrency(i.totale)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Note commerciali</p>
              <p className="text-heemia-black">{expandedCustomer.note ?? '–'}</p>
            </div>
          </div>
        </div>
      )}

      {addCustomerOpen && <AddCustomerForm onClose={() => setAddCustomerOpen(false)} onSubmit={addCustomer} />}
      {addOrderOpen && expandedCustomer && (
        <AddOrderForm
          customerName={expandedCustomer.nome}
          onClose={() => setAddOrderOpen(false)}
          onSubmit={(input) => addOrder({ ...input, customerId: expandedCustomer.id })}
        />
      )}
    </div>
  )
}
