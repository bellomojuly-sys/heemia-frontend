import { useState } from 'react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Modal, Field, FormActions, campoClass, fieldClass } from '../../components/ui/Modal'
import { useFormSubmit, regole } from '../../hooks/useFormSubmit'
import { Pencil } from 'lucide-react'
import { StatusBadge } from '../../lib/statusBadge'
import { formatDateIt } from '../../lib/format'
import type { Accessory, Material, Supplier, SupplierCategoria, SupplierRequest } from '../../types'
import { useDataStore, type NewSupplierInput } from '../../context/DataStore'
import { useRole } from '../../context/RoleContext'
import { useGoatAlert } from '../../context/GoatAlertContext'
import { ApiError } from '../../lib/api'
import { canApproveEmailDrafts, canWrite } from '../../lib/permissions'

const textareaClass =
  'w-full rounded-heemia border border-heemia-border p-3 text-sm text-heemia-black transition-all duration-200 ease-heemia focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10'

const SUPPLIER_CATEGORIES: SupplierCategoria[] = [
  'Tessuti', 'Filati', 'Passamaneria', 'Lycra', 'Felpa', 'Asole/Bottoni', 'Fodere', 'Cartellini/Etichette',
  'Accessori', 'Zip', 'Bottoni', 'Accessori vari', 'Biglietti', 'Spalline', 'Modellistica/Confezione',
  'Modellistica', 'Ricami', 'Smacchinatore', 'Confezione', 'Commercialista', 'Marchi e brevetti', 'Consulenza',
]

function suppliedItems(supplier: Supplier, materials: Material[], accessories: Accessory[]) {
  const mats = materials.filter((m) => m.supplierId === supplier.id).map((m) => m.nome)
  const accs = accessories.filter((a) => a.supplierId === supplier.id).map((a) => a.nome)
  return [...mats, ...accs].join(', ') || '–'
}

/**
 * Scheda fornitore: **lo stesso form serve a creare e a modificare**.
 *
 * Prima esisteva solo la creazione, e una volta salvato un fornitore non si poteva più
 * toccare: una partita IVA arrivata dopo, un referente cambiato, un'email sbagliata si
 * correggevano dal database. Erano proprio i casi più frequenti, perché l'anagrafica del
 * censimento è entrata volutamente incompleta (DEC-061: «i fornitori senza partita IVA
 * entrano lo stesso, il dato si completa dopo») — e quel «dopo» non aveva una schermata.
 *
 * Obbligatori restano **nome e categoria**, e basta: sono quello che rende riconoscibile
 * un fornitore. Tutto il resto si può lasciare vuoto oggi e completare domani, che è la
 * seconda richiesta esplicita. Un campo svuotato viene svuotato davvero sul server (la
 * stringa vuota diventa `null`), altrimenti un dato messo per sbaglio resterebbe lì.
 */
const emptySupplierForm = {
  nome: '',
  categoria: 'Tessuti' as SupplierCategoria,
  partitaIva: '',
  citta: '',
  email: '',
  paese: 'IT',
  referente: '',
  telefono: '',
  condizioniPagamento: '',
  note: '',
  tempiMediConsegnaGiorni: '',
}

function datiDaFornitore(s: Supplier): typeof emptySupplierForm {
  return {
    nome: s.nome,
    categoria: s.categoria,
    partitaIva: s.partitaIva ?? '',
    citta: s.citta ?? '',
    email: s.email ?? '',
    paese: s.paese || 'IT',
    referente: s.referente ?? '',
    telefono: s.telefono ?? '',
    condizioniPagamento: s.condizioniPagamento ?? '',
    note: s.note ?? '',
    tempiMediConsegnaGiorni: s.tempiMediConsegnaGiorni != null ? String(s.tempiMediConsegnaGiorni) : '',
  }
}

