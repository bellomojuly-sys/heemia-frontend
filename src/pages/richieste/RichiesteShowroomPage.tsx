import { useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal, Field, FormActions, fieldClass } from '../../components/ui/Modal'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt, formatDateTimeIt } from '../../lib/format'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'
import type { PatchRichiesta } from '../../hooks/useServerShowroomRequests'
import type { ShowroomRequest, StatoRichiestaShowroom } from '../../types'
import { useSalesChannelsOutlet } from '../orders/salesChannelsOutlet'

// Spec 2026-08-06 §7 — le richieste aperte dal cliente nella vista showroom, lavorate qui
// dall'atelier. Alla conferma il server crea l'ordine SM-* collegato (DEC-044): è il punto
// in cui la trattativa diventa un ordine, e da lì in poi vale la pipeline degli ordini.

const STATI: { id: StatoRichiestaShowroom; label: string }[] = [
  { id: 'nuova_richiesta', label: 'Nuova richiesta' },
  { id: 'da_contattare', label: 'Da contattare' },
  { id: 'appuntamento_fissato', label: 'Appuntamento fissato' },
  { id: 'misure_raccolte', label: 'Misure raccolte' },
  { id: 'preventivo_inviato', label: 'Preventivo inviato' },
  { id: 'confermato', label: 'Confermato' },
  { id: 'in_produzione', label: 'In produzione' },
  { id: 'pronto', label: 'Pronto' },
  { id: 'consegnato', label: 'Consegnato' },
  { id: 'annullato', label: 'Annullato' },
]

/**
 * Nominativo del contatto. In `customers.nome` sta già il nominativo completo (è così per
 * tutti i canali: Shopify, fatture, showroom); `cognome` è un campo separato che esiste solo
 * per i contatti showroom. Concatenarli alla cieca darebbe "Chiara Rossi Rossi", quindi il
 * cognome si aggiunge solo se non è già dentro al nome.
 */
function nominativo(cliente: ShowroomRequest['cliente']): string {
  const nome = cliente.nome.trim()
  const cognome = (cliente.cognome ?? '').trim()
  if (!cognome || nome.toLowerCase().includes(cognome.toLowerCase())) return nome
  return `${nome} ${cognome}`
}

