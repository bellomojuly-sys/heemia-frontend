import { useMemo, useState } from 'react'
import { Paperclip, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Modal, Field, FormActions, campoClass, fieldClass } from '../ui/Modal'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { useMockStore } from '../../context/MockStore'
import { analizzaDdtRientro } from '../../hooks/useServerLavorazioni'
import type { DdtRientroMime, PropostaDdtRientro, RientroInput } from '../../hooks/useServerLavorazioni'
import type { BollaLavorazione } from '../../types'

// Registrazione del rientro dal lavorante.
//
// Per ogni materiale consegnato bisogna dire **dove è finito**, e le tre destinazioni non
// sono intercambiabili:
//   utilizzato  → è dentro il capo: esce dal patrimonio
//   restituito  → torna in magazzino: resta nostro e ridiventa disponibile
//   recuperato  → torna nella riserva scampoli: resta nostro, ma separato dal materiale integro
//   perso       → rovinato o mancante: esce dal patrimonio e ha un costo distinto
// Quello che non si assegna resta presso il lavorante, e la bolla resta aperta. È voluto:
// un rientro parziale è la norma, non un'eccezione da forzare.

interface RigaForm {
  utilizzata: string
  restituita: string
  scartoRecuperato: string
  scartoPerso: string
  note: string
}

interface CapoForm {
  chiave: string
  variantId: string
  quantita: string
}

const vuota = (): RigaForm => ({
  utilizzata: '', restituita: '', scartoRecuperato: '', scartoPerso: '', note: '',
})
const n = (v: string) => (v.trim() ? Number(v) : 0)
const nuovaChiave = () => `c${Math.random().toString(36).slice(2, 9)}`
const arrotonda = (v: number) => Math.round(v * 1e4) / 1e4
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
const MIME_DDT = new Set<DdtRientroMime>([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif',
])

function mimeDocumento(file: File): DdtRientroMime | null {
  if (file.type === 'image/jpg') return 'image/jpeg'
  if (MIME_DDT.has(file.type as DdtRientroMime)) return file.type as DdtRientroMime
  if (!file.type && file.name.toLowerCase().endsWith('.pdf')) return 'application/pdf'
  return null
}

const numeroProposto = (v: number | null) => (v && v > 0 ? String(v) : '')

