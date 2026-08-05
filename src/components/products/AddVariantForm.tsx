import { useState } from 'react'
import { Button } from '../ui/Button'
import { Modal, Field, FormActions, campoClass, fieldClass } from '../ui/Modal'
import { useFormSubmit, regole } from '../../hooks/useFormSubmit'
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
  onSubmit: (input: NewVariantInput) => void | Promise<unknown>
}) {
  const [form, setForm] = useState({ taglia: '', colore: '', sku: '', stockIniziale: '', sogliaMinima: '', immagineUrl: '' })

  const suggestedSku = () => {
    if (form.sku.trim()) return form.sku.trim()
    const taglia = form.taglia.trim().toUpperCase()
    const colore = form.colore.trim().slice(0, 3).toUpperCase()
    return [product.codiceProdotto, taglia, colore].filter(Boolean).join('-')
  }

  const { errori, inCorso, submit, pulisci } = useFormSubmit<
    'taglia' | 'colore' | 'stockIniziale' | 'sogliaMinima'
  >(
    () => ({
      taglia: regole.obbligatorio(form.taglia, 'La taglia'),
      colore: regole.obbligatorio(form.colore, 'Il colore'),
      stockIniziale: regole.numeroPositivo(form.stockIniziale, 'Lo stock iniziale'),
      sogliaMinima: regole.numeroPositivo(form.sogliaMinima, 'La soglia minima'),
    }),
    // Lo SKU duplicato lo rifiuta il server: senza attendere la risposta il modale
    // si chiudeva lasciando credere che la variante fosse stata creata.
    async () => {
      await onSubmit({
        productId: product.id,
        sku: suggestedSku(),
        taglia: form.taglia.trim(),
        colore: form.colore.trim(),
        stockIniziale: Number(form.stockIniziale || 0),
        sogliaMinima: Number(form.sogliaMinima || 0),
        immagineUrl: form.immagineUrl.trim() || undefined,
      })
      onClose()
    },
  )

  return (
    <Modal title="Aggiungi variante" subtitle={`${product.nome}: nuova combinazione taglia/colore con stock iniziale.`} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Taglia" required error={errori.taglia}>
          <input
            className={campoClass(errori.taglia)}
            value={form.taglia}
            onChange={(e) => { setForm({ ...form, taglia: e.target.value }); pulisci('taglia') }}
            placeholder="S, M, L…"
          />
        </Field>
        <Field label="Colore" required error={errori.colore}>
          <input
            className={campoClass(errori.colore)}
            value={form.colore}
            onChange={(e) => { setForm({ ...form, colore: e.target.value }); pulisci('colore') }}
            placeholder="Nero"
          />
        </Field>
        <div className="col-span-2">
          <Field label="SKU variante">
            <input className={fieldClass} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder={suggestedSku() || 'Generato da codice prodotto + taglia + colore'} />
          </Field>
        </div>
        <Field label="Stock iniziale" error={errori.stockIniziale}>
          <input
            type="number"
            min="0"
            className={campoClass(errori.stockIniziale)}
            value={form.stockIniziale}
            onChange={(e) => { setForm({ ...form, stockIniziale: e.target.value }); pulisci('stockIniziale') }}
          />
        </Field>
        <Field label="Soglia minima" error={errori.sogliaMinima} hint="Sotto questa quantità scatta l'alert.">
          <input
            type="number"
            min="0"
            className={campoClass(errori.sogliaMinima)}
            value={form.sogliaMinima}
            onChange={(e) => { setForm({ ...form, sogliaMinima: e.target.value }); pulisci('sogliaMinima') }}
          />
        </Field>
        <div className="col-span-2">
          <Field label="Immagine variante (link, opzionale)">
            <input className={fieldClass} value={form.immagineUrl} onChange={(e) => setForm({ ...form, immagineUrl: e.target.value })} placeholder="https://drive.google.com/…" />
          </Field>
        </div>
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Annulla</Button>
        <Button onClick={() => void submit()} disabled={inCorso}>
          {inCorso ? 'Creazione…' : 'Crea variante'}
        </Button>
      </FormActions>
    </Modal>
  )
}
