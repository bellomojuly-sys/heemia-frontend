import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { Toolbar } from '../../components/ui/Toolbar'
import { Button } from '../../components/ui/Button'
import { Modal, Field, FormActions, campoClass, fieldClass } from '../../components/ui/Modal'
import { useFormSubmit, regole } from '../../hooks/useFormSubmit'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency } from '../../lib/format'
import type { Accessory } from '../../types'
import { useRole } from '../../context/RoleContext'
import { useGoatAlert } from '../../context/GoatAlertContext'
import { ApiError } from '../../lib/api'
import { canWrite } from '../../lib/permissions'
import { Pencil } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { useDataStore, type NewAccessoryInput } from '../../context/DataStore'

/**
 * Scheda accessorio: **lo stesso form crea e modifica**, come per i tessuti.
 *
 * Il fornitore era obbligatorio in creazione, ma 19 dei 20 accessori a magazzino sono
 * entrati dal listino del censimento senza: il documento dice il costo, non da chi si
 * compra (Data_Census §10). Erano quindi in uno stato che questo form non avrebbe
 * permesso di creare e non offriva modo di correggere — e senza fornitore il pulsante
 * «Genera richiesta» si rifiuta di partire.
 */
const emptyForm = {
  nome: '',
  codice: '',
  categoria: '',
  supplierId: '',
  costoUnitario: '',
  quantitaAcquistata: '',
  sogliaMinima: '',
}

function datiDaAccessorio(a: Accessory): typeof emptyForm {
  return {
    nome: a.nome,
    codice: a.codice,
    categoria: a.categoria || '',
    supplierId: a.supplierId || '',
    costoUnitario: String(a.costoUnitario ?? ''),
    quantitaAcquistata: String(a.quantitaAcquistata ?? ''),
    sogliaMinima: String(a.sogliaMinima ?? ''),
  }
}

function AccessoryForm({
  accessorio,
  onClose,
  onSubmit,
}: {
  /** Assente = nuovo accessorio. Presente = modifica di quello esistente. */
  accessorio?: Accessory
  onClose: () => void
  onSubmit: (input: NewAccessoryInput) => void | Promise<unknown>
}) {
  const { suppliers } = useDataStore()
  const [form, setForm] = useState(() => (accessorio ? datiDaAccessorio(accessorio) : emptyForm))
  const modifica = Boolean(accessorio)

  const { errori, inCorso, submit, pulisci } = useFormSubmit<
    'nome' | 'codice' | 'costoUnitario' | 'quantitaAcquistata' | 'sogliaMinima'
  >(
    () => ({
      nome: regole.obbligatorio(form.nome, "Il nome dell'accessorio"),
      codice: regole.obbligatorio(form.codice, 'Il codice'),
      costoUnitario: regole.numeroPositivo(form.costoUnitario, 'Il costo unitario'),
      quantitaAcquistata: regole.numeroPositivo(form.quantitaAcquistata, 'La quantità acquistata'),
      sogliaMinima: regole.numeroPositivo(form.sogliaMinima, 'La soglia minima'),
    }),
    async () => {
      await onSubmit({
        nome: form.nome.trim(),
        codice: form.codice.trim(),
        categoria: form.categoria.trim(),
        supplierId: form.supplierId,
        costoUnitario: Number(form.costoUnitario || 0),
        quantitaAcquistata: Number(form.quantitaAcquistata || 0),
        sogliaMinima: Number(form.sogliaMinima || 0),
      })
      onClose()
    },
  )

  return (
    <Modal
      title={modifica ? `Modifica ${accessorio!.nome}` : 'Aggiungi accessorio'}
      subtitle="Il fornitore si può collegare adesso o più avanti: senza, la richiesta di riordino non parte."
      onClose={onClose}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome" required error={errori.nome}>
          <input className={campoClass(errori.nome)} value={form.nome} onChange={(e) => { setForm({ ...form, nome: e.target.value }); pulisci('nome') }} />
        </Field>
        {/* Il codice è la chiave con cui l'import del listino riconosce una riga: in
            modifica non si tocca, altrimenti al rilancio nascerebbe un doppione. */}
        <Field label="Codice" required={!modifica} error={errori.codice} hint={modifica ? 'Non si cambia: è la chiave con cui la riga viene riconosciuta.' : undefined}>
          <input
            className={campoClass(errori.codice)}
            value={form.codice}
            disabled={modifica}
            onChange={(e) => { setForm({ ...form, codice: e.target.value }); pulisci('codice') }}
            placeholder="ACC-XXX-01"
          />
        </Field>
        <Field label="Categoria">
          <input className={fieldClass} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Bottoni, zip, etichette…" />
        </Field>
        <Field label="Fornitore" hint="Lascia vuoto se non lo sai ancora; svuotarlo lo scollega.">
          <select className={fieldClass} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
            <option value="">Nessuno</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Field>
        <Field label="Costo unitario (€)" error={errori.costoUnitario}>
          <input type="number" min="0" step="0.01" className={campoClass(errori.costoUnitario)} value={form.costoUnitario} onChange={(e) => { setForm({ ...form, costoUnitario: e.target.value }); pulisci('costoUnitario') }} />
        </Field>
        <Field label="Quantità acquistata" error={errori.quantitaAcquistata}>
          <input type="number" min="0" className={campoClass(errori.quantitaAcquistata)} value={form.quantitaAcquistata} onChange={(e) => { setForm({ ...form, quantitaAcquistata: e.target.value }); pulisci('quantitaAcquistata') }} />
        </Field>
        <Field label="Soglia minima" error={errori.sogliaMinima} hint="Sotto questa quantità scatta l'alert.">
          <input type="number" min="0" className={campoClass(errori.sogliaMinima)} value={form.sogliaMinima} onChange={(e) => { setForm({ ...form, sogliaMinima: e.target.value }); pulisci('sogliaMinima') }} />
        </Field>
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Annulla</Button>
        <Button onClick={() => void submit()} disabled={inCorso}>
          {inCorso ? 'Salvataggio…' : modifica ? 'Salva modifiche' : 'Salva accessorio'}
        </Button>
      </FormActions>
    </Modal>
  )
}

