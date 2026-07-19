import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal, Field, FormActions, fieldClass } from '../../components/ui/Modal'
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

function AddCustomerForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: NewCustomerInput) => void }) {
  const [form, setForm] = useState(emptyCustomerForm)

  const submit = () => {
    if (!form.nome.trim()) return
    onSubmit({
      nome: form.nome.trim(),
      email: form.email.trim() || undefined,
      paese: form.paese,
      tipologia: form.tipologia,
    })
    onClose()
  }

  return (
    <Modal title="Aggiungi cliente" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome">
          <input className={fieldClass} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </Field>
        <Field label="Email">
          <input type="email" className={fieldClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button onClick={submit} disabled={!form.nome.trim()}>Salva cliente</Button>
      </FormActions>
    </Modal>
  )
}

const emptyOrderForm = { numero: '', canale: 'shopify' as 'shopify' | 'fisico', stato: 'in_lavorazione' as NewOrderInput['stato'], data: new Date().toISOString().slice(0, 10), totale: '' }

function AddOrderForm({ customerName, onClose, onSubmit }: { customerName: string; onClose: () => void; onSubmit: (input: Omit<NewOrderInput, 'customerId'>) => void }) {
  const [form, setForm] = useState(emptyOrderForm)

  const submit = () => {
    if (!form.numero.trim() || !form.totale) return
    onSubmit({ numero: form.numero.trim(), canale: form.canale, stato: form.stato, data: form.data, totale: Number(form.totale) })
    onClose()
  }

  return (
    <Modal title="Aggiungi ordine" subtitle={`Cliente: ${customerName}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Numero ordine">
          <input className={fieldClass} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="SH-10099" />
        </Field>
        <Field label="Data">
          <input type="date" className={fieldClass} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
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
        <Field label="Totale (€)">
          <input type="number" min="0" step="0.01" className={fieldClass} value={form.totale} onChange={(e) => setForm({ ...form, totale: e.target.value })} />
        </Field>
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button onClick={submit} disabled={!form.numero.trim() || !form.totale}>Salva ordine</Button>
      </FormActions>
    </Modal>
  )
}

export function CustomerList() {
  const { role } = useRole()
  const { customers, orders, invoices, products, addCustomer, addOrder } = useMockStore()
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
    { header: 'Cliente', accessor: (c) => <span className="font-display italic text-heemia-black">{c.nome}</span> },
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
        columns={columns}
        rows={rows}
        keyExtractor={(c) => c.id}
        onRowClick={(c) => setExpandedId(expandedId === c.id ? null : c.id)}
        emptyTitle="Nessun cliente trovato"
        emptyDescription="Nessun cliente corrisponde a questa tipologia."
      />

      {expandedId && expandedCustomer && (
        <div className="mt-4 rounded-[3px] border border-heemia-border bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="font-display italic text-heemia-black">Ordini di {expandedCustomer.nome}</p>
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