export function RientroModal({
  bolla,
  onClose,
  onSubmit,
}: {
  bolla: BollaLavorazione
  onClose: () => void
  onSubmit: (input: RientroInput) => Promise<unknown>
}) {
  const { productVariants } = useMockStore()

  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [numeroDoc, setNumeroDoc] = useState('')
  const [note, setNote] = useState('')
  const [allegato, setAllegato] = useState<{
    nome: string
    dataUrl: string
    mimeType: DdtRientroMime
  } | null>(null)
  const [scanInCorso, setScanInCorso] = useState(false)
  const [scanErrore, setScanErrore] = useState('')
  const [propostaAi, setPropostaAi] = useState<PropostaDdtRientro | null>(null)
  const [righe, setRighe] = useState<Record<string, RigaForm>>(() =>
    Object.fromEntries(bolla.righe.map((r) => [r.id, vuota()])),
  )
  const [capi, setCapi] = useState<CapoForm[]>([])

  // Le varianti del capo collegato stanno in cima: sono quelle che si ricevono davvero.
  const variantiOrdinate = useMemo(() => {
    if (!bolla.prodotto) return productVariants
    const proprie = productVariants.filter((v) => v.productId === bolla.prodotto!.id)
    const altre = productVariants.filter((v) => v.productId !== bolla.prodotto!.id)
    return [...proprie, ...altre]
  }, [productVariants, bolla.prodotto])

  const aperte = bolla.righe.filter((r) => r.quantitaPressoLavorante > 0)
  const righeAiAbbinate = propostaAi?.righe.filter((r) => r.rigaId).length ?? 0
  const capiAiAbbinati = propostaAi?.capi.filter((c) => c.variantId && c.quantita).length ?? 0
  const elementiAiNonAbbinati = propostaAi
    ? [
        ...propostaAi.righe.filter((r) => !r.rigaId).map((r) => r.descrizioneDocumento),
        ...propostaAi.capi.filter((c) => !c.variantId).map((c) => c.descrizioneDocumento),
      ].filter(Boolean)
    : []

  const aggiorna = (id: string, patch: Partial<RigaForm>) =>
    setRighe((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  /** "Tutto usato": la scorciatoia del caso più comune — il lavorante ha consumato tutto. */
  const tuttoUtilizzato = () =>
    setRighe((prev) =>
      Object.fromEntries(
        bolla.righe.map((r) => [
          r.id,
          r.quantitaPressoLavorante > 0
            ? { ...prev[r.id], utilizzata: String(r.quantitaPressoLavorante) }
            : prev[r.id],
        ]),
      ),
    )

  const { errori, inCorso, submit, pulisci } = useFormSubmit<'righe' | 'capi'>(
    () => ({ righe: validaRighe(bolla, righe), capi: validaCapi(capi) }),
    async () => {
      await onSubmit({
        data,
        numeroDocumentoLavorante: numeroDoc.trim() || undefined,
        note: note.trim() || undefined,
        allegato: allegato ? { nome: allegato.nome, dataUrl: allegato.dataUrl } : undefined,
        righe: bolla.righe
          .filter((r) =>
            n(righe[r.id].utilizzata) + n(righe[r.id].restituita) +
            n(righe[r.id].scartoRecuperato) + n(righe[r.id].scartoPerso) > 0,
          )
          .map((r) => ({
            rigaId: r.id,
            utilizzata: n(righe[r.id].utilizzata) || undefined,
            restituita: n(righe[r.id].restituita) || undefined,
            scartoRecuperato: n(righe[r.id].scartoRecuperato) || undefined,
            scartoPerso: n(righe[r.id].scartoPerso) || undefined,
            note: righe[r.id].note.trim() || undefined,
          })),
        capi: capi
          .filter((c) => c.variantId && n(c.quantita) > 0)
          .map((c) => ({ variantId: c.variantId, quantita: n(c.quantita) })),
      })
      onClose()
    },
  )

  async function scegliFile(file: File) {
    setScanErrore('')
    setPropostaAi(null)
    if (file.size > MAX_DOCUMENT_BYTES) {
      setAllegato(null)
      setScanErrore(`Il documento supera 20 MB (${Math.ceil(file.size / 1024 / 1024)} MB).`)
      return
    }
    const mimeType = mimeDocumento(file)
    if (!mimeType) {
      setAllegato(null)
      setScanErrore('Formato non supportato. Usa PDF, PNG, JPG, WEBP o GIF.')
      return
    }
    try {
      const dataUrl = await new Promise<string>((risolvi, rifiuta) => {
        const lettore = new FileReader()
        lettore.onload = () => risolvi(String(lettore.result))
        lettore.onerror = () => rifiuta(lettore.error)
        lettore.readAsDataURL(file)
      })
      setAllegato({ nome: file.name, dataUrl, mimeType })
    } catch {
      setAllegato(null)
      setScanErrore('Non riesco a leggere il documento selezionato. Scegline un altro.')
    }
  }

  function applicaProposta(proposta: PropostaDdtRientro) {
    if (proposta.data) setData(proposta.data)
    if (proposta.numeroDocumentoLavorante) setNumeroDoc(proposta.numeroDocumentoLavorante)

    const perRiga = new Map<string, {
      utilizzata: number
      restituita: number
      scartoRecuperato: number
      scartoPerso: number
      note: string[]
    }>()
    for (const r of proposta.righe) {
      if (!r.rigaId) continue
      const corrente = perRiga.get(r.rigaId) ?? {
        utilizzata: 0, restituita: 0, scartoRecuperato: 0, scartoPerso: 0, note: [],
      }
      corrente.utilizzata += r.utilizzata ?? 0
      corrente.restituita += r.restituita ?? 0
      corrente.scartoRecuperato += r.scartoRecuperato ?? 0
      corrente.scartoPerso += r.scartoPerso ?? 0
      if (r.note) corrente.note.push(r.note)
      perRiga.set(r.rigaId, corrente)
    }
    setRighe((precedenti) => {
      const prossime = { ...precedenti }
      for (const [rigaId, propostaRiga] of perRiga) {
        const corrente = precedenti[rigaId]
        if (!corrente) continue
        prossime[rigaId] = {
          utilizzata: corrente.utilizzata || numeroProposto(propostaRiga.utilizzata),
          restituita: corrente.restituita || numeroProposto(propostaRiga.restituita),
          scartoRecuperato: corrente.scartoRecuperato || numeroProposto(propostaRiga.scartoRecuperato),
          scartoPerso: corrente.scartoPerso || numeroProposto(propostaRiga.scartoPerso),
          note: corrente.note || propostaRiga.note.join(' · '),
        }
      }
      return prossime
    })

    const capiProposti = new Map<string, number>()
    for (const c of proposta.capi) {
      if (c.variantId && c.quantita && c.quantita > 0) {
        capiProposti.set(c.variantId, (capiProposti.get(c.variantId) ?? 0) + c.quantita)
      }
    }
    setCapi((precedenti) => {
      const giaPresenti = new Set(precedenti.map((c) => c.variantId).filter(Boolean))
      const nuovi = [...capiProposti]
        .filter(([variantId]) => !giaPresenti.has(variantId))
        .map(([variantId, quantita]) => ({
          chiave: nuovaChiave(), variantId, quantita: String(quantita),
        }))
      return [...precedenti, ...nuovi]
    })
  }

  async function leggiConAi() {
    if (!allegato || scanInCorso) return
    setScanInCorso(true)
    setScanErrore('')
    try {
      const { proposta } = await analizzaDdtRientro(bolla.id, allegato)
      applicaProposta(proposta)
      setPropostaAi(proposta)
    } catch (e) {
      setPropostaAi(null)
      setScanErrore(e instanceof Error ? e.message : 'Documento non letto. Compila il rientro a mano.')
    } finally {
      setScanInCorso(false)
    }
  }

  return (
    <Modal
      title="Registra il rientro"
      subtitle={`${bolla.etichetta} · ${bolla.lavoranteNome ?? bolla.lavorante.nome}`}
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Data del rientro" required>
          <input type="date" className={fieldClass} value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="N° DDT del lavorante" hint="Come sta scritto sul suo documento.">
          <input className={fieldClass} value={numeroDoc} onChange={(e) => setNumeroDoc(e.target.value)} />
        </Field>
        <Field label="Documento ricevuto">
          <label className="flex cursor-pointer items-center gap-2 rounded-heemia-sm border border-heemia-border bg-white px-3 py-1.5 text-sm text-heemia-grey transition-colors hover:border-heemia-border-strong">
            <Paperclip className="h-3.5 w-3.5" />
            <span className="truncate">{allegato ? allegato.nome : 'Allega scansione…'}</span>
            <input
              type="file"
              className="hidden"
              accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void scegliFile(f) }}
            />
          </label>
        </Field>
      </div>

      {allegato && (
        <div className="mt-3 rounded-heemia border border-heemia-border bg-heemia-surface px-3 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm text-heemia-black">{allegato.nome}</p>
              <p className="mt-0.5 text-[11px] text-heemia-grey">
                L’AI compila una proposta modificabile. Il magazzino resta invariato fino alla conferma finale.
              </p>
            </div>
            <Button variant="secondary" onClick={() => void leggiConAi()} disabled={scanInCorso || inCorso}>
              <Sparkles className="mr-1 inline h-3.5 w-3.5" />
              {scanInCorso ? 'Lettura in corso…' : propostaAi ? 'Rileggi con AI' : 'Leggi DDT con AI'}
            </Button>
          </div>
        </div>
      )}

      {scanErrore && (
        <p role="alert" className="mt-3 rounded-heemia border border-heemia-carmine/30 bg-heemia-carmine-light px-3 py-2 text-xs text-heemia-carmine">
          {scanErrore} Nessuna giacenza è stata modificata.
        </p>
      )}

      {propostaAi && (
        <div className="mt-3 rounded-heemia border border-heemia-border-strong bg-white px-3 py-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-heemia-black">Proposta AI applicata ai campi</p>
            <Badge
              variant={
                propostaAi.affidabilita === 'alta'
                  ? 'success'
                  : propostaAi.affidabilita === 'media'
                    ? 'warning'
                    : 'critical'
              }
            >
              Affidabilità {propostaAi.affidabilita}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-heemia-grey">{propostaAi.note}</p>
          <p className="mt-2 font-mono-heemia text-[11px] text-heemia-grey">
            {righeAiAbbinate} righe materiali abbinate · {capiAiAbbinati} varianti capi abbinate
          </p>
          {elementiAiNonAbbinati.length > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-heemia-orange">
              Da associare a mano: {elementiAiNonAbbinati.join(' · ')}
            </p>
          )}
          <p className="mt-2 text-[11px] font-medium text-heemia-black">
            Controlla quantità, taglie e destinazioni. Solo “Registra il rientro” aggiorna il magazzino.
          </p>
        </div>
      )}

      <div className="mt-5 border-t border-heemia-border pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
            Materiali · cosa ne è stato
          </p>
          {aperte.length > 0 && (
            <Button variant="secondary" onClick={tuttoUtilizzato}>Tutto utilizzato</Button>
          )}
        </div>

        {errori.righe && (
          <p role="alert" className="mb-2 animate-fade-in text-[11px] text-heemia-carmine">{errori.righe}</p>
        )}

        {aperte.length === 0 ? (
          <p className="rounded-heemia border border-dashed border-heemia-border-strong bg-heemia-surface px-4 py-6 text-center text-xs text-heemia-grey">
            Tutti i materiali di questa bolla sono già rientrati. Puoi comunque registrare i capi finiti ricevuti.
          </p>
        ) : (
          <div className="space-y-3">
            {aperte.map((r) => {
              const f = righe[r.id]
              const assegnato =
                n(f.utilizzata) + n(f.restituita) + n(f.scartoRecuperato) + n(f.scartoPerso)
              const resta = arrotonda(r.quantitaPressoLavorante - assegnato)
              const eccede = resta < 0
              return (
                <div key={r.id} className="rounded-heemia border border-heemia-border bg-heemia-surface p-3">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm text-heemia-black">
                      {r.descrizione}
                      {r.lotto && <span className="ml-2 text-xs text-heemia-grey">lotto {r.lotto}</span>}
                    </p>
                    <p className="font-mono-heemia text-[11px] text-heemia-grey">
                      dal lavorante: {r.quantitaPressoLavorante} {r.unitaMisura}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Utilizzata">
                      <input
                        type="number" min="0" step="any" className={eccede ? campoClass('x') : fieldClass}
                        value={f.utilizzata}
                        onChange={(e) => { aggiorna(r.id, { utilizzata: e.target.value }); pulisci('righe') }}
                      />
                    </Field>
                    <Field label="Restituita">
                      <input
                        type="number" min="0" step="any" className={eccede ? campoClass('x') : fieldClass}
                        value={f.restituita}
                        onChange={(e) => { aggiorna(r.id, { restituita: e.target.value }); pulisci('righe') }}
                      />
                    </Field>
                    <Field label="Scampolo recuperato" hint="Rientra separato dal materiale integro.">
                      <input
                        type="number" min="0" step="any" className={eccede ? campoClass('x') : fieldClass}
                        value={f.scartoRecuperato}
                        onChange={(e) => { aggiorna(r.id, { scartoRecuperato: e.target.value }); pulisci('righe') }}
                      />
                    </Field>
                    <Field label="Scarto perso" hint="Esce dal patrimonio ed è valorizzato a parte.">
                      <input
                        type="number" min="0" step="any" className={eccede ? campoClass('x') : fieldClass}
                        value={f.scartoPerso}
                        onChange={(e) => { aggiorna(r.id, { scartoPerso: e.target.value }); pulisci('righe') }}
                      />
                    </Field>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <input
                      className={`${fieldClass} max-w-xs`}
                      placeholder="Nota / differenza riscontrata"
                      value={f.note}
                      onChange={(e) => aggiorna(r.id, { note: e.target.value })}
                    />
                    <p className={`font-mono-heemia text-[11px] ${eccede ? 'text-heemia-carmine' : 'text-heemia-grey-light'}`}>
                      {eccede
                        ? `${Math.abs(resta)} ${r.unitaMisura} di troppo`
                        : resta > 0
                          ? `resta dal lavorante: ${resta} ${r.unitaMisura}`
                          : 'riga riconciliata'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-heemia-border pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
            Capi finiti ricevuti
            {bolla.quantitaAttesa > 0 && (
              <span className="ml-2 normal-case tracking-normal text-heemia-grey-light">
                attesi {bolla.quantitaAttesa} · già rientrati {bolla.capiRientrati}
              </span>
            )}
          </p>
          <Button
            variant="secondary"
            onClick={() => setCapi((p) => [...p, { chiave: nuovaChiave(), variantId: '', quantita: '' }])}
          >
            <Plus className="mr-1 inline h-3 w-3" />
            Aggiungi capo
          </Button>
        </div>

        {errori.capi && (
          <p role="alert" className="mb-2 animate-fade-in text-[11px] text-heemia-carmine">{errori.capi}</p>
        )}

        {capi.length === 0 ? (
          <p className="text-xs text-heemia-grey-light">
            Nessun capo in questo rientro. I capi aggiunti qui entrano nell'inventario prodotti finiti.
          </p>
        ) : (
          <div className="space-y-2">
            {capi.map((c) => (
              <div key={c.chiave} className="grid gap-2 sm:grid-cols-[1fr_6rem_auto]">
                <select
                  className={fieldClass}
                  value={c.variantId}
                  onChange={(e) => { setCapi((p) => p.map((x) => (x.chiave === c.chiave ? { ...x, variantId: e.target.value } : x))); pulisci('capi') }}
                >
                  <option value="">Scegli taglia e colore…</option>
                  {variantiOrdinate.map((v) => (
                    <option key={v.id} value={v.id}>{v.sku} · {v.taglia}/{v.colore}</option>
                  ))}
                </select>
                <input
                  type="number" min="1" step="1" className={fieldClass} placeholder="Pezzi"
                  value={c.quantita}
                  onChange={(e) => { setCapi((p) => p.map((x) => (x.chiave === c.chiave ? { ...x, quantita: e.target.value } : x))); pulisci('capi') }}
                />
                <button
                  type="button"
                  aria-label="Togli il capo"
                  onClick={() => setCapi((p) => p.filter((x) => x.chiave !== c.chiave))}
                  className="rounded-heemia-sm px-2 text-heemia-grey transition-colors hover:text-heemia-carmine"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <Field label="Note del rientro">
          <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso || scanInCorso}>Annulla</Button>
        <Button onClick={() => void submit()} disabled={inCorso || scanInCorso}>
          {inCorso ? 'Registrazione…' : scanInCorso ? 'Attendi la lettura…' : 'Registra il rientro'}
        </Button>
      </FormActions>
    </Modal>
  )
}

function validaRighe(bolla: BollaLavorazione, righe: Record<string, RigaForm>): string | undefined {
  let qualcosa = false
  for (const r of bolla.righe) {
    const f = righe[r.id]
    if (!f) continue
    const valori = [f.utilizzata, f.restituita, f.scartoRecuperato, f.scartoPerso]
    if (valori.some((v) => v.trim() && (Number.isNaN(Number(v)) || Number(v) < 0))) {
      return 'Le quantità devono essere numeri non negativi.'
    }
    const totale = n(f.utilizzata) + n(f.restituita) + n(f.scartoRecuperato) + n(f.scartoPerso)
    if (totale === 0) continue
    qualcosa = true
    if (totale > r.quantitaPressoLavorante + 1e-9) {
      return `"${r.descrizione}": dal lavorante ci sono ${r.quantitaPressoLavorante} ${r.unitaMisura}, non se ne possono registrare ${arrotonda(totale)}.`
    }
    if (r.unitaMisura === 'pz' && valori.some((v) => v.trim() && !Number.isInteger(Number(v)))) {
      return `"${r.descrizione}": i capi si contano a pezzi interi.`
    }
  }
  return qualcosa ? undefined : undefined
}

function validaCapi(capi: CapoForm[]): string | undefined {
  const compilati = capi.filter((c) => c.variantId || c.quantita.trim())
  if (compilati.some((c) => !c.variantId)) return 'Scegli taglia e colore per ogni capo rientrato.'
  if (compilati.some((c) => !(n(c.quantita) > 0) || !Number.isInteger(n(c.quantita)))) {
    return 'I capi rientrati si contano a pezzi interi maggiori di zero.'
  }
  const visti = new Set<string>()
  for (const c of compilati) {
    if (visti.has(c.variantId)) return 'Hai indicato due volte la stessa taglia/colore: unisci le quantità in una riga sola.'
    visti.add(c.variantId)
  }
  return undefined
}
