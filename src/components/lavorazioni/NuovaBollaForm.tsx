import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal, Field, FormActions, campoClass, fieldClass } from '../ui/Modal'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { useDataStore } from '../../context/DataStore'
import { useArticoliDisponibili, type NuovaBollaInput, type NuovaRigaInput } from '../../hooks/useServerLavorazioni'
import type { ArticoloDisponibile, CausaleBolla } from '../../types'

// Nuova bolla di uscita verso un lavorante.
//
// Il punto delicato di questo form è la disponibilità. I materiali si scelgono
// dall'inventario vero (nessun elenco statico), e accanto a ogni riga si vede quanto se ne
// può davvero consegnare: il residuo **meno** quello che è già presso altri lavoranti.
// Senza quel secondo numero si finirebbe per promettere due volte gli stessi metri, e
// l'errore comparirebbe solo alla conferma.

const CAUSALI: { id: CausaleBolla; label: string }[] = [
  { id: 'conto_lavorazione', label: 'Conto lavorazione' },
  { id: 'conto_visione', label: 'Conto visione' },
  { id: 'riparazione', label: 'Riparazione' },
  { id: 'campionatura', label: 'Campionatura' },
  { id: 'reso_a_fornitore', label: 'Reso a fornitore' },
  { id: 'altro', label: 'Altro' },
]

/** Le categorie di fornitore che nella pratica fanno lavorazione esterna. */
const CATEGORIE_LAVORANTI = ['Confezione', 'Modellistica/Confezione', 'Modellistica', 'Ricami', 'Smacchinatore']

interface RigaForm extends NuovaRigaInput {
  chiave: string
}

const nuovaChiave = () => `r${Math.random().toString(36).slice(2, 9)}`

