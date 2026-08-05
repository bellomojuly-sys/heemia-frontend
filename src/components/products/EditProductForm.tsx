import { useState } from 'react'
import { Button } from '../ui/Button'
import { Modal, Field, FormActions, campoClass, fieldClass } from '../ui/Modal'
import { useFormSubmit, regole } from '../../hooks/useFormSubmit'
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
  onSave: (patch: Partial<Product>) => void | Promise<unknown>
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

  type Campo = 'nome' | 'codiceProdotto' | 'prezzoVendita' | 'prezzoShowroom' | 'prezzoConsigliato'

  const { errori, inCorso, submit, pulisci } = useFormSubmit<Campo>(
    () => ({
      nome: regole.obbligatorio(form.nome, 'Il nome prodotto'),
      codiceProdotto: regole.obbligatorio(form.codiceProdotto, 'Il codice prodotto'),
      prezzoVendita: regole.numeroPositivo(form.prezzoVendita, 'Il prezzo di vendita'),
      prezzoShowroom: regole.numeroPositivo(form.prezzoShowroom, 'Il prezzo showroom'),
      prezzoConsigliato: regole.numeroPositivo(form.prezzoConsigliato, 'Il prezzo consigliato'),
    }),
    async () => {
      const prezzoVendita = Number(form.prezzoVendita || 0)
      const descrizioneBreve = form.descrizioneBreve.trim()
      const consigliCura = form.consigliCura.trim()
      await onSave({
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
    },
  )

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome prodotto" required error={errori.nome}>
          <input
            className={campoClass(errori.nome)}
            value={form.nome}
            onChange={(e) => { setForm({ ...form, nome: e.target.value }); pulisci('nome') }}
          />
        </Field>
        <Field label="Codice prodotto" required error={errori.codiceProdotto}>
          <input
            className={campoClass(errori.codiceProdotto)}
            value={form.codiceProdotto}
            onChange={(e) => { setForm({ ...form, codiceProdotto: e.target.value }); pulisci('codiceProdotto') }}
          />
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
        <Field label="Prezzo vendita IVA incl. (€)" error={errori.prezzoVendita} hint="Il prezzo netto IVA si calcola da qui.">
          <input
            type="number"
            min="0"
            step="0.01"
            className={campoClass(errori.prezzoVendita)}
            value={form.prezzoVendita}
            onChange={(e) => { setForm({ ...form, prezzoVendita: e.target.value }); pulisci('prezzoVendita') }}
          />
        </Field>
        <Field label="Prezzo showroom (€)" error={errori.prezzoShowroom}>
          <input
            type="number"
            min="0"
            step="0.01"
            className={campoClass(errori.prezzoShowroom)}
            value={form.prezzoShowroom}
            onChange={(e) => { setForm({ ...form, prezzoShowroom: e.target.value }); pulisci('prezzoShowroom') }}
          />
        </Field>
        <Field label="Prezzo consigliato (€)" error={errori.prezzoConsigliato}>
          <input
            type="number"
            min="0"
            step="0.01"
            className={campoClass(errori.prezzoConsigliato)}
            value={form.prezzoConsigliato}
            onChange={(e) => { setForm({ ...form, prezzoConsigliato: e.target.value }); pulisci('prezzoConsigliato') }}
          />
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
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Annulla</Button>
        <Button onClick={() => void submit()} disabled={inCorso}>
          {inCorso ? 'Salvataggio…' : 'Salva modifiche'}
        </Button>
      </FormActions>
    </Modal>
  )
}