function SupplierForm({
  fornitore,
  onClose,
  onSubmit,
}: {
  /** Assente = nuovo fornitore. Presente = modifica di quello esistente. */
  fornitore?: Supplier
  onClose: () => void
  onSubmit: (input: NewSupplierInput) => void | Promise<unknown>
}) {
  const [form, setForm] = useState(() => (fornitore ? datiDaFornitore(fornitore) : emptySupplierForm))
  const modifica = Boolean(fornitore)

  const { errori, inCorso, submit, pulisci } = useFormSubmit<'nome' | 'email' | 'tempi'>(
    () => ({
      // Solo il nome è obbligatorio (la categoria ha sempre un valore scelto).
      nome: regole.obbligatorio(form.nome, 'Il nome del fornitore'),
      // L'email resta facoltativa, ma se c'è deve essere valida: accettarne una storta
      // significherebbe scoprirlo il giorno in cui una richiesta di riordino non parte.
      email: regole.email(form.email),
      tempi: regole.numeroPositivo(form.tempiMediConsegnaGiorni, 'I tempi di consegna'),
    }),
    async () => {
      await onSubmit({
        nome: form.nome.trim(),
        categoria: form.categoria,
        partitaIva: form.partitaIva.trim(),
        citta: form.citta.trim(),
        email: form.email.trim(),
        paese: form.paese.trim() || 'IT',
        referente: form.referente.trim(),
        telefono: form.telefono.trim(),
        condizioniPagamento: form.condizioniPagamento.trim(),
        note: form.note.trim(),
        // Campo vuoto = «non lo so»: si scrive null, non zero. Zero giorni di consegna
        // sarebbe un'informazione, e sbagliata.
        tempiMediConsegnaGiorni: form.tempiMediConsegnaGiorni ? Number(form.tempiMediConsegnaGiorni) : undefined,
      })
      onClose()
    },
  )

  const campo = (chiave: keyof typeof emptySupplierForm) => ({
    value: form[chiave] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [chiave]: e.target.value }),
  })

  return (
    <Modal
      title={modifica ? `Modifica ${fornitore!.nome}` : 'Aggiungi fornitore'}
      subtitle="Servono nome e categoria. Tutto il resto si può completare quando il dato arriva."
      onClose={onClose}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome" required error={errori.nome}>
          <input
            className={campoClass(errori.nome)}
            value={form.nome}
            onChange={(e) => { setForm({ ...form, nome: e.target.value }); pulisci('nome') }}
          />
        </Field>
        <Field label="Categoria">
          <select className={fieldClass} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as SupplierCategoria })}>
            {SUPPLIER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Partita IVA" hint="È la chiave con cui l'import delle fatture elettroniche riconosce il fornitore.">
          <input className={fieldClass} {...campo('partitaIva')} />
        </Field>
        <Field label="Referente">
          <input className={fieldClass} {...campo('referente')} />
        </Field>
        <Field label="Email" error={errori.email} hint="Serve per inviare le richieste di riordino.">
          <input
            type="email"
            className={campoClass(errori.email)}
            value={form.email}
            onChange={(e) => { setForm({ ...form, email: e.target.value }); pulisci('email') }}
          />
        </Field>
        <Field label="Telefono">
          <input className={fieldClass} {...campo('telefono')} />
        </Field>
        <Field label="Città">
          <input className={fieldClass} {...campo('citta')} />
        </Field>
        <Field label="Paese">
          <input className={fieldClass} {...campo('paese')} />
        </Field>
        <Field label="Tempi consegna (gg)" error={errori.tempi}>
          <input
            type="number"
            min="0"
            className={campoClass(errori.tempi)}
            value={form.tempiMediConsegnaGiorni}
            onChange={(e) => { setForm({ ...form, tempiMediConsegnaGiorni: e.target.value }); pulisci('tempi') }}
          />
        </Field>
        <Field label="Condizioni di pagamento" hint="Es. «30 giorni data fattura».">
          <input className={fieldClass} {...campo('condizioniPagamento')} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Note">
            <input className={fieldClass} {...campo('note')} />
          </Field>
        </div>
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Annulla</Button>
        <Button onClick={() => void submit()} disabled={inCorso}>
          {inCorso ? 'Salvataggio…' : modifica ? 'Salva modifiche' : 'Salva fornitore'}
        </Button>
      </FormActions>
    </Modal>
  )
}

