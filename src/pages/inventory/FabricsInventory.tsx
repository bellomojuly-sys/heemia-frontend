import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { materials, suppliers, products, invoices } from '../../mock'
import type { Material } from '../../types'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'

export function FabricsInventory() {
  const { role } = useRole()
  const [search, setSearch] = useState('')
  const [stato, setStato] = useState('')

  const rows = useMemo(
    () =>
      materials.filter((m) => {
        if (search && !`${m.nome} ${m.codice}`.toLowerCase().includes(search.toLowerCase())) return false
        if (stato && m.stato !== stato) return false
        return true
      }),
    [search, stato],
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
    { header: 'Fornitore', accessor: (m) => suppliers.find((s) => s.id === m.supplierId)?.nome ?? '—' },
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
      <PageHeader title="Inventario tessuti" subtitle="Scorte, soglie minime e fornitori collegati (FR-04). Apri una riga per la scheda completa." />
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
              <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Altezza</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{m.altezzaCm ? `${m.altezzaCm} cm` : '—'}</p></div>
              <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Data acquisto</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{formatDateIt(m.dataAcquisto)}</p></div>
              <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Stagione</p><p className="mt-0.5 text-heemia-black">{m.stagione}</p></div>
              <div><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Acquistati / utilizzati</p><p className="font-mono-heemia mt-0.5 text-heemia-black">{m.metriAcquistati} / {m.metriUtilizzati} {m.unitaMisura}</p></div>
              <div>
                <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Fattura collegata</p>
                <p className="mt-0.5 text-heemia-black">
                  {invoice ? <Link to="/fatture" onClick={(e) => e.stopPropagation()} className="hover:underline">{invoice.numero}</Link> : '—'}
                </p>
              </div>
              <div className="col-span-2"><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Prodotti collegati</p><p className="mt-0.5 text-heemia-black">{linkedProducts.length > 0 ? linkedProducts.join(', ') : '—'}</p></div>
              <div className="col-span-2 sm:col-span-4"><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Consigli di lavaggio</p><p className="mt-0.5 text-heemia-black">{m.consigliLavaggio ?? '—'}</p></div>
              <div className="col-span-2 sm:col-span-4"><p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Note tecniche</p><p className="mt-0.5 text-heemia-black">{m.noteTecniche ?? '—'}</p></div>
            </div>
          )
        }}
      />
    </div>
  )
}