export function NuovaBollaForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (input: NuovaBollaInput) => Promise<unknown>
}) {
  const { suppliers, products } = useDataStore()
  const { articoli, caricamento: caricamentoArticoli } = useArticoliDisponibili()

  const [supplierId, setSupplierId] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [causale, setCausale] = useState<CausaleBolla>('conto_lavorazione')
  const [productId, setProductId] = useState('')
  const [commessa, setCommessa] = useState('')
  const [quantitaAttesa, setQuantitaAttesa] = useState('')
  const [note, setNote] = useState('')
  const [righe, setRighe] = useState<RigaForm[]>([{
    chiave: nuovaChiave(), tipo: 'materiale', articoloId: '', quantita: 0, provenienza: 'magazzino',
  }])

  const perId = useMemo(() => new Map(articoli.map((a) => [a.id, a])), [articoli])

  // I lavoranti in cima, il resto sotto: l'elenco fornitori è lungo e nel 95% dei casi
  // si cerca una confezione o un ricamificio.
  const fornitoriOrdinati = useMemo(() => {
    const lavoranti = suppliers.filter((s) => CATEGORIE_LAVORANTI.includes(s.categoria))
    const altri = suppliers.filter((s) => !CATEGORIE_LAVORANTI.includes(s.categoria))
    return { lavoranti, altri }
  }, [suppliers])

  const articoliPerTipo = useMemo(
    () => ({
      materiale: articoli.filter((a) => a.tipo === 'materiale'),
      accessorio: articoli.filter((a) => a.tipo === 'accessorio'),
      variante: articoli.filter((a) => a.tipo === 'variante'),
    }),
    [articoli],
  )

  /** Somma richiesta per articolo: due righe sullo stesso tessuto pesano insieme. */
  const richiestoPerArticolo = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of righe) {
      if (!r.articoloId) continue
      const chiave = `${r.articoloId}:${r.provenienza ?? 'magazzino'}`
      m.set(chiave, (m.get(chiave) ?? 0) + (r.quantita || 0))
    }
    return m
  }, [righe])

  const aggiornaRiga = (chiave: string, patch: Partial<RigaForm>) =>
    setRighe((prev) => prev.map((r) => (r.chiave === chiave ? { ...r, ...patch } : r)))

  const { errori, inCorso, submit, pulisci } = useFormSubmit<'lavorante' | 'righe'>(
    () => ({
      lavorante: supplierId ? undefined : 'Scegli il lavorante a cui consegni.',
      righe: validaRighe(righe, perId),
    }),
    async () => {
      await onSubmit({
        supplierId,
        data,
        causale,
        productId: productId || undefined,
        commessa: commessa.trim() || undefined,
        quantitaAttesa: quantitaAttesa.trim() ? Number(quantitaAttesa) : undefined,
        note: note.trim() || undefined,
        righe: righe
          .filter((r) => r.articoloId && r.quantita > 0)
          .map(({ chiave: _chiave, ...r }) => ({ ...r, lotto: r.lotto?.trim() || undefined, note: r.note?.trim() || undefined })),
      })
      onClose()
    },
  )

  return (
    <Modal
      title="Nuova bolla di uscita"
      subtitle="Si salva come bozza: le giacenze non si muovono finché non la emetti."
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lavorante / terzista" required error={errori.lavorante}>
          <select
            className={campoClass(errori.lavorante)}
            value={supplierId}
            onChange={(e) => { setSupplierId(e.target.value); pulisci('lavorante') }}
          >
            <option value="">Scegli…</option>
            {fornitoriOrdinati.lavoranti.length > 0 && (
              <optgroup label="Lavoranti">
                {fornitoriOrdinati.lavoranti.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome} · {s.categoria}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="Altri fornitori">
              {fornitoriOrdinati.altri.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </optgroup>
          </select>
        </Field>

        <Field label="Data del documento" required>
          <input type="date" className={fieldClass} value={data} onChange={(e) => setData(e.target.value)} />
        </Field>

        <Field label="Causale">
          <select className={fieldClass} value={causale} onChange={(e) => setCausale(e.target.value as CausaleBolla)}>
            {CAUSALI.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Capo da realizzare" hint="Collega la bolla al prodotto e alla sua scheda tecnica.">
          <select className={fieldClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Nessuno</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.nome} ({p.codiceProdotto})</option>
            ))}
          </select>
        </Field>

        <Field label="Commessa / ordine di lavorazione">
          <input className={fieldClass} value={commessa} onChange={(e) => setCommessa(e.target.value)} placeholder="Es. LAV-2026-14" />
        </Field>

        <Field label="Capi finiti attesi" hint="Serve a confrontare l'atteso col rientrato.">
          <input type="number" min="0" className={fieldClass} value={quantitaAttesa} onChange={(e) => setQuantitaAttesa(e.target.value)} />
        </Field>
      </div>

      <div className="mt-5 border-t border-heemia-border pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
            Materiali consegnati
          </p>
          <Button
            variant="secondary"
            onClick={() => setRighe((p) => [...p, {
              chiave: nuovaChiave(), tipo: 'materiale', articoloId: '', quantita: 0, provenienza: 'magazzino',
            }])}
          >
            <Plus className="mr-1 inline h-3 w-3" />
            Aggiungi riga
          </Button>
        </div>

        {errori.righe && (
          <p role="alert" className="mb-2 animate-fade-in text-[11px] text-heemia-carmine">{errori.righe}</p>
        )}

        {caricamentoArticoli ? (
          <p className="py-4 text-xs text-heemia-grey">Carico l'inventario…</p>
        ) : (
          <div className="space-y-3">
            {righe.map((r) => {
              const scelto = r.articoloId ? perId.get(r.articoloId) : undefined
              const provenienza = r.provenienza ?? 'magazzino'
              const chiaveDisponibilita = r.articoloId ? `${r.articoloId}:${provenienza}` : ''
              const richiesto = chiaveDisponibilita ? richiestoPerArticolo.get(chiaveDisponibilita) ?? 0 : 0
              const disponibileScelto = scelto ? (provenienza === 'scampoli' ? scelto.scampoli : scelto.disponibile) : 0
              const eccede = Boolean(scelto) && richiesto > disponibileScelto
              return (
                <div key={r.chiave} className="rounded-heemia border border-heemia-border bg-heemia-surface p-3">
                  <div className="grid gap-2 sm:grid-cols-[7rem_1fr_8rem_6rem_auto]">
                    <select
                      className={fieldClass}
                      value={r.tipo}
                      onChange={(e) => aggiornaRiga(r.chiave, {
                        tipo: e.target.value as NuovaRigaInput['tipo'], articoloId: '', provenienza: 'magazzino',
                      })}
                    >
                      <option value="materiale">Tessuto</option>
                      <option value="accessorio">Accessorio</option>
                      <option value="variante">Semilavorato</option>
                    </select>

                    <select
                      className={eccede ? campoClass('x') : fieldClass}
                      value={r.articoloId}
                      onChange={(e) => {
                        aggiornaRiga(r.chiave, { articoloId: e.target.value, provenienza: 'magazzino' })
                        pulisci('righe')
                      }}
                    >
                      <option value="">Scegli l'articolo…</option>
                      {articoliPerTipo[r.tipo].map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.descrizione} — {a.disponibile} {a.unitaMisura} integri
                          {a.scampoli > 0 ? ` · ${a.scampoli} recuperati` : ''}
                        </option>
                      ))}
                    </select>

                    <select
                      className={fieldClass}
                      value={provenienza}
                      onChange={(e) => {
                        aggiornaRiga(r.chiave, { provenienza: e.target.value as NuovaRigaInput['provenienza'] })
                        pulisci('righe')
                      }}
                    >
                      <option value="magazzino">Materiale integro</option>
                      <option value="scampoli" disabled={!scelto || scelto.scampoli <= 0}>
                        Scampoli / recuperi
                      </option>
                    </select>

                    <input
                      type="number"
                      min="0"
                      step="any"
                      className={eccede ? campoClass('x') : fieldClass}
                      value={r.quantita || ''}
                      placeholder="Qtà"
                      onChange={(e) => { aggiornaRiga(r.chiave, { quantita: Number(e.target.value) }); pulisci('righe') }}
                    />

                    <button
                      type="button"
                      aria-label="Togli la riga"
                      onClick={() => setRighe((p) => (p.length === 1 ? p : p.filter((x) => x.chiave !== r.chiave)))}
                      disabled={righe.length === 1}
                      className="rounded-heemia-sm px-2 text-heemia-grey transition-colors hover:text-heemia-carmine disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {scelto && (
                    <p className={`mt-1.5 text-[11px] ${eccede ? 'text-heemia-carmine' : 'text-heemia-grey-light'}`}>
                      {eccede
                        ? `Ne stai consegnando ${richiesto} ${scelto.unitaMisura} ma nella riserva scelta ce ne sono ${disponibileScelto}.`
                        : `${provenienza === 'scampoli' ? 'Scampoli / recuperi' : 'Materiale integro'} disponibili ${disponibileScelto} ${scelto.unitaMisura} · patrimonio ${scelto.patrimonio}` +
                          (scelto.scampoli > 0 ? ` · scampoli totali ${scelto.scampoli}` : '') +
                          (scelto.pressoTerzisti > 0 ? ` · ${scelto.pressoTerzisti} già presso un lavorante` : '')}
                    </p>
                  )}

                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input className={fieldClass} placeholder="Lotto" value={r.lotto ?? ''} onChange={(e) => aggiornaRiga(r.chiave, { lotto: e.target.value })} />
                    <input className={fieldClass} placeholder="Colore / variante" value={r.colore ?? ''} onChange={(e) => aggiornaRiga(r.chiave, { colore: e.target.value })} />
                    <input className={fieldClass} placeholder="Nota di riga" value={r.note ?? ''} onChange={(e) => aggiornaRiga(r.chiave, { note: e.target.value })} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-4">
        <Field label="Note della bolla">
          <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Annulla</Button>
        <Button onClick={() => void submit()} disabled={inCorso}>
          {inCorso ? 'Salvataggio…' : 'Salva come bozza'}
        </Button>
      </FormActions>
    </Modal>
  )
}

/**
 * Validazione delle righe. Il controllo di disponibilità è **sul totale per articolo**, non
 * riga per riga: due righe da 30 m sullo stesso tessuto che ne ha 50 sono valide da sole e
 * sbagliate insieme. Il server rifà lo stesso controllo — questo serve a dirlo prima.
 */
function validaRighe(righe: RigaForm[], perId: Map<string, ArticoloDisponibile>): string | undefined {
  const compilate = righe.filter((r) => r.articoloId)
  if (compilate.length === 0) return 'Aggiungi almeno un materiale da consegnare.'
  if (compilate.some((r) => !(r.quantita > 0))) return 'Ogni riga deve avere una quantità maggiore di zero.'

  const totali = new Map<string, number>()
  for (const r of compilate) {
    const chiave = `${r.articoloId}:${r.provenienza ?? 'magazzino'}`
    totali.set(chiave, (totali.get(chiave) ?? 0) + r.quantita)
  }

  for (const [chiave, richiesto] of totali) {
    const [id, provenienza] = chiave.split(':') as [string, 'magazzino' | 'scampoli']
    const a = perId.get(id)
    if (!a) continue
    const disponibile = provenienza === 'scampoli' ? a.scampoli : a.disponibile
    if (richiesto > disponibile) {
      return `"${a.descrizione}": ne stai consegnando ${richiesto} ${a.unitaMisura} dalla riserva ${provenienza}, ma ne sono disponibili ${disponibile}.`
    }
    if (a.tipo === 'variante' && !Number.isInteger(richiesto)) return 'I semilavorati si consegnano a pezzi interi.'
  }
  return undefined
}
