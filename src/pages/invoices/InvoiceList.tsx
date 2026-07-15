import { useMemo, useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { invoices, costAllocations, suppliers, customers } from '../../mock'
import type { Invoice } from '../../types'

const CATEGORIA_LABEL: Record<string, string> = {
  tessuto: 'Tessuto', accessori: 'Accessori', manodopera: 'Manodopera', packaging: 'Packaging',
  spedizione: 'Spedizione', marketing: 'Marketing', logistica: 'Logistica', servizi: 'Servizi', costi_generali: 'Costi generali',
}

const ALLOCATION_LABEL: Record<string, string> = {
  diretto_prodotto: 'Diretto prodotto', per_categoria: 'Per categoria', per_collezione: 'Per collezione',
  per_numero_capi: 'Per numero capi', per_fatturato: 'Per fatturato', per_mese: 'Per mese', non_allocabile: 'Non allocabile',
}

export function InvoiceList() {
  const [search, setSearch] = useState('')
  const [stato, setStato] = useState('')
  const [categoria, setCategoria] = useState('')
  const [paese, setPaese] = useState('')

  const rows = useMemo(
    () =>
      invoices.filter((i) => {
        if (search && !i.numero.toLowerCase().includes(search.toLowerCase())) return false
        if (stato && i.statoPagamento !== stato) return false
        if (categoria && i.categoriaCosto !== categoria) return false
        if (paese && i.paese !== paese) return false
        return true
      }),
    [search, stato, categoria, paese],
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
            '—'}
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
      return ca ? ALLOCATION_LABEL[ca.modalita] : <span className="text-heemia-grey">—</span>
    } },
    { header: 'Pagamento', accessor: (i) => <StatusBadge status={i.statoPagamento} /> },
    { header: 'Scadenza', accessor: (i) => formatDateIt(i.dataScadenza) },
    { header: 'Associata', accessor: (i) => (i.associata ? <span className="text-heemia-grey">Sì</span> : <Badge variant="warning">No — da categorizzare</Badge>) },
  ]

  return (
    <div>
      <PageHeader title="Fatture" subtitle="Fatture fornitori, clienti, materiali e costi aziendali centralizzati (FR-19)." />
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
    </div>
  )
}
