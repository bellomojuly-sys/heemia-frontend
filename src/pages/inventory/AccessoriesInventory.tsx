import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency } from '../../lib/format'
import { accessories, suppliers, products, invoices } from '../../mock'
import type { Accessory } from '../../types'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'

export function AccessoriesInventory() {
  const { role } = useRole()
  const [search, setSearch] = useState('')
  const [stato, setStato] = useState('')

  const rows = useMemo(
    () =>
      accessories.filter((a) => {
        if (search && !`${a.nome} ${a.codice}`.toLowerCase().includes(search.toLowerCase())) return false
        if (stato && a.stato !== stato) return false
        return true
      }),
    [search, stato],
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
    { header: 'Fornitore', accessor: (a) => suppliers.find((s) => s.id === a.supplierId)?.nome ?? '—' },
    { header: 'Costo unitario', accessor: (a) => formatCurrency(a.costoUnitario), align: 'right' },
    { header: 'Residui', accessor: (a) => `${a.quantitaAcquistata - a.quantitaUtilizzata} ${a.unitaMisura}`, align: 'right' },
    { header: 'Stato', accessor: (a) => <StatusBadge status={a.stato} /> },
    {
      header: '',
      accessor: (a) =>
        canEdit(role) && (a.stato === 'sotto_soglia' || a.stato === 'esaurito') ? (
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
      <PageHeader title="Inventario accessori" subtitle="Bottoni, zip, etichette, packaging e altri accessori (FR-04). Apri una riga per la scheda completa." />
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
                  {invoice ? <Link to="/fatture" onClick={(e) => e.stopPropagation()} className="hover:underline">{invoice.numero}</Link> : '—'}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-2">
                <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Prodotti collegati</p>
                <p className="mt-0.5 text-heemia-black">{linkedProducts.length > 0 ? linkedProducts.join(', ') : '—'}</p>
              </div>
            </div>
          )
        }}
      />
    </div>
  )
}
