import { useState } from 'react'
import { Button } from '../ui/Button'
import { Modal, Field, FormActions, campoClass, fieldClass } from '../ui/Modal'
import { useFormSubmit, regole } from '../../hooks/useFormSubmit'
import type { Linea } from '../../types'
import type { NewProductInput } from '../../context/MockStore'

const emptyForm = {
  nome: '',
  codiceProdotto: '',
  categoria: '',
  collezione: '',
  stagione: '',
  linea: 'tessile' as Linea,
}

// Form condiviso tra Anagrafica prodotti e Pipeline produzione: il prodotto creato parte
// dalla fase "Idea" ed entra subito in pipeline (vedi MockStore.addProduct).
export function AddProductForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (input: NewProductInput) => void | Promise<unknown>
}) {
  const [form, setForm] = useState(emptyForm)

  const { errori, inCorso, submit, pulisci } = useFormSubmit<'nome' | 'codiceProdotto'>(
    () => ({
      nome: regole.obbligatorio(form.nome, 'Il nome prodotto'),
      codiceProdotto: regole.obbligatorio(form.codiceProdotto, 'Il codice prodotto'),
    }),
    // Il modale si chiude solo dopo che il server ha confermato: se il codice
    // prodotto è già in uso l'errore resta visibile e i dati digitati non si perdono.
    async () => {
      await onSubmit({
        nome: form.nome.trim(),
        codiceProdotto: form.codiceProdotto.trim(),
        categoria: form.categoria.trim(),
        collezione: form.collezione.trim(),
        stagione: form.stagione.trim(),
        linea: form.linea,
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
        <Field label="Codice prodotto" required error={errori.codiceProdotto} hint="Deve essere unico.">
          <input
            className={campoClass(errori.codiceProdotto)}
            value={form.codiceProdotto}
            onChange={(e) => {
              setForm({ ...form, codiceProdotto: e.target.value })
              pulisci('codiceProdotto')
            }}
            placeholder="HE-TES-COR-01"
          />
        </Field>
        <Field label="Categoria">
          <input className={fieldClass} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Felpa, Pantalone…" />
        </Field>
        <Field label="Collezione">
          <input className={fieldClass} value={form.collezione} onChange={(e) => setForm({ ...form, collezione: e.target.value })} />
        </Field>
        <Field label="Stagione">
          <input className={fieldClass} value={form.stagione} onChange={(e) => setForm({ ...form, stagione: e.target.value })} placeholder="FW26" />
        </Field>
        <Field label="Linea">
          <select className={fieldClass} value={form.linea} onChange={(e) => setForm({ ...form, linea: e.target.value as Linea })}>
            <option value="tessile">Tessile</option>
            <option value="maglieria">Maglieria</option>
          </select>
        </Field>
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
