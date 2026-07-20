import { useState } from 'react'
import { Button } from '../ui/Button'
import { Modal, Field, FormActions, fieldClass } from '../ui/Modal'
import type { Product } from '../../types'
import type { NewVariantInput } from '../../context/MockStore'

// Nuova variante taglia/colore (FR-03): crea insieme il record di inventario prodotti finiti
// collegato (FR-INV-01), così la quantità è subito visibile e modificabile da entrambe le viste.
export function AddVariantForm({
  product,
  onClose,
  onSubmit,
}: {
  product: Product
  onClose: () => void
  onSubmit: (input: NewVariantInput) => void
}) {
  const [form, setForm] = useState({ taglia: '', colore: '', sku: '', stockIniziale: '', sogliaMinima: '', immagineUrl: '' })

  const suggestedSku = () => {
    if (form.sku.trim()) return form.sku.trim()
    const taglia = form.taglia.trim().toUpperCase()
    const colore = form.colore.trim().slice(0, 3).toUpperCase()
    return [product.codiceProdotto, taglia, colore].filter(Boolean).join('-')
  }

  const submit = () => {
    if (!form.taglia.trim() || !form.colore.trim()) return
    onSubmit({
      productId: product.id,
      sku: suggestedSku(),
      taglia: form.taglia.trim(),
      colore: form.colore.trim(),
      stockIniziale: Number(form.stockIniziale || 0),
      sogliaMinima: Number(form.sogliaMinima || 0),
      immagineUrl: form.immagineUrl.trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal title="Aggiungi variante" subtitle={`${product.nome}: nuova combinazione taglia/colore con stock iniziale.`} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Taglia">
          <input className={fieldClass} value={form.taglia} onChange={(e) => setForm({ ...form, taglia: e.target.value })} placeholder="S, M, L…" />
        </Field>
        <Field label="Colore">
          <input className={fieldClass} value={form.colore} onChange={(e) => setForm({ ...form, colore: e.target.value })} placeholder="Nero" />
        </Field>
        <div className="col-span-2">
          <Field label="SKU variante">
            <input className={fieldClass} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder={suggestedSku() || 'Generato da codice prodotto + taglia + colore'} />
          </Field>
        </div>
        <Field label="Stock iniziale">
          <input type="number" min="0" className={fieldClass} value={form.stockIniziale} onChange={(e) => setForm({ ...form, stockIniziale: e.target.value })} />
        </Field>
        <Field label="Soglia minima">
          <input type="number" min="0" className={fieldClass} value={form.sogliaMinima} onChange={(e) => setForm({ ...form, sogliaMinima: e.target.value })} />
        </Field>
        <div className="col-span-2">
          <Field label="Immagine variante (link, opzionale)">
            <input className={fieldClass} value={form.immagineUrl} onChange={(e) => setForm({ ...form, immagineUrl: e.target.value })} placeholder="https://drive.google.com/…" />
          </Field>
        </div>
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button onClick={submit} disabled={!form.taglia.trim() || !form.colore.trim()}>Crea variante</Button>
      </FormActions>
    </Modal>
  )
}