export function AccessoriesInventory() {
  const { role } = useRole()
  const navigate = useNavigate()
  const { accessories, suppliers, products, invoices, addAccessory, updateAccessory, addSupplierRequest, caricamento } = useDataStore()
  const { avvisa } = useGoatAlert()
  const [search, setSearch] = useState('')
  const [stato, setStato] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [daModificare, setDaModificare] = useState<Accessory | null>(null)
  const modificabile = canWrite(role, 'inventario')

  const rows = useMemo(
    () =>
      accessories.filter((a) => {
        if (search && !`${a.nome} ${a.codice}`.toLowerCase().includes(search.toLowerCase())) return false
        if (stato && a.stato !== stato) return false
        return true
      }),
    [accessories, search, stato],
  )

  const columns: DataTableColumn<Accessory>[] = [
    {
      header: 'Accessorio',
      accessor: (a) => (
        <div>
          <p className="font-display text-heemia-black">{a.nome}</p>
          <p className="font-mono-heemia text-[11px] text-heemia-grey">{a.codice}</p>
        </div>
      ),
    },
    { header: 'Categoria', accessor: (a) => a.categoria },
    {
      // Un trattino non distingue «non lo so» da «non serve». Il badge sì, ed è la riga
      // su cui il riordino automatico si ferma.
      header: 'Fornitore',
      accessor: (a) => {
        const f = suppliers.find((s) => s.id === a.supplierId)
        return f ? f.nome : <Badge variant="warning-outline">Da collegare</Badge>
      },
    },
    { header: 'Costo unitario', accessor: (a) => formatCurrency(a.costoUnitario), align: 'right' },
    {
      header: 'Integri',
      accessor: (a) => `${Math.max(a.quantitaAcquistata - a.quantitaUtilizzata - a.quantitaPressoTerzisti - a.quantitaScampoli, 0)} ${a.unitaMisura}`,
      align: 'right',
    },
    { header: 'Recuperati', accessor: (a) => `${a.quantitaScampoli} ${a.unitaMisura}`, align: 'right' },
    { header: 'Presso lavoranti', accessor: (a) => `${a.quantitaPressoTerzisti} ${a.unitaMisura}`, align: 'right' },
    { header: 'Stato', accessor: (a) => <StatusBadge status={a.stato} /> },
    {
      header: '',
      accessor: (a) =>
        canWrite(role, 'inventario') && (a.stato === 'sotto_soglia' || a.stato === 'esaurito') ? (
          <button
            type="button"
            onClick={async (e) => {
              // FR-05: genera una bozza email fornitore precompilata e apre la sezione Fornitori.
              // Si aspetta l'esito prima di cambiare pagina: se la bozza non viene creata,
              // portare l'utente in Fornitori a cercare qualcosa che non c'è è peggio che dirlo.
              e.stopPropagation()
              try {
                await addSupplierRequest({ accessoryId: a.id })
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

  const colonne: typeof columns = modificabile
    ? [
        ...columns,
        {
          header: '',
          accessor: (a: Accessory) => (
            <Button variant="ghost" onClick={(e) => { e.stopPropagation(); setDaModificare(a) }}>
              <Pencil aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
              Modifica
            </Button>
          ),
        },
      ]
    : columns

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-heemia-grey">Bottoni, zip, etichette, packaging e altri accessori. Apri una riga per la scheda completa.</p>
        {canWrite(role, 'inventario') && <Button onClick={() => setAddOpen(true)}>Aggiungi accessorio</Button>}
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
        columns={colonne}
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
                  {invoice ? <Link to="/fatture" onClick={(e) => e.stopPropagation()} className="hover:underline">{invoice.numero}</Link> : '–'}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-2">
                <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Prodotti collegati</p>
                <p className="mt-0.5 text-heemia-black">{linkedProducts.length > 0 ? linkedProducts.join(', ') : '–'}</p>
              </div>
            </div>
          )
        }}
      />

      {addOpen && <AccessoryForm onClose={() => setAddOpen(false)} onSubmit={addAccessory} />}

      {daModificare && (
        <AccessoryForm
          accessorio={daModificare}
          onClose={() => setDaModificare(null)}
          onSubmit={async (input) => {
            const { codice: _codice, ...patch } = input
            try {
              await updateAccessory(daModificare.id, patch)
            } catch (e) {
              // Il form non si chiude su un salvataggio rifiutato: chi ha appena scritto
              // non deve riscrivere per leggere l'errore.
              avvisa('salvataggio', {
                testo: e instanceof ApiError ? e.message : "Non è stato possibile salvare l'accessorio.",
              })
              throw e
            }
          }}
        />
      )}
    </div>
  )
}
