import { useState } from 'react'
import { Button } from '../ui/Button'
import { Modal, Field, FormActions, fieldClass } from '../ui/Modal'
import type { Linea, Product } from '../../types'

// Modifica dei dati prodotto (FR-01) nel prototipo: aggiorna il record nel MockStore in
// sessione. Il prezzo netto IVA viene ricalcolato automaticamente dal prezzo di vendita
// (IVA 22%), come da definizione campo "calcolato automaticamente" in FR-01.
export function EditProductForm({
  product,
  onClose,
  onSave,
}: {
  product: Product
  onClose: () => void
  onSave: (patch: Partial<Product>) => void
}) {
  const [form, setForm] = useState({
    nome: product.nome,
    codiceProdotto: product.codiceProdotto,
    categoria: product.categoria,
    collezione: product.collezione,
    stagione: product.stagione,
    linea: product.linea,
    vestibilita: product.vestibilita ?? '',
    taglie: product.taglieDisponibili.join(', '),
    colori: product.coloriDisponibili.join(', '),
    prezzoVendita: product.prezzoVendita > 0 ? String(product.prezzoVendita) : '',
    prezzoShowroom: product.prezzoShowroom > 0 ? String(product.prezzoShowroom) : '',
    prezzoConsigliato: product.prezzoConsigliato > 0 ? String(product.prezzoConsigliato) : '',
    descrizioneBreve: product.descrizioneBreve ?? '',
    descrizioneEcommerce: product.descrizioneEcommerce ?? '',
    descrizioneTecnica: product.descrizioneTecnica ?? '',
    consigliCura: product.consigliCura ?? '',
    disponibilitaOnline: product.disponibilitaOnline,
    disponibilitaShowroom: product.disponibilitaShowroom,
    visibileShowroom: product.visibileShowroom,
  })

  const splitList = (s: string) =>
    s.split(',').map((x) => x.trim()).filter(Boolean)

  const submit = () => {
    if (!form.nome.trim() || !form.codiceProdotto.trim()) return
    const prezzoVendita = Number(form.prezzoVendita || 0)
    const descrizioneBreve = form.descrizioneBreve.trim()
    const consigliCura = form.consigliCura.trim()
    onSave({
      nome: form.nome.trim(),
      codiceProdotto: form.codiceProdotto.trim(),
      categoria: form.categoria.trim(),
      collezione: form.collezione.trim(),
      stagione: form.stagione.trim(),
      linea: form.linea,
      vestibilita: form.vestibilita.trim() || undefined,
      taglieDisponibili: splitList(form.taglie),
      coloriDisponibili: splitList(form.colori),
      prezzoVendita,
      prezzoNettoIva: prezzoVendita > 0 ? Math.round((prezzoVendita / 1.22) * 100) / 100 : 0,
      prezzoShowroom: Number(form.prezzoShowroom || 0),
      prezzoConsigliato: Number(form.prezzoConsigliato || 0),
      descrizioneBreve: descrizioneBreve || undefined,
      // Un testo modificato a mano torna in stato "bozza" finché non viene riapprovato (FR-12/FR-13).
      descrizioneBreveStato: descrizioneBreve && descrizioneBreve !== (product.descrizioneBreve ?? '') ? 'bozza' : product.descrizioneBreveStato,
      descrizioneEcommerce: form.descrizioneEcommerce.trim() || undefined,
      descrizioneTecnica: form.descrizioneTecnica.trim() || undefined,
      consigliCura: consigliCura || undefined,
      consigliCuraStato: consigliCura && consigliCura !== (product.consigliCura ?? '') ? 'bozza' : product.consigliCuraStato,
      disponibilitaOnline: form.disponibilitaOnline,
      disponibilitaShowroom: form.disponibilitaShowroom,
      visibileShowroom: form.visibileShowroom,
    })
    onClose()
  }

  const checkboxRow = (label: string, key: 'disponibilitaOnline' | 'disponibilitaShowroom' | 'visibileShowroom') => (
    <label className="flex items-center gap-2 text-sm text-heemia-black">
      <input
        type="checkbox"
        checked={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
        className="h-3.5 w-3.5 accent-heemia-black"
      />
      {label}
    </label>
  )

  return (
    <Modal title="Modifica dati prodotto" subtitle={product.codiceProdotto} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome prodotto">
          <input className={fieldClass} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </Field>
        <Field label="Codice prodotto">
          <input className={fieldClass} value={form.codiceProdotto} onChange={(e) => setForm({ ...form, codiceProdotto: e.target.value })} />
        </Field>
        <Field label="Categoria">
          <input className={fieldClass} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
        </Field>
        <Field label="Collezione">
          <input className={fieldClass} value={form.collezione} onChange={(e) => setForm({ ...form, collezione: e.target.value })} />
        </Field>
        <Field label="Stagione">
          <input className={fieldClass} value={form.stagione} onChange={(e) => setForm({ ...form, stagione: e.target.value })} />
        </Field>
        <Field label="Linea">
          <select className={fieldClass} value={form.linea} onChange={(e) => setForm({ ...form, linea: e.target.value as Linea })}>
            <option value="tessile">Tessile</option>
            <option value="maglieria">Maglieria</option>
          </select>
        </Field>
        <Field label="Vestibilità">
          <input className={fieldClass} value={form.vestibilita} onChange={(e) => setForm({ ...form, vestibilita: e.target.value })} placeholder="Regular, Oversize…" />
        </Field>
        <Field label="Taglie (separate da virgola)">
          <input className={fieldClass} value={form.taglie} onChange={(e) => setForm({ ...form, taglie: e.target.value })} placeholder="XS, S, M, L" />
        </Field>
        <Field label="Colori (separati da virgola)">
          <input className={fieldClass} value={form.colori} onChange={(e) => setForm({ ...form, colori: e.target.value })} placeholder="Nero, Crema" />
        </Field>
        <Field label="Prezzo vendita IVA incl. (€)">
          <input type="number" min="0" step="0.01" className={fieldClass} value={form.prezzoVendita} onChange={(e) => setForm({ ...form, prezzoVendita: e.target.value })} />
        </Field>
        <Field label="Prezzo showroom (€)">
          <input type="number" min="0" step="0.01" className={fieldClass} value={form.prezzoShowroom} onChange={(e) => setForm({ ...form, prezzoShowroom: e.target.value })} />
        </Field>
        <Field label="Prezzo consigliato (€)">
          <input type="number" min="0" step="0.01" className={fieldClass} value={form.prezzoConsigliato} onChange={(e) => setForm({ ...form, prezzoConsigliato: e.target.value })} />
        </Field>
        <div className="col-span-2">
          <Field label="Descrizione breve">
            <textarea rows={2} className={fieldClass} value={form.descrizioneBreve} onChange={(e) => setForm({ ...form, descrizioneBreve: e.target.value })} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Descrizione e-commerce">
            <textarea rows={2} className={fieldClass} value={form.descrizioneEcommerce} onChange={(e) => setForm({ ...form, descrizioneEcommerce: e.target.value })} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Descrizione tecnica">
            <textarea rows={2} className={fieldClass} value={form.descrizioneTecnica} onChange={(e) => setForm({ ...form, descrizioneTecnica: e.target.value })} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Consigli di cura">
            <textarea rows={2} className={fieldClass} value={form.consigliCura} onChange={(e) => setForm({ ...form, consigliCura: e.target.value })} />
          </Field>
        </div>
        <div className="col-span-2 flex flex-wrap gap-5 border-t border-heemia-border pt-3">
          {checkboxRow('Disponibile online', 'disponibilitaOnline')}
          {checkboxRow('Disponibile in showroom', 'disponibilitaShowroom')}
          {checkboxRow('Visibile nella showroom app', 'visibileShowroom')}
        </div>
      </div>
      <FormActions>
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button onClick={submit} disabled={!form.nome.trim() || !form.codiceProdotto.trim()}>Salva modifiche</Button>
      </FormActions>
    </Modal>
  )
}