/** `datetime-local` vuole "YYYY-MM-DDTHH:mm" in ora locale; il server manda ISO in UTC. */
function toLocalInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function DettaglioRichiesta({
  richiesta,
  modificabile,
  onClose,
  onSalva,
}: {
  richiesta: ShowroomRequest
  modificabile: boolean
  onClose: () => void
  onSalva: (patch: PatchRichiesta) => Promise<ShowroomRequest>
}) {
  const [stato, setStato] = useState<StatoRichiestaShowroom>(richiesta.stato)
  const [noteInterne, setNoteInterne] = useState(richiesta.noteInterne ?? '')
  const [preventivo, setPreventivo] = useState(richiesta.preventivoImporto ? String(richiesta.preventivoImporto) : '')
  const [appuntamento, setAppuntamento] = useState(toLocalInput(richiesta.appuntamentoIl))
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const creaOrdine = stato === 'confermato' && !richiesta.ordine && richiesta.tipo === 'personalizzazione'

  const salva = async () => {
    if (inCorso) return
    setInCorso(true)
    setErrore(null)
    const patch: PatchRichiesta = { stato, noteInterne }
    if (preventivo.trim()) {
      const importo = Number(preventivo)
      if (!Number.isFinite(importo) || importo < 0) {
        setErrore('Il preventivo deve essere un importo valido.')
        setInCorso(false)
        return
      }
      patch.preventivoImporto = importo
      // La data di invio si registra da sé quando il preventivo viene messo per la prima volta.
      if (!richiesta.preventivoInviatoIl) patch.preventivoInviatoIl = new Date().toISOString()
    }
    if (appuntamento) patch.appuntamentoIl = new Date(appuntamento).toISOString()
    try {
      await onSalva(patch)
      onClose()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Salvataggio non riuscito.')
    } finally {
      setInCorso(false)
    }
  }

  const misure = Object.entries(richiesta.misure ?? {})

  return (
    <Modal
      title={`Richiesta ${richiesta.numero}`}
      subtitle={`${richiesta.tipo === 'personalizzazione' ? 'Personalizzazione su misura' : 'Richiesta di informazioni'} · ${formatDateTimeIt(richiesta.createdAt)}`}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Cliente</p>
            <p className="text-sm text-heemia-black">{nominativo(richiesta.cliente)}</p>
            <p className="text-xs text-heemia-grey">{richiesta.cliente.email ?? '–'}</p>
            {richiesta.cliente.consensoMarketing && (
              <p className="mt-1"><Badge variant="info">Consenso marketing</Badge></p>
            )}
          </div>
          <div>
            <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Capo</p>
            <p className="text-sm text-heemia-black">{richiesta.prodotto?.nome ?? '–'}</p>
            <p className="text-xs text-heemia-grey">{richiesta.prodotto?.codiceProdotto ?? ''}</p>
          </div>
        </div>

        <div className="rounded-heemia-lg border border-heemia-border bg-heemia-surface p-4">
          <p className="font-mono-heemia mb-2 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
            Quello che ha chiesto il cliente
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            <div><span className="block text-heemia-grey">Taglia base</span><span className="text-heemia-black">{richiesta.tagliaBase ?? '–'}</span></div>
            <div><span className="block text-heemia-grey">Colore</span><span className="text-heemia-black">{richiesta.coloreDesiderato ?? '–'}</span></div>
            <div><span className="block text-heemia-grey">Lunghezza</span><span className="text-heemia-black">{richiesta.lunghezza ?? '–'}</span></div>
            <div><span className="block text-heemia-grey">Data desiderata</span><span className="text-heemia-black">{richiesta.dataDesiderata ? formatDateIt(richiesta.dataDesiderata) : '–'}</span></div>
          </div>
          {richiesta.modifiche && (
            <p className="mt-3 text-xs text-heemia-black"><span className="text-heemia-grey">Modifiche: </span>{richiesta.modifiche}</p>
          )}
          {richiesta.note && (
            <p className="mt-1 text-xs text-heemia-black"><span className="text-heemia-grey">Note: </span>{richiesta.note}</p>
          )}
          {misure.length > 0 && (
            <p className="mt-3 text-xs text-heemia-black">
              <span className="text-heemia-grey">Misure: </span>
              {misure.map(([k, v]) => `${k} ${v} cm`).join(' · ')}
            </p>
          )}
          {richiesta.immagini.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {richiesta.immagini.map((img) => (
                <img key={img.id} src={img.dataUrl} alt={img.nome} className="h-20 w-20 rounded-heemia-sm border border-heemia-border object-cover" />
              ))}
            </div>
          )}
        </div>

        {richiesta.ordine ? (
          <p className="rounded-heemia border-l-2 border-heemia-border-strong bg-white px-3 py-2 text-xs text-heemia-black">
            Ordine collegato <span className="font-mono-heemia">{richiesta.ordine.numero}</span> ({richiesta.ordine.stato}).
          </p>
        ) : creaOrdine ? (
          <p className="rounded-heemia border-l-2 border-heemia-carmine bg-heemia-carmine-light px-3 py-2 text-xs text-heemia-black">
            Salvando con stato “Confermato” viene creato l'ordine su misura SM-* collegato, con l'importo del preventivo.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Stato">
            <select className={fieldClass} value={stato} disabled={!modificabile} onChange={(e) => setStato(e.target.value as StatoRichiestaShowroom)}>
              {STATI.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Preventivo (€)" hint={richiesta.preventivoInviatoIl ? `Inviato il ${formatDateTimeIt(richiesta.preventivoInviatoIl)}` : 'La data d’invio si registra al primo salvataggio.'}>
            <input
              type="number"
              min="0"
              step="0.01"
              className={fieldClass}
              value={preventivo}
              disabled={!modificabile}
              onChange={(e) => setPreventivo(e.target.value)}
            />
          </Field>
          <Field label="Appuntamento in showroom">
            <input
              type="datetime-local"
              className={fieldClass}
              value={appuntamento}
              disabled={!modificabile}
              onChange={(e) => setAppuntamento(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Note interne" hint="Non visibili al cliente.">
              <textarea
                rows={3}
                className={fieldClass}
                value={noteInterne}
                disabled={!modificabile}
                onChange={(e) => setNoteInterne(e.target.value)}
              />
            </Field>
          </div>
        </div>

        {errore && (
          <p role="alert" className="animate-rise rounded-heemia border-l-2 border-heemia-carmine bg-heemia-carmine-light px-3 py-2 text-xs text-heemia-black">
            {errore}
          </p>
        )}
      </div>

      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Chiudi</Button>
        {modificabile && (
          <Button onClick={() => void salva()} disabled={inCorso}>
            {inCorso ? 'Salvataggio…' : creaOrdine ? 'Conferma e crea ordine' : 'Salva'}
          </Button>
        )}
      </FormActions>
    </Modal>
  )
}

export function RichiesteShowroomPage() {
  const { role } = useRole()
  const { showroom: { richieste, caricamento, errore, aggiorna } } = useSalesChannelsOutlet()
  const [search, setSearch] = useState('')
  const [stato, setStato] = useState('')
  const [tipo, setTipo] = useState('')
  const [apertaId, setApertaId] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      richieste.filter((r) => {
        if (stato && r.stato !== stato) return false
        if (tipo && r.tipo !== tipo) return false
        if (search) {
          const q = search.toLowerCase()
          const testo = [r.numero, nominativo(r.cliente), r.cliente.email, r.prodotto?.nome]
            .filter(Boolean).join(' ').toLowerCase()
          if (!testo.includes(q)) return false
        }
        return true
      }),
    [richieste, search, stato, tipo],
  )

  const aperta = richieste.find((r) => r.id === apertaId) ?? null

  const columns: DataTableColumn<ShowroomRequest>[] = [
    { header: 'Numero', accessor: (r) => <span className="font-mono-heemia text-[12px] text-heemia-black">{r.numero}</span> },
    { header: 'Ricevuta', accessor: (r) => formatDateIt(r.createdAt.slice(0, 10)) },
    {
      header: 'Cliente',
      accessor: (r) => <span className="font-display">{nominativo(r.cliente)}</span>,
    },
    { header: 'Capo', accessor: (r) => r.prodotto?.nome ?? '–' },
    {
      header: 'Tipo',
      accessor: (r) => (
        <Badge variant={r.tipo === 'personalizzazione' ? 'neutral' : 'info'}>
          {r.tipo === 'personalizzazione' ? 'Su misura' : 'Informazioni'}
        </Badge>
      ),
    },
    {
      header: 'Preventivo',
      accessor: (r) => (r.preventivoImporto ? formatCurrency(r.preventivoImporto) : '–'),
      align: 'right',
    },
    { header: 'Appuntamento', accessor: (r) => (r.appuntamentoIl ? formatDateTimeIt(r.appuntamentoIl) : '–') },
    { header: 'Ordine', accessor: (r) => (r.ordine ? <span className="font-mono-heemia text-[12px]">{r.ordine.numero}</span> : '–') },
    { header: 'Stato', accessor: (r) => <StatusBadge status={r.stato} /> },
  ]

  return (
    <div>
      <p className="mb-5 text-sm text-heemia-grey">
        Personalizzazioni e richieste arrivate dalla vista cliente. Confermando una richiesta si crea l'ordine su misura collegato.
      </p>
      {errore && (
        <p role="alert" className="mb-4 rounded-heemia border-l-2 border-heemia-carmine bg-heemia-carmine-light px-3 py-2 text-sm text-heemia-black">
          {errore}
        </p>
      )}
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca per numero, cliente o capo…"
        filters={[
          { label: 'Stato', value: stato, onChange: setStato, options: STATI.map((s) => ({ value: s.id, label: s.label })) },
          { label: 'Tipo', value: tipo, onChange: setTipo, options: [
            { value: 'personalizzazione', label: 'Su misura' },
            { value: 'informazioni', label: 'Informazioni' },
          ] },
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        keyExtractor={(r) => r.id}
        onRowClick={(r) => setApertaId(r.id)}
        loading={caricamento}
        emptyTitle="Nessuna richiesta"
        emptyDescription="Le richieste inviate dai clienti nella vista showroom compaiono qui."
      />
      {aperta && (
        <DettaglioRichiesta
          richiesta={aperta}
          modificabile={canEdit(role)}
          onClose={() => setApertaId(null)}
          onSalva={(patch) => aggiorna(aperta.id, patch)}
        />
      )}
    </div>
  )
}
