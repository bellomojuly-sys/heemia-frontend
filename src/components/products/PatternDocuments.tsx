import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Trash2, Upload } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Field, fieldClass } from '../ui/Modal'
import { formatDateIt } from '../../lib/format'
import { ApiError } from '../../lib/api'
import { useDataStore } from '../../context/DataStore'
import type {
  PatternDocument, PatternDocumentNoteTipo, PatternDocumentStato, PatternDocumentTipo,
} from '../../types'

const TIPO_LABEL: Record<PatternDocumentTipo, string> = {
  cartamodello: 'Cartamodello',
  scheda_misure: 'Scheda misure',
  revisione_modellista: 'Revisione modellista',
  piazzamento: 'Piazzamento',
  documento_taglio: 'Documento per il taglio',
  altro: 'Altra documentazione',
}

const STATO_LABEL: Record<PatternDocumentStato, string> = {
  in_attesa: 'In attesa',
  approvato: 'Approvato',
  rifiutato: 'Rifiutato',
  richiede_revisione: 'Richiede revisione',
}

const NOTA_LABEL: Record<PatternDocumentNoteTipo, string> = {
  commento: 'Commento',
  correzione: 'Correzione richiesta',
  problema: 'Problema riscontrato',
  modifica_misure: 'Modifica alle misure',
  indicazione_taglio: 'Indicazione per il taglio',
  approvazione: 'Approvazione',
  richiesta_nuova_versione: 'Richiesta nuova versione',
}

const MAX_BYTES = 10 * 1024 * 1024

/**
 * Documenti ricevuti dalle modelliste (backlog "Note" §4).
 * Ogni caricamento è una versione a sé: le precedenti non vengono mai sovrascritte.
 */
