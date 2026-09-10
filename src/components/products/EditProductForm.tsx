import { useState } from 'react'
import { Button } from '../ui/Button'
import { Modal, Field, FormActions, SiNoField, campoClass, fieldClass } from '../ui/Modal'
import { TaglieSelector } from './TaglieSelector'
import { PrezzoCalcolato } from './PrezzoCalcolato'
import { opzioniVestibilita } from '../../lib/vestibilita'
import { useFormSubmit, regole } from '../../hooks/useFormSubmit'
import { useServerPrezzoConsigliato } from '../../hooks/useServerPrezzoConsigliato'
import type { Linea, Product } from '../../types'

/**
 * Modifica dei dati prodotto (FR-01).
 *
 * 2026-09-10 — tre campi hanno smesso di essere testo libero, e uno è sparito del tutto.
 *
 *   - **Vestibilità**: menu invece di campo da digitare. Un campo da digitare produce
 *     «Oversize», «oversize» e «over» come tre vestibilità diverse, e il filtro del catalogo
 *     cliente le tratta come tali. L'elenco sta in `lib/vestibilita.ts`, e un capo con un
 *     valore storico fuori elenco se lo tiene.
 *   - **Taglie**: caselle da toccare invece di `"XS, S, M, L"`. Stessa ragione, più una:
 *     una virgola dimenticata fondeva due taglie in una.
 *   - **Composizione**: non si scrive più qui. La ricava il server dai tessuti del capo
 *     (`products/composizioneAutomatica.ts`) e si vede nella scheda prodotto.
 *   - **Prezzi**: non si scrivono più. Li calcola il server dai costi della scheda tecnica
 *     con il margine obiettivo dell'azienda, e lo showroom è il listino meno il dieci per
 *     cento. Qui si vedono — prima di salvare, come chiede la regola — e si applicano con un
 *     gesto solo. Il campo «prezzo consigliato» non esiste più come voce a sé: da quando il
 *     prezzo si calcola, il consigliato **è** il listino.
 */
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
    linea: product.linea,
    vestibilita: product.vestibilita ?? '',
    taglie: product.taglieDisponibili,
    colori: product.coloriDisponibili.join(', '),
    descrizioneBreve: product.descrizioneBreve ?? '',
    descrizioneEcommerce: product.descrizioneEcommerce ?? '',
    descrizioneTecnica: product.descrizioneTecnica ?? '',
    consigliCura: product.consigliCura ?? '',
    disponibilitaOnline: product.disponibilitaOnline,
    disponibilitaShowroom: product.disponibilitaShowroom,
    visibileShowroom: product.visibileShowroom,
    personalizzabileSuMisura: product.personalizzabileSuMisura ?? false,
    tempiRealizzazione: product.tempiRealizzazione ?? '',
  })

  const { prezzo, applica } = useServerPrezzoConsigliato(product.id)
  const [prezzoInCorso, setPrezzoInCorso] = useState(false)
  const [prezzoErrore, setPrezzoErrore] = useState<string | null>(null)

  const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
  const vestibilitaOpzioni = opzioniVestibilita(product.vestibilita)

  type Campo = 'nome' | 'codiceProdotto'

  const { errori, inCorso, submit, pulisci } = useFormSubmit<Campo>(
    () => ({
      nome: regole.obbligatorio(form.nome, 'Il nome prodotto'),
      codiceProdotto: regole.obbligatorio(form.codiceProdotto, 'Il codice prodotto'),
    }),
    async () => {
      const descrizioneBreve = form.descrizioneBreve.trim()
      const consigliCura = form.consigliCura.trim()
      // I quattro campi prezzo non sono nell'elenco: non passando nella patch restano quelli
      // che il server ha calcolato, invece di essere riscritti da una copia in questo form.
      await onSave({
        nome: form.nome.trim(),
        codiceProdotto: form.codiceProdotto.trim(),
        categoria: form.categoria.trim(),
        collezione: form.collezione.trim(),
        linea: form.linea,
        vestibilita: form.vestibilita.trim() || undefined,
        taglieDisponibili: form.taglie,
        coloriDisponibili: splitList(form.colori),
        descrizioneBreve: descrizioneBreve || undefined,
        // Un testo modificato a mano torna in stato "bozza" finché non viene riapprovato (FR-12/FR-13).
        descrizioneBreveStato: descrizioneBreve && descrizioneBreve !== (product.descrizioneBreve ?? '') ? 'bozza' : product.descrizioneBreveStato,
        descrizioneEcommerce: form.descrizioneEcommerce.trim() || undefined,
        descrizioneTecnica: form.descrizioneTecnica.trim() || undefined,
        consigliCura: consigliCura || undefined,
        consigliCuraStato: consigliCura && consigliCura !== (product.consigliCura ?? '') ? 'bozza' : product.consigliCuraStato,
        disponibilitaOnline: form.disponibilitaOnline,
        disponibilitaShowroom: form.disponibilitaShowroom,
        // I due attributi che decidono la vista cliente (DEC-044): il catalogo si aggiorna
        // da sé al salvataggio, perché legge la stessa anagrafica.
        visibileShowroom: form.visibileShowroom,
        personalizzabileSuMisura: form.personalizzabileSuMisura,
        tempiRealizzazione: form.tempiRealizzazione.trim() || undefined,
      })
      onClose()
    },
  )

  async function applicaPrezzo() {
    setPrezzoInCorso(true)
    setPrezzoErrore(null)
    try {
      await applica()
    } catch (e) {
      setPrezzoErrore(e instanceof Error ? e.message : 'Prezzo non applicato.')
    } finally {
      setPrezzoInCorso(false)
    }
  }

  const checkboxRow = (label: string, key: 'disponibilitaOnline' | 'disponibilitaShowroom') => (
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
    <Modal title="Modifica dati prodotto" subtitle={product.codiceProdotto} onClose={onClose} larghezza="ampio">
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
        <Field label="Linea">
          <select className={fieldClass} value={form.linea} onChange={(e) => setForm({ ...form, linea: e.target.value as Linea })}>
            <option value="tessile">Tessile</option>
            <option value="maglieria">Maglieria</option>
          </select>
        </Field>
        <Field label="Vestibilità" hint="Elenco condiviso: si allunga da lib/vestibilita.ts.">
          <select
            className={fieldClass}
            value={form.vestibilita}
            onChange={(e) => setForm({ ...form, vestibilita: e.target.value })}
          >
            <option value="">—</option>
            {vestibilitaOpzioni.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </Field>

        <div className="col-span-full">
          <TaglieSelector taglie={form.taglie} onChange={(taglie) => setForm({ ...form, taglie })} />
        </div>

        <Field label="Colori (separati da virgola)">
          <input className={fieldClass} value={form.colori} onChange={(e) => setForm({ ...form, colori: e.target.value })} placeholder="Nero, Crema" />
        </Field>

        {/* I prezzi non sono campi: sono un risultato. Si vedono qui, prima di salvare. */}
        <div className="col-span-full border-t border-heemia-border pt-3">
          {prezzo ? (
            <PrezzoCalcolato prezzo={prezzo} onApplica={applicaPrezzo} inCorso={prezzoInCorso} canEdit />
          ) : (
            <p className="text-xs text-heemia-grey">Prezzo calcolato in caricamento…</p>
          )}
          {prezzoErrore && <p className="mt-2 text-xs text-heemia-carmine">{prezzoErrore}</p>}
        </div>

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
        <div className="col-span-2 grid grid-cols-1 gap-3 border-t border-heemia-border pt-3 sm:grid-cols-2">
          <p className="font-mono-heemia col-span-full text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
            Vista cliente showroom
          </p>
          <SiNoField
            label="Visibile in showroom"
            value={form.visibileShowroom}
            onChange={(v) => setForm({ ...form, visibileShowroom: v })}
            hint="Capo esposto e appeso allo stand. Non dipende dalle giacenze."
          />
          <SiNoField
            label="Personalizzabile su misura"
            value={form.personalizzabileSuMisura}
            onChange={(v) => setForm({ ...form, personalizzabileSuMisura: v })}
            hint="Compare fra i modelli su misura anche se non è appeso."
          />
          <div className="col-span-full sm:col-span-1">
            <Field label="Tempi indicativi di realizzazione" hint="Mostrati al cliente sul su misura. Es. 4-6 settimane.">
              <input
                className={fieldClass}
                value={form.tempiRealizzazione}
                onChange={(e) => setForm({ ...form, tempiRealizzazione: e.target.value })}
                placeholder="4-6 settimane"
              />
            </Field>
          </div>
        </div>
        <div className="col-span-2 flex flex-wrap gap-5 border-t border-heemia-border pt-3">
          {checkboxRow('Disponibile online', 'disponibilitaOnline')}
          {checkboxRow('Disponibile in showroom (giacenza)', 'disponibilitaShowroom')}
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
