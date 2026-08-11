import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/States'
import { StatusBadge } from '../../lib/statusBadge'
import { formatDateIt } from '../../lib/format'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'
import { useDataStore } from '../../context/DataStore'
import { NuovaBollaForm } from '../../components/lavorazioni/NuovaBollaForm'
import { useServerLavorazioni, type FiltriBolle } from '../../hooks/useServerLavorazioni'
import type { BollaLavorazione, StatoBolla } from '../../types'

// Elenco delle bolle di lavorazione esterna (2026-08-10).
//
// La colonna che conta davvero è "ancora fuori": dice, senza aprire niente, quali
// lavorazioni hanno materiale nostro in giro. Una bolla emessa che non torna è il problema
// che questa sezione esiste per rendere visibile.

const STATI: { id: StatoBolla; label: string }[] = [
  { id: 'bozza', label: 'Bozza' },
  { id: 'emessa', label: 'Emessa' },
  { id: 'parzialmente_rientrata', label: 'Parzialmente rientrata' },
  { id: 'chiusa', label: 'Chiusa' },
  { id: 'annullata', label: 'Annullata' },
]

export function LavorazioniPage() {
  const navigate = useNavigate()
  const { role } = useRole()
  const { suppliers } = useDataStore()
  const modificabile = canEdit(role)

  const [stato, setStato] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [dataDa, setDataDa] = useState('')
  const [ricerca, setRicerca] = useState('')
  const [nuovaAperta, setNuovaAperta] = useState(false)

  // Stato, lavorante e data filtrano sul server (sono indicizzati); la ricerca libera
  // resta locale perché tocca anche il capo e la commessa, che il filtro server non copre.
  const filtri: FiltriBolle = useMemo(
    () => ({
      stato: (stato || undefined) as StatoBolla | undefined,
      supplierId: supplierId || undefined,
      dataDa: dataDa || undefined,
    }),
    [stato, supplierId, dataDa],
  )

  const { bolle, caricamento, errore, crea } = useServerLavorazioni(filtri)

  const visibili = useMemo(() => {
    const q = ricerca.trim().toLowerCase()
    if (!q) return bolle
    return bolle.filter((b) =>
      [b.numero, b.etichetta, b.lavoranteNome ?? b.lavorante.nome, b.prodotto?.nome, b.commessa]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [bolle, ricerca])

  const aperte = bolle.filter((b) => b.stato === 'emessa' || b.stato === 'parzialmente_rientrata')
  const conMaterialeFuori = aperte.filter((b) => b.materialeAncoraFuori > 0)

  const colonne: DataTableColumn<BollaLavorazione>[] = [
    {
      header: 'Documento',
      accessor: (b) => (
        <div>
          <p className="font-mono-heemia text-heemia-black">{b.etichetta}</p>
          <p className="text-[11px] text-heemia-grey">{formatDateIt(b.data)}</p>
        </div>
      ),
    },
    { header: 'Lavorante', accessor: (b) => b.lavoranteNome ?? b.lavorante.nome },
    {
      header: 'Capo / commessa',
      accessor: (b) => (
        <div>
          <p>{b.prodotto?.nome ?? '—'}</p>
          {b.commessa && <p className="text-[11px] text-heemia-grey">{b.commessa}</p>}
        </div>
      ),
    },
    { header: 'Righe', accessor: (b) => b.righe.length, align: 'right' },
    {
      header: 'Ancora fuori',
      align: 'right',
      accessor: (b) =>
        b.stato === 'bozza' || b.stato === 'annullata' ? (
          <span className="text-heemia-grey-light">—</span>
        ) : b.materialeAncoraFuori > 0 ? (
          <span className="text-heemia-carmine">{b.materialeAncoraFuori}</span>
        ) : (
          <span className="text-heemia-grey">0</span>
        ),
    },
    {
      header: 'Capi',
      align: 'right',
      accessor: (b) => (b.quantitaAttesa > 0 ? `${b.capiRientrati}/${b.quantitaAttesa}` : b.capiRientrati || '—'),
    },
    {
      header: 'Stato',
      accessor: (b) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={b.stato} />
          {b.chiusaConDifferenza && <Badge variant="warning-outline">Differenza</Badge>}
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-sm text-heemia-grey">
          Controlla cosa è stato consegnato, cosa è tornato e cosa è ancora fuori. Il materiale affidato resta nel patrimonio.
        </p>
        {modificabile && <Button onClick={() => setNuovaAperta(true)}>Nuova bolla</Button>}
      </div>

      {errore && (
        <div className="mb-4 rounded-heemia border border-heemia-carmine/30 bg-heemia-carmine-light px-4 py-3 text-xs text-heemia-carmine">
          {errore}
        </div>
      )}

      {conMaterialeFuori.length > 0 && (
        <Card className="mb-5 px-5 py-4">
          <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
            Lavorazioni aperte
          </p>
          <p className="mt-1 text-sm text-heemia-black">
            {conMaterialeFuori.length === 1
              ? '1 lavorazione ha ancora materiale presso il lavorante.'
              : `${conMaterialeFuori.length} lavorazioni hanno ancora materiale presso il lavorante.`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {conMaterialeFuori.slice(0, 8).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => navigate(`/lavorazioni/${b.id}`)}
                className="font-mono-heemia rounded-full border border-heemia-border-strong px-2.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-heemia-black transition-colors hover:border-heemia-black"
              >
                {b.etichetta}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Toolbar
        search={ricerca}
        onSearchChange={setRicerca}
        searchPlaceholder="Cerca per numero, lavorante, capo…"
        filters={[
          { label: 'Stato', value: stato, onChange: setStato, options: STATI.map((s) => ({ value: s.id, label: s.label })) },
          {
            label: 'Lavorante',
            value: supplierId,
            onChange: setSupplierId,
            options: suppliers.map((s) => ({ value: s.id, label: s.nome })),
          },
        ]}
        right={
          <label className="flex items-center gap-2 text-[11px] text-heemia-grey">
            Dal
            <input
              type="date"
              value={dataDa}
              onChange={(e) => setDataDa(e.target.value)}
              className="rounded-heemia-sm border border-heemia-border bg-white px-2 py-1 text-sm text-heemia-black transition-all duration-200 ease-heemia hover:border-heemia-border-strong focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10"
            />
          </label>
        }
      />

      {!caricamento && bolle.length === 0 ? (
        <EmptyState
          title="Nessuna bolla di lavorazione"
          description="Quando consegni tessuti, accessori o semilavorati a un terzista, crea qui la bolla di uscita: i materiali usciranno dalla disponibilità di magazzino restando di proprietà dell'azienda."
          action={modificabile ? <Button onClick={() => setNuovaAperta(true)}>Crea la prima bolla</Button> : undefined}
        />
      ) : (
        <DataTable
          columns={colonne}
          rows={visibili}
          keyExtractor={(b) => b.id}
          onRowClick={(b) => navigate(`/lavorazioni/${b.id}`)}
          loading={caricamento}
          emptyTitle="Nessuna bolla con questi filtri"
          emptyDescription="Cambia stato, lavorante o intervallo di date."
        />
      )}

      {nuovaAperta && (
        <NuovaBollaForm
          onClose={() => setNuovaAperta(false)}
          onSubmit={async (input) => {
            const creata = await crea(input)
            navigate(`/lavorazioni/${creata.id}`)
          }}
        />
      )}
    </>
  )
}