export function PatternDocuments({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  const {
    loadPatternDocuments, addPatternDocument, setPatternDocumentStato,
    removePatternDocument, addPatternDocumentNote,
  } = useDataStore()

  const [documenti, setDocumenti] = useState<PatternDocument[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [form, setForm] = useState<{ tipologia: PatternDocumentTipo; versione: string; autore: string }>({
    tipologia: 'cartamodello',
    versione: 'V1',
    autore: '',
  })
  const fileRef = useRef<HTMLInputElement>(null)

  const ricarica = useCallback(async () => {
    try {
      setDocumenti(await loadPatternDocuments(productId))
      setErrore('')
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Documenti non caricati.')
    } finally {
      setCaricamento(false)
    }
  }, [loadPatternDocuments, productId])

  useEffect(() => {
    void ricarica()
  }, [ricarica])

  const carica = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setErrore(`Il file pesa ${Math.round(file.size / 1024 / 1024)} MB: il limite è 10 MB.`)
      return
    }
    setErrore('')
    const dataUrl = await new Promise<string>((risolvi, rifiuta) => {
      const reader = new FileReader()
      reader.onload = () => risolvi(String(reader.result))
      reader.onerror = () => rifiuta(reader.error)
      reader.readAsDataURL(file)
    })
    try {
      await addPatternDocument(productId, {
        fileName: file.name,
        dataUrl,
        tipologia: form.tipologia,
        versione: form.versione.trim() || 'V1',
        autore: form.autore.trim() || undefined,
      })
      await ricarica()
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Caricamento non riuscito.')
    }
  }

  const cambiaStato = async (id: string, stato: PatternDocumentStato) => {
    try {
      await setPatternDocumentStato(id, stato)
      await ricarica()
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Stato non aggiornato.')
    }
  }

  const elimina = async (id: string) => {
    try {
      await removePatternDocument(id)
      await ricarica()
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Documento non eliminato.')
    }
  }

  if (caricamento) return <p className="text-sm text-heemia-grey">Caricamento documenti…</p>

  return (
    <div>
      <p className="mb-4 text-sm text-heemia-grey">
        Cartamodelli, piazzamenti, schede misure e revisioni ricevuti dalle modelliste.
        Ogni caricamento è una versione a sé: le precedenti restano consultabili.
      </p>

      {errore && <p className="mb-3 text-[12px] text-heemia-carmine">{errore}</p>}

      {canEdit && (
        <div className="mb-5 rounded-heemia border border-heemia-border bg-heemia-surface p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Tipologia">
              <select
                className={fieldClass}
                value={form.tipologia}
                onChange={(e) => setForm({ ...form, tipologia: e.target.value as PatternDocumentTipo })}
              >
                {Object.entries(TIPO_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Versione">
              <input
                className={fieldClass}
                value={form.versione}
                onChange={(e) => setForm({ ...form, versione: e.target.value })}
                placeholder="V1, V2, finale…"
              />
            </Field>
            <Field label="Modellista / autore">
              <input
                className={fieldClass}
                value={form.autore}
                onChange={(e) => setForm({ ...form, autore: e.target.value })}
                placeholder="Nome"
              />
            </Field>
            <div className="flex items-end">
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                <span className="inline-flex items-center gap-1.5">
                  <Upload aria-hidden className="h-3.5 w-3.5" /> Carica PDF
                </span>
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void carica(file)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {documenti.length === 0 ? (
        <p className="text-sm text-heemia-grey">Nessun documento ricevuto dalle modelliste.</p>
      ) : (
        <div className="space-y-3">
          {documenti.map((d) => (
            <DocumentoCard
              key={d.id}
              documento={d}
              canEdit={canEdit}
              onStato={(stato) => void cambiaStato(d.id, stato)}
              onElimina={() => void elimina(d.id)}
              onNota={async (testo, tipo) => {
                await addPatternDocumentNote(d.id, testo, tipo)
                await ricarica()
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DocumentoCard({
  documento,
  canEdit,
  onStato,
  onElimina,
  onNota,
}: {
  documento: PatternDocument
  canEdit: boolean
  onStato: (stato: PatternDocumentStato) => void
  onElimina: () => void
  onNota: (testo: string, tipo: PatternDocumentNoteTipo) => Promise<void>
}) {
  const [nota, setNota] = useState('')
  const [tipoNota, setTipoNota] = useState<PatternDocumentNoteTipo>('commento')
  const [inCorso, setInCorso] = useState(false)

  const salvaNota = async () => {
    if (!nota.trim() || inCorso) return
    setInCorso(true)
    try {
      await onNota(nota.trim(), tipoNota)
      setNota('')
    } finally {
      setInCorso(false)
    }
  }

  const badgeStato =
    documento.statoApprovazione === 'approvato'
      ? 'success'
      : documento.statoApprovazione === 'rifiutato'
        ? 'critical'
        : documento.statoApprovazione === 'richiede_revisione'
          ? 'warning-outline'
          : 'info'

  return (
    <div className="rounded-heemia-lg border border-heemia-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{documento.versione}</Badge>
            <Badge variant="neutral">{TIPO_LABEL[documento.tipologia]}</Badge>
            <Badge variant={badgeStato}>{STATO_LABEL[documento.statoApprovazione]}</Badge>
          </div>
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-heemia-black">
            <FileText aria-hidden className="h-3.5 w-3.5 text-heemia-grey" />
            <a href={documento.dataUrl} download={documento.fileName} className="underline">
              {documento.fileName}
            </a>
          </p>
          <p className="text-[11px] text-heemia-grey">
            Caricato il {formatDateIt(documento.createdAt)}
            {documento.autore ? ` · ${documento.autore}` : ''}
            {documento.caricatoDa ? ` · da ${documento.caricatoDa}` : ''}
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <select
              className={fieldClass}
              value={documento.statoApprovazione}
              onChange={(e) => onStato(e.target.value as PatternDocumentStato)}
              aria-label="Stato di approvazione"
            >
              {Object.entries(STATO_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button
              type="button"
              title="Elimina documento"
              aria-label="Elimina documento"
              onClick={onElimina}
              className="rounded-heemia-sm border border-heemia-border p-1.5 text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-carmine hover:text-heemia-carmine"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {documento.note.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-heemia-border pt-3">
          {documento.note.map((n) => (
            <li key={n.id} className="text-sm">
              <span className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                {NOTA_LABEL[n.tipo]}
              </span>
              <p className="text-heemia-black">{n.testo}</p>
              <p className="text-[11px] text-heemia-grey-light">
                {formatDateIt(n.createdAt)}
                {n.autore ? ` · ${n.autore}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-heemia-border pt-3">
          <select
            className={`${fieldClass} w-auto`}
            value={tipoNota}
            onChange={(e) => setTipoNota(e.target.value as PatternDocumentNoteTipo)}
            aria-label="Tipo di nota"
          >
            {Object.entries(NOTA_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            className={`${fieldClass} flex-1`}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Aggiungi una nota per il team"
            aria-label="Testo della nota"
          />
          <Button variant="secondary" onClick={() => void salvaNota()} disabled={inCorso || !nota.trim()}>
            {inCorso ? 'Salvataggio…' : 'Aggiungi nota'}
          </Button>
        </div>
      )}
    </div>
  )
}
