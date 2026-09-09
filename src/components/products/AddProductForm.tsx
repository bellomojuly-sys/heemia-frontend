import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Modal, Field, FormActions, SiNoField, campoClass, fieldClass } from '../ui/Modal'
import { useTessuti } from '../../hooks/useTessuti'
import { useFormSubmit, regole } from '../../hooks/useFormSubmit'
import { api } from '../../lib/api'
import type { Linea } from '../../types'
import type { NewProductInput } from '../../context/DataStore'

const emptyForm = {
  nome: '',
  categoria: '',
  collezione: '',
  tessuto: '',
  linea: 'tessile' as Linea,
  // Attributi commerciali della vista cliente (DEC-044). Partono da "No": un capo appena
  // creato non è ancora appeso in showroom né confermato come su misura.
  visibileShowroom: false,
  personalizzabileSuMisura: false,
}

// Form condiviso tra Anagrafica prodotti e Pipeline produzione: il prodotto creato parte
// dalla fase "Idea" ed entra subito in pipeline (vedi DataStore.addProduct).
export function AddProductForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (input: NewProductInput) => void | Promise<unknown>
}) {
  const tessuti = useTessuti()
  const [form, setForm] = useState(emptyForm)
  // Il codice non si scrive piu': lo assegna il server con il primo numero libero della
  // serie (products/service.ts). Qui si chiede solo quale sara', per mostrarlo prima di
  // salvare — chi crea il capo lo vede, invece di scoprirlo dopo nella lista.
  const [codicePrevisto, setCodicePrevisto] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api
      .get<{ codiceProdotto: string }>('/products/prossimo-codice')
      .then((r) => { if (vivo) setCodicePrevisto(r.codiceProdotto) })
      .catch(() => { if (vivo) setCodicePrevisto(null) })
    return () => { vivo = false }
  }, [])

  const tessutoScelto = tessuti.find((t) => t.nome === form.tessuto)

  const { errori, inCorso, submit, pulisci } = useFormSubmit<'nome'>(
    () => ({
      nome: regole.obbligatorio(form.nome, 'Il nome prodotto'),
    }),
    // Il modale si chiude solo dopo che il server ha confermato: se il salvataggio fallisce
    // l'errore resta visibile e i dati digitati non si perdono.
    async () => {
      await onSubmit({
        nome: form.nome.trim(),
        categoria: form.categoria.trim(),
        collezione: form.collezione.trim(),
        tessuto: form.tessuto.trim() || undefined,
        linea: form.linea,
        visibileShowroom: form.visibileShowroom,
        personalizzabileSuMisura: form.personalizzabileSuMisura,
      })
      onClose()
    },
  )

  return (
    <Modal title="Nuovo prodotto" subtitle="Crea la scheda base. Entra nella scheda prodotto per completare prezzi, varianti e scheda tecnica." onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome prodotto" required error={errori.nome}>
          <input
            className={campoClass(errori.nome)}
            value={form.nome}
            onChange={(e) => {
              setForm({ ...form, nome: e.target.value })
              pulisci('nome')
            }}
            placeholder="Es. Cortina"
          />
        </Field>
        {/* Sola lettura: il codice e' una posizione nella serie dell'azienda, non una scelta
            di chi compila. Il valore e' un'anteprima — se qualcun altro salva un capo nello
            stesso momento, al salvataggio arriva il primo numero ancora libero. */}
        <Field label="Codice prodotto" hint="Assegnato dal sistema: il primo libero della serie.">
          <p className="font-mono-heemia flex h-[38px] items-center rounded-heemia-sm border border-dashed border-heemia-border bg-heemia-surface-muted px-3 text-sm text-heemia-black">
            {codicePrevisto ?? '…'}
          </p>
        </Field>
        <Field label="Categoria">
          <input className={fieldClass} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Felpa, Pantalone…" />
        </Field>
        <Field label="Collezione">
          <input className={fieldClass} value={form.collezione} onChange={(e) => setForm({ ...form, collezione: e.target.value })} />
        </Field>
        {/* Scelto il tessuto, il server compila composizione e consigli di cura dalla
            tabella approvata. Qui si mostra cosa succederà: chi crea il capo lo vede
            prima di salvare, invece di scoprirlo dopo nella scheda. */}
        <Field
          label="Tessuto"
          hint={
            tessutoScelto
              ? `Composizione: ${tessutoScelto.composizione}. I consigli di cura si compilano da soli.`
              : form.tessuto
                ? 'Tessuto fuori tabella: composizione e consigli restano da scrivere a mano.'
                : 'Da qui si ricavano composizione e consigli di cura.'
          }
        >
          <select
            className={fieldClass}
            value={form.tessuto}
            onChange={(e) => setForm({ ...form, tessuto: e.target.value })}
          >
            <option value="">—</option>
            {tessuti.map((t) => (
              <option key={t.nome} value={t.nome}>{t.nome}</option>
            ))}
          </select>
        </Field>
        <Field label="Linea">
          <select className={fieldClass} value={form.linea} onChange={(e) => setForm({ ...form, linea: e.target.value as Linea })}>
            <option value="tessile">Tessile</option>
            <option value="maglieria">Maglieria</option>
          </select>
        </Field>
        <div className="col-span-full grid grid-cols-1 gap-3 border-t border-heemia-border pt-3 sm:grid-cols-2">
          <p className="font-mono-heemia col-span-full text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
            Vista cliente showroom
          </p>
          <SiNoField
            label="Visibile in showroom"
            value={form.visibileShowroom}
            onChange={(v) => setForm({ ...form, visibileShowroom: v })}
            hint="Capo esposto e appeso allo stand: compare fra i capi presenti."
          />
          <SiNoField
            label="Personalizzabile su misura"
            value={form.personalizzabileSuMisura}
            onChange={(v) => setForm({ ...form, personalizzabileSuMisura: v })}
            hint="Compare fra i modelli su misura anche se non è appeso."
          />
        </div>
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Annulla</Button>
        <Button onClick={() => void submit()} disabled={inCorso}>
          {inCorso ? 'Creazione…' : 'Crea prodotto'}
        </Button>
      </FormActions>
    </Modal>
  )
}