export function SupplierList() {
  const { role } = useRole()
  const { suppliers, materials, accessories, addSupplier, updateSupplier, supplierRequests, setSupplierRequestStatus, updateSupplierRequestDraft, sendSupplierRequest, caricamento } = useDataStore()
  const { avvisa } = useGoatAlert()
  const [openId, setOpenId] = useState<string | null>(supplierRequests[0]?.id ?? null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  // Il fornitore aperto in modifica. Un solo stato per «quale scheda sto correggendo»:
  // il form è lo stesso della creazione, cambia solo cosa gli si passa.
  const [daModificare, setDaModificare] = useState<Supplier | null>(null)

  const canApprove = canApproveEmailDrafts(role)
  const canModify = canWrite(role, 'fornitori')

  const supplierColumns: DataTableColumn<Supplier>[] = [
    {
      header: 'Fornitore',
      accessor: (s) => (
        <div>
          <p className="font-display font-medium text-heemia-black">{s.nome}</p>
          {s.partitaIva && <p className="font-mono-heemia text-[11px] text-heemia-grey">P.IVA {s.partitaIva}</p>}
        </div>
      ),
    },
    { header: 'Categoria', accessor: (s) => s.categoria },
    { header: 'Città', accessor: (s) => s.citta || '–' },
    { header: 'Contatto', accessor: (s) => <span className="font-mono-heemia text-xs">{s.email ?? '–'}</span> },
    { header: 'Fornisce', accessor: (s) => suppliedItems(s, materials, accessories) },
    { header: 'Tempi consegna', accessor: (s) => (s.tempiMediConsegnaGiorni ? `${s.tempiMediConsegnaGiorni}gg` : '–'), align: 'right' },
    {
      // Cosa manca alla scheda, calcolato dal server. Il conteggio da solo direbbe poco:
      // il titolo elenca i campi, così si sa se vale la pena aprirla adesso.
      header: 'Completezza',
      accessor: (s) => {
        const mancanti = s.campiMancanti ?? []
        if (mancanti.length === 0) return <Badge variant="success">Completa</Badge>
        return (
          <span title={mancanti.map((m) => `${m.etichetta}: ${m.perche}`).join('\n')}>
            <Badge variant="warning-outline">
              {mancanti.length === 1 ? 'Manca 1 campo' : `Mancano ${mancanti.length} campi`}
            </Badge>
          </span>
        )
      },
    },
    ...(canModify
      ? [
          {
            header: '',
            accessor: (s: Supplier) => (
              <Button variant="ghost" onClick={() => setDaModificare(s)}>
                <Pencil aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                Modifica
              </Button>
            ),
          },
        ]
      : []),
  ]

  const startEdit = (r: SupplierRequest) => {
    setEditingId(r.id)
    setDraftText(r.testo)
  }

  // Si chiude solo se il server ha davvero accettato la modifica: chiudere comunque
  // faceva sembrare salvato un testo che non lo era.
  const saveEdit = async (id: string) => {
    try {
      await updateSupplierRequestDraft(id, { testo: draftText })
      setEditingId(null)
    } catch (e) {
      avvisa('salvataggio', {
        testo: e instanceof ApiError ? e.message : 'Non è stato possibile salvare la bozza.',
      })
    }
  }

  const startResponse = (id: string) => {
    setRespondingId(id)
    setResponseText('')
  }

  // Approvare e inviare sono due passi distinti (FR-06). Prima erano un pulsante solo che
  // portava la richiesta direttamente a "inviata": una transizione che il server rifiuta
  // (dalla bozza si passa da "approvata") e che, se fosse passata, avrebbe dichiarato
  // spedita un'email mai partita. L'invio vero lo fa il server, quando l'integrazione
  // Gmail sarà attiva; fino ad allora il messaggio d'errore dice esattamente cosa manca.
  const approva = async (id: string) => {
    try {
      await setSupplierRequestStatus(id, 'approvata')
    } catch (e) {
      avvisa('salvataggio', { testo: e instanceof ApiError ? e.message : 'Non è stato possibile approvare la richiesta.' })
    }
  }

  const invia = async (id: string) => {
    try {
      await sendSupplierRequest(id)
    } catch (e) {
      avvisa('salvataggio', { testo: e instanceof ApiError ? e.message : "Non è stato possibile inviare la richiesta." })
    }
  }

  const saveResponse = (id: string) => {
    setSupplierRequestStatus(id, 'risposta_ricevuta', { rispostaFornitore: responseText })
    setRespondingId(null)
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-heemia-grey">Anagrafica fornitori e bozze email per materiali e accessori.</p>
        {canModify && <Button onClick={() => setAddOpen(true)}>Aggiungi fornitore</Button>}
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Anagrafica fornitori"
          subtitle={(() => {
            const incompleti = suppliers.filter((s) => (s.campiMancanti ?? []).length > 0).length
            return incompleti === 0
              ? `${suppliers.length} fornitori, tutte le schede complete`
              : `${suppliers.length} fornitori · ${incompleti} ${incompleti === 1 ? 'scheda da completare' : 'schede da completare'}`
          })()}
        />
        <div className="p-5">
          <DataTable
            loading={caricamento}
            columns={supplierColumns}
            rows={suppliers}
            keyExtractor={(s) => s.id}
            onRowClick={canModify ? (s) => setDaModificare(s) : undefined}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Bozze email fornitori"
          subtitle="Nessun invio senza approvazione esplicita. Apri, modifica, approva e invia, o annulla."
        />
        <ul className="divide-y divide-heemia-border">
          {supplierRequests.map((r) => {
            const supplier = suppliers.find((s) => s.id === r.supplierId)
            const isOpen = openId === r.id
            const isEditing = editingId === r.id
            const isResponding = respondingId === r.id
            return (
              <li key={r.id} className="p-5">
                <button type="button" onClick={() => setOpenId(isOpen ? null : r.id)} className="flex w-full items-start justify-between gap-4 text-left">
                  <div>
                    <p className="font-display text-base text-heemia-black">{r.oggetto}</p>
                    <p className="mt-0.5 text-xs text-heemia-grey">{supplier?.nome} · richiesto {formatDateIt(r.creataIl)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.urgenza === 'alta' && <Badge variant="critical">Urgente</Badge>}
                    <StatusBadge status={r.stato} />
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-4 space-y-4 border-t border-heemia-border pt-4">
                    {isEditing ? (
                      <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={4} className={textareaClass} />
                    ) : (
                      <p className="text-sm text-heemia-black">{r.testo}</p>
                    )}

                    <dl className="grid grid-cols-3 gap-3">
                      <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Richiesta</dt><dd className="font-mono-heemia mt-0.5 text-sm text-heemia-black">{r.quantitaRichiesta}</dd></div>
                      <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Disponibile</dt><dd className="font-mono-heemia mt-0.5 text-sm text-heemia-black">{r.quantitaDisponibile}</dd></div>
                      <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Mancante</dt><dd className="font-mono-heemia mt-0.5 text-sm text-heemia-black">{r.quantitaMancante}</dd></div>
                    </dl>

                    {r.rispostaFornitore && (
                      <div className="rounded-heemia border-l-2 border-heemia-border-strong bg-heemia-surface p-3 text-xs text-heemia-black">
                        <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Risposta fornitore</p>
                        {r.rispostaFornitore}
                      </div>
                    )}

                    {isResponding && (
                      <div className="space-y-2">
                        <textarea
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          rows={2}
                          placeholder="Disponibilità, tempi di consegna, costo aggiornato…"
                          className={textareaClass}
                        />
                        <Button onClick={() => saveResponse(r.id)}>Salva risposta</Button>
                      </div>
                    )}

                    {!canModify && !canApprove ? (
                      <p className="text-xs text-heemia-grey">Sola lettura per questo ruolo.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {isEditing ? (
                          <>
                            <Button onClick={() => saveEdit(r.id)}>Salva modifica</Button>
                            <Button variant="ghost" onClick={() => setEditingId(null)}>Annulla modifica</Button>
                          </>
                        ) : (
                          <>
                            {canModify && !['inviata', 'risposta_ricevuta', 'chiusa', 'annullata'].includes(r.stato) && (
                              <Button variant="secondary" onClick={() => startEdit(r)}>Modifica</Button>
                            )}
                            {canApprove && ['bozza_generata', 'in_attesa_approvazione', 'modificata'].includes(r.stato) && (
                              <Button onClick={() => approva(r.id)}>Approva</Button>
                            )}
                            {canApprove && r.stato === 'approvata' && (
                              <Button onClick={() => invia(r.id)}>Invia al fornitore</Button>
                            )}
                            {canModify && r.stato === 'bozza_generata' && (
                              <Button variant="secondary" onClick={() => setSupplierRequestStatus(r.id, 'in_attesa_approvazione')}>Salva per dopo</Button>
                            )}
                            {canModify && !['inviata', 'risposta_ricevuta', 'chiusa', 'annullata'].includes(r.stato) && (
                              <Button variant="ghost" onClick={() => setSupplierRequestStatus(r.id, 'annullata')}>Annulla</Button>
                            )}
                            {canModify && r.stato === 'inviata' && !isResponding && (
                              <Button variant="secondary" onClick={() => startResponse(r.id)}>Collega risposta</Button>
                            )}
                            {canModify && r.stato === 'risposta_ricevuta' && (
                              <Button variant="secondary" onClick={() => setSupplierRequestStatus(r.id, 'chiusa')}>Chiudi richiesta</Button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      {addOpen && <SupplierForm onClose={() => setAddOpen(false)} onSubmit={addSupplier} />}

      {daModificare && (
        <SupplierForm
          fornitore={daModificare}
          onClose={() => setDaModificare(null)}
          onSubmit={async (input) => {
            try {
              await updateSupplier(daModificare.id, input)
            } catch (e) {
              // Il salvataggio non riuscito non deve chiudere il form: chi ha appena
              // scritto dieci campi non deve riscriverli per leggere l'errore.
              avvisa('salvataggio', {
                testo: e instanceof ApiError ? e.message : 'Non è stato possibile salvare il fornitore.',
              })
              throw e
            }
          }}
        />
      )}
    </div>
  )
}
