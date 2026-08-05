import { useCallback, useEffect, useState } from 'react'
import { Modal, fieldClass } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { ApiError } from '../../lib/api'
import { useMockStore } from '../../context/MockStore'
import type { LabDetail, Lavorazione, StockMovement } from '../../types'

/**
 * Dettaglio del laboratorio per una variante (backlog scorte).
 *
 * Distingue tre numeri che è facile confondere:
 *  - quanto c'è fisicamente in laboratorio;
 *  - quanto è già stato mandato in produzione;
 *  - quanto resta davvero utilizzabile.
 */
export function LabDetailModal({
  variantId,
  descrizione,
  canEdit,
  onClose,
}: {
  variantId: string
  descrizione: string
  canEdit: boolean
  onClose: () => void
}) {
  const { loadLabDetail, mandaInProduzione, chiudiLavorazione } = useMockStore()
  const [dettaglio, setDettaglio] = useState<LabDetail | null>(null)
  const [errore, setErrore] = useState('')
  const [quantita, setQuantita] = useState('')
  const [note, setNote] = useState('')
  const [inCorso, setInCorso] = useState(false)

  // `ricarica` NON azzera l'errore: ogni scrittura fa ricaricare lo store, il che cambia
  // l'identità di loadLabDetail e rilancia questo effetto. Se qui si pulisse il messaggio,
  // l'errore appena mostrato sparirebbe dopo pochi millisecondi senza che nessuno lo legga.
  // Lo azzerano le azioni dell'utente, appena prima di riprovare.
  const ricarica = useCallback(async () => {
    try {
      setDettaglio(await loadLabDetail(variantId))
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Dettaglio non caricato.')
    }
  }, [loadLabDetail, variantId])

  useEffect(() => {
    void ricarica()
  }, [ricarica])

  const invia = async () => {
    const n = Number(quantita)
    if (!n || n <= 0) {
      setErrore('Indica quanti pezzi mandare in produzione.')
      return
    }
    setInCorso(true)
    setErrore('')
    try {
      await mandaInProduzione(variantId, n, note.trim() || undefined)
      setQuantita('')
      setNote('')
      await ricarica()
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Operazione non registrata.')
    } finally {
      setInCorso(false)
    }
  }

  const chiudi = async (id: string, esito: 'consumato' | 'rilasciato') => {
    setInCorso(true)
    setErrore('')
    try {
      await chiudiLavorazione(id, esito)
      await ricarica()
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Operazione non riuscita.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Modal title="Laboratorio" subtitle={descrizione} onClose={onClose}>
      {!dettaglio ? (
        <p className="text-sm text-heemia-grey">Caricamento…</p>
      ) : (
        <div className="scroll-smooth-y max-h-[64vh] space-y-5 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3">
            <Cifra etichetta="In laboratorio" valore={dettaglio.qtaLaboratorio} />
            <Cifra etichetta="In produzione" valore={dettaglio.qtaInProduzione} attenuato />
            <Cifra etichetta="Utilizzabili" valore={dettaglio.disponibileInLaboratorio} />
          </div>

          <p className="text-[12px] text-heemia-grey">
            Disponibile totale {dettaglio.disponibileTotale} pezzi ({dettaglio.qtaLaboratorio} in
            laboratorio + {dettaglio.qtaMagazzino} in magazzino).
          </p>

          {dettaglio.sottoSoglia && (
            <p className="rounded-heemia border border-heemia-carmine/30 bg-heemia-carmine-light px-3 py-2 text-[12px] text-heemia-carmine">
              Scorta laboratorio in esaurimento (soglia {dettaglio.sogliaMinimaLaboratorio}).
              {dettaglio.qtaMagazzino > 0
                ? ` Recuperare materiale dal magazzino (${dettaglio.qtaMagazzino} disponibili).`
                : ' Nessun pezzo in magazzino da cui reintegrare.'}
            </p>
          )}

          {errore && <p className="text-[12px] text-heemia-carmine">{errore}</p>}

          {canEdit && (
            <section>
              <Titolo>Manda capi in produzione</Titolo>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  type="number"
                  min="1"
                  className={`${fieldClass} w-24`}
                  value={quantita}
                  onChange={(e) => setQuantita(e.target.value)}
                  placeholder="Pezzi"
                  aria-label="Pezzi da mandare in produzione"
                />
                <input
                  className={`${fieldClass} flex-1`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Per quale lavorazione"
                  aria-label="Nota sulla lavorazione"
                />
                <Button variant="secondary" onClick={() => void invia()} disabled={inCorso}>
                  Manda in produzione
                </Button>
              </div>
            </section>
          )}

          <section>
            <Titolo>Capi in produzione</Titolo>
            {dettaglio.inProduzione.length === 0 ? (
              <Vuoto>Nessun capo attualmente in produzione.</Vuoto>
            ) : (
              <ul className="space-y-2">
                {dettaglio.inProduzione.map((a) => (
                  <li key={a.id} className="rounded-heemia border border-heemia-border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono-heemia text-sm text-heemia-black">{a.quantita} pezzi</span>
                      {canEdit && (
                        <span className="flex gap-1">
                          <Button variant="secondary" onClick={() => void chiudi(a.id, 'consumato')} disabled={inCorso}>
                            Consuma
                          </Button>
                          <Button variant="ghost" onClick={() => void chiudi(a.id, 'rilasciato')} disabled={inCorso}>
                            Rilascia
                          </Button>
                        </span>
                      )}
                    </div>
                    <Riga movimento={a} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <Titolo>Ultimi reintegri dal magazzino</Titolo>
            <ListaMovimenti righe={dettaglio.reintegri} vuoto="Nessun reintegro registrato." />
          </section>

          <section>
            <Titolo>Consumi recenti</Titolo>
            <ListaMovimenti righe={dettaglio.consumi} vuoto="Nessun consumo registrato." />
          </section>

          <section>
            <Titolo>Storico movimenti</Titolo>
            <ListaMovimenti righe={dettaglio.movimenti} vuoto="Nessun movimento registrato." />
          </section>
        </div>
      )}
    </Modal>
  )
}

function Cifra({ etichetta, valore, attenuato = false }: { etichetta: string; valore: number; attenuato?: boolean }) {
  return (
    <div className="rounded-heemia border border-heemia-border px-3 py-2">
      <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{etichetta}</p>
      <p className={`font-mono-heemia text-lg ${attenuato ? 'text-heemia-grey' : 'text-heemia-black'}`}>{valore}</p>
    </div>
  )
}

function Titolo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono-heemia mb-2 border-b border-heemia-border pb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
      {children}
    </h3>
  )
}

function Vuoto({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-heemia-grey">{children}</p>
}

function Riga({ movimento }: { movimento: Lavorazione }) {
  return (
    <p className="text-[11px] text-heemia-grey">
      {new Date(movimento.createdAt).toLocaleString('it-IT')}
      {movimento.utente ? ` · ${movimento.utente}` : ''}
      {movimento.note ? ` · ${movimento.note}` : ''}
    </p>
  )
}

function ListaMovimenti({ righe, vuoto }: { righe: StockMovement[]; vuoto: string }) {
  if (righe.length === 0) return <Vuoto>{vuoto}</Vuoto>
  return (
    <ul className="space-y-1.5">
      {righe.slice(0, 10).map((m) => (
        <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
          <span className="text-heemia-black">
            <span className="font-mono-heemia">{m.quantita > 0 ? `+${m.quantita}` : m.quantita}</span>
            {m.origine && m.destinazione ? ` · ${m.origine} → ${m.destinazione}` : ''}
            {m.note ? ` · ${m.note}` : ''}
          </span>
          <span className="font-mono-heemia text-[11px] text-heemia-grey">
            {new Date(m.createdAt).toLocaleDateString('it-IT')}
            {m.utente ? ` · ${m.utente}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Badge riusabile per la colonna Laboratorio quando la giacenza è sotto soglia. */
export function SogliaLabBadge() {
  return <Badge variant="warning-outline">Da reintegrare</Badge>
}
