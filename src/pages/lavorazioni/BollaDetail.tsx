import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Paperclip, Printer } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal, Field, FormActions, fieldClass } from '../../components/ui/Modal'
import { LoadingState } from '../../components/ui/States'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt, formatDateTimeIt } from '../../lib/format'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'
import { useGoatAlert } from '../../context/GoatAlertContext'
import { RientroModal } from '../../components/lavorazioni/RientroModal'
import { BollaPdfDocument } from '../../components/lavorazioni/BollaPdfDocument'
import { apriAllegato, useMovimentiBolla, useServerBolla } from '../../hooks/useServerLavorazioni'
import type { BollaLavorazione, MovimentoLavorazione, RigaBolla } from '../../types'

// Scheda di una bolla: cosa è uscito, cosa è tornato, cosa è ancora fuori, e il registro
// completo dei movimenti con la persona che li ha fatti.

const CAUSALI: Record<string, string> = {
  conto_lavorazione: 'Conto lavorazione',
  conto_visione: 'Conto visione',
  riparazione: 'Riparazione',
  campionatura: 'Campionatura',
  reso_a_fornitore: 'Reso a fornitore',
  altro: 'Altro',
}

const MOVIMENTI: Record<MovimentoLavorazione['tipo'], { label: string; variante: 'neutral' | 'critical' | 'warning-outline' | 'info' }> = {
  uscita_materiale: { label: 'Uscita', variante: 'info' },
  rientro_inutilizzato: { label: 'Restituito', variante: 'neutral' },
  consumo: { label: 'Consumato', variante: 'neutral' },
  scarto_recuperato: { label: 'Scampolo recuperato', variante: 'info' },
  scarto: { label: 'Scarto perso', variante: 'critical' },
  carico_finiti: { label: 'Capi caricati', variante: 'neutral' },
  storno_uscita: { label: 'Storno', variante: 'warning-outline' },
}

export function BollaDetail() {
  const { id } = useParams<{ id: string }>()
  const { role } = useRole()
  const { avvisa } = useGoatAlert()
  const modificabile = canEdit(role)
  const puoForzare = role === 'admin' || role === 'ceo'

  const { bolla, caricamento, errore, emetti, registraRientro, chiudi, annulla, salvaNote, allega } = useServerBolla(id)
  // La chiave di revisione fa ricaricare il registro quando la bolla cambia davvero:
  // emissione, nuovo rientro, chiusura, annullamento. Senza, resterebbe quello caricato
  // all'apertura della scheda.
  const { movimenti } = useMovimentiBolla(
    bolla ? bolla.id : null,
    bolla ? `${bolla.stato}:${bolla.rientri.length}` : '',
  )

  const [rientroAperto, setRientroAperto] = useState(false)
  const [chiusuraAperta, setChiusuraAperta] = useState(false)
  const [annullaAperto, setAnnullaAperto] = useState(false)
  const [inCorso, setInCorso] = useState(false)
  // Il documento va montato PRIMA di window.print(), altrimenti si stampa il nulla:
  // la stampa parte dall'effetto, non dal click.
  const [stampaRichiesta, setStampaRichiesta] = useState(false)

  useEffect(() => {
    if (!stampaRichiesta) return
    setStampaRichiesta(false)
    window.print()
  }, [stampaRichiesta])

  if (caricamento && !bolla) {
    return (
      <Card>
        <LoadingState rows={6} />
      </Card>
    )
  }

  if (errore || !bolla) {
    return (
      <>
        <Link to="/lavorazioni" className="mb-4 inline-flex items-center gap-1.5 text-xs text-heemia-grey hover:text-heemia-black">
          <ArrowLeft className="h-3.5 w-3.5" /> Torna alle bolle
        </Link>
        <p className="rounded-heemia border border-heemia-carmine/30 bg-heemia-carmine-light px-4 py-3 text-xs text-heemia-carmine">
          {errore ?? 'Bolla non trovata'}
        </p>
      </>
    )
  }

  const aperta = bolla.stato === 'emessa' || bolla.stato === 'parzialmente_rientrata'

  async function esegui(azione: () => Promise<unknown>) {
    setInCorso(true)
    try {
      await azione()
    } catch (e) {
      avvisa('salvataggio', { testo: e instanceof Error ? e.message : 'Operazione non riuscita.' })
    } finally {
      setInCorso(false)
    }
  }

  return (
    <>
      <Link to="/lavorazioni" className="mb-4 inline-flex items-center gap-1.5 text-xs text-heemia-grey transition-colors hover:text-heemia-black">
        <ArrowLeft className="h-3.5 w-3.5" /> Torna alle bolle
      </Link>

      <PageHeader
        title={bolla.etichetta}
        subtitle={`${CAUSALI[bolla.causale]} · ${bolla.lavoranteNome ?? bolla.lavorante.nome} · ${formatDateIt(bolla.data)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={bolla.stato} />
            {bolla.chiusaConDifferenza && <Badge variant="warning-outline">Chiusa con differenza</Badge>}
            <Button variant="secondary" onClick={() => setStampaRichiesta(true)}>
              <Printer className="mr-1 inline h-3 w-3" /> Stampa / PDF
            </Button>
            {modificabile && bolla.stato === 'bozza' && (
              <Button disabled={inCorso} onClick={() => void esegui(emetti)}>
                {inCorso ? 'Emissione…' : 'Emetti la bolla'}
              </Button>
            )}
            {modificabile && aperta && (
              <Button onClick={() => setRientroAperto(true)}>Registra rientro</Button>
            )}
            {modificabile && aperta && (
              <Button variant="secondary" onClick={() => setChiusuraAperta(true)}>Chiudi</Button>
            )}
            {modificabile && (bolla.stato === 'bozza' || bolla.stato === 'emessa') && (
              <Button variant="ghost" onClick={() => setAnnullaAperto(true)}>Annulla</Button>
            )}
          </div>
        }
      />

      {bolla.stato === 'bozza' && (
        <div className="mb-5 rounded-heemia border border-heemia-border-strong bg-heemia-surface px-4 py-3 text-xs text-heemia-grey">
          È ancora una bozza: nessun materiale è uscito dal magazzino e il documento non ha un numero.
          Il numero progressivo si assegna all'emissione, così il registro non resta con dei buchi.
        </div>
      )}

      {bolla.chiusaConDifferenza && bolla.differenzaNote && (
        <div className="mb-5 rounded-heemia border border-heemia-orange/40 bg-heemia-orange-light px-4 py-3 text-xs text-heemia-black">
          <span className="font-mono-heemia uppercase tracking-[0.06em] text-heemia-orange">Chiusa con differenza</span>
          <p className="mt-1">{bolla.differenzaNote}</p>
        </div>
      )}

      {/* `items-start`: senza, le due colonne si pareggiano in altezza e la tabella dei
          materiali si allunga a vuoto per inseguire la colonna di destra. */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        {/* `min-w-0`: senza, il figlio di una griglia non scende sotto la larghezza minima
            del suo contenuto, e la tabella a sei colonne faceva sbordare la pagina su
            schermo stretto invece di scorrere dentro il proprio contenitore. */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader
            title="Materiali consegnati"
            subtitle="Per ogni riga: quanto è uscito e cosa ne è stato."
          />
          {/* Niente `min-w-max`: con sei colonne dentro i due terzi della griglia la tabella
              sborderebbe e le quantità finirebbero fuori dallo schermo. Le colonne numeriche
              restano su una riga, solo la descrizione può andare a capo. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-heemia-border-strong text-left">
                  {['Articolo', 'Consegnata', 'Utilizzata', 'Restituita', 'Scampoli', 'Persa', 'Ancora fuori'].map((h, i) => (
                    <th
                      key={h}
                      className={`font-mono-heemia px-2 py-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-heemia-grey ${i > 0 ? 'text-right' : 'pl-4'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bolla.righe.map((r) => (
                  <RigaTabella key={r.id} riga={r} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="px-5 py-4">
            <p className="font-mono-heemia mb-3 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Documento</p>
            <Dato etichetta="Lavorante" valore={bolla.lavoranteNome ?? bolla.lavorante.nome} />
            <Dato etichetta="P. IVA" valore={bolla.lavorantePartitaIva ?? bolla.lavorante.partitaIva} />
            <Dato etichetta="Capo" valore={bolla.prodotto ? `${bolla.prodotto.nome} (${bolla.prodotto.codiceProdotto})` : undefined} />
            <Dato etichetta="Scheda tecnica" valore={bolla.schedaTecnica ? `Versione ${bolla.schedaTecnica.versione}` : undefined} />
            <Dato etichetta="Commessa" valore={bolla.commessa} />
            <Dato etichetta="Ordine" valore={bolla.ordine?.numero} />
            <Dato
              etichetta="Capi finiti"
              valore={bolla.quantitaAttesa > 0 ? `${bolla.capiRientrati} rientrati su ${bolla.quantitaAttesa} attesi` : String(bolla.capiRientrati)}
            />
            <Dato etichetta="Creata da" valore={bolla.creataDa?.nome} />
            <Dato etichetta="Emessa da" valore={bolla.emittente ? `${bolla.emittente.nome} · ${formatDateTimeIt(bolla.emessaIl)}` : undefined} />
            <Dato etichetta="Chiusa da" valore={bolla.chiuditore ? `${bolla.chiuditore.nome} · ${formatDateTimeIt(bolla.chiusaIl)}` : undefined} />
          </Card>

          <Card className="px-5 py-4">
            <p className="font-mono-heemia mb-3 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
              Costo materiali della lavorazione
            </p>
            <Dato etichetta="Consumato nei capi" valore={formatCurrency(bolla.costoConsumato)} />
            <Dato etichetta="Perso in lavorazione" valore={formatCurrency(bolla.costoPerso)} />
            <Dato etichetta="Totale" valore={formatCurrency(bolla.costoLavorazione)} />
            <p className="mt-2 text-[11px] leading-relaxed text-heemia-grey-light">
              Il consumo utile e le perdite restano separati. Gli scampoli recuperati sono ancora patrimonio e non diventano un costo.
            </p>
          </Card>

          <NoteBolla bolla={bolla} modificabile={modificabile} onSalva={salvaNote} />

          <Allegati bolla={bolla} modificabile={modificabile} onAllega={allega} />
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader title="Rientri" subtitle="Ogni consegna di ritorno dal lavorante, con il suo documento." />
        {bolla.rientri.length === 0 ? (
          <p className="px-5 py-6 text-xs text-heemia-grey">Nessun rientro registrato.</p>
        ) : (
          <div className="divide-y divide-heemia-border">
            {bolla.rientri.map((r) => (
              <div key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-heemia-black">
                    {formatDateIt(r.data)}
                    {r.numeroDocumentoLavorante && (
                      <span className="ml-2 font-mono-heemia text-[11px] text-heemia-grey">DDT {r.numeroDocumentoLavorante}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-heemia-grey">
                    {r.registratoDa ? `registrato da ${r.registratoDa.nome}` : ''}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-heemia-grey">
                  {r.righe.map((riga) => {
                    const origine = bolla.righe.find((x) => x.id === riga.rigaId)
                    return (
                      <span key={riga.id} className="rounded-heemia border border-heemia-border px-2 py-1">
                        {origine?.descrizione ?? 'Riga'}:{' '}
                        {[
                          riga.quantitaUtilizzata > 0 ? `${riga.quantitaUtilizzata} usati` : null,
                          riga.quantitaRestituita > 0 ? `${riga.quantitaRestituita} restituiti` : null,
                          riga.quantitaScartoRecuperato > 0 ? `${riga.quantitaScartoRecuperato} recuperati come scampoli` : null,
                          riga.quantitaScartoPerso > 0 ? `${riga.quantitaScartoPerso} persi` : null,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    )
                  })}
                  {r.capi.map((c) => (
                    <span key={c.id} className="rounded-heemia border border-heemia-border bg-heemia-surface px-2 py-1">
                      {c.quantita} capi {c.taglia}/{c.colore}
                    </span>
                  ))}
                </div>
                {r.note && <p className="mt-2 text-xs text-heemia-grey">{r.note}</p>}
                {r.allegati.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.allegati.map((a) => (
                      <BottoneAllegato key={a.id} id={a.id} nome={a.nome} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Storico dei movimenti" subtitle="Ogni movimento è agganciato alla riga che l'ha generato e alla persona che l'ha fatto." />
        {movimenti.length === 0 ? (
          <p className="px-5 py-6 text-xs text-heemia-grey">
            {bolla.stato === 'bozza'
              ? 'Nessun movimento: finché è una bozza non esce niente dal magazzino.'
              : 'Nessun movimento registrato.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-heemia-border-strong text-left">
                  {['Quando', 'Tipo', 'Articolo', 'Da → a', 'Quantità', 'Valore', 'Chi'].map((h) => (
                    <th key={h} className="font-mono-heemia px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-heemia-grey">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movimenti.map((m) => (
                  <tr key={m.id} className="border-b border-heemia-border last:border-0">
                    <td className="px-4 py-2.5 text-[11px] text-heemia-grey">{formatDateTimeIt(m.createdAt)}</td>
                    <td className="px-4 py-2.5"><Badge variant={MOVIMENTI[m.tipo].variante}>{MOVIMENTI[m.tipo].label}</Badge></td>
                    <td className="px-4 py-2.5">{m.descrizione}</td>
                    <td className="font-mono-heemia px-4 py-2.5 text-[11px] text-heemia-grey">
                      {etichettaUbicazione(m.da)} → {etichettaUbicazione(m.a)}
                    </td>
                    <td className="font-mono-heemia px-4 py-2.5">{m.quantita} {m.unitaMisura}</td>
                    <td className="font-mono-heemia px-4 py-2.5 text-right text-heemia-grey">
                      {m.valore > 0 ? formatCurrency(m.valore) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-heemia-grey">{m.eseguitoDa?.nome ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {rientroAperto && (
        <RientroModal
          bolla={bolla}
          onClose={() => setRientroAperto(false)}
          onSubmit={(input) => registraRientro(input)}
        />
      )}

      {chiusuraAperta && (
        <ChiusuraModal
          bolla={bolla}
          puoForzare={puoForzare}
          onClose={() => setChiusuraAperta(false)}
          onSubmit={async (opzioni) => { await chiudi(opzioni) }}
        />
      )}

      {annullaAperto && (
        <AnnullaModal
          bolla={bolla}
          onClose={() => setAnnullaAperto(false)}
          onSubmit={async (motivo) => { await annulla(motivo) }}
        />
      )}

      <BollaPdfDocument bolla={bolla} />
    </>
  )
}

function etichettaUbicazione(u: MovimentoLavorazione['da']): string {
  return {
    magazzino: 'magazzino', produzione_esterna: 'lavorante', scampoli: 'scampoli',
    consumato: 'consumato', scarto: 'scarto perso',
  }[u]
}

function RigaTabella({ riga }: { riga: RigaBolla }) {
  return (
    <tr className="border-b border-heemia-border last:border-0">
      <td className="py-3 pl-4 pr-2">
        <p className="text-heemia-black">{riga.descrizione}</p>
        <p className="text-[11px] text-heemia-grey">
          {[
            riga.sku, riga.lotto && `lotto ${riga.lotto}`, riga.colore,
            riga.provenienza === 'scampoli' ? 'prelevato dagli scampoli' : null,
            `${formatCurrency(riga.costoUnitario)}/${riga.unitaMisura}`,
          ].filter(Boolean).join(' · ')}
        </p>
        {riga.note && <p className="mt-0.5 text-[11px] text-heemia-grey-light">{riga.note}</p>}
      </td>
      <td className="font-mono-heemia whitespace-nowrap px-2 py-3 text-right">{riga.quantitaInviata} {riga.unitaMisura}</td>
      <td className="font-mono-heemia px-2 py-3 text-right text-heemia-grey">{riga.quantitaUtilizzata || '—'}</td>
      <td className="font-mono-heemia px-2 py-3 text-right text-heemia-grey">{riga.quantitaRestituita || '—'}</td>
      <td className="font-mono-heemia px-2 py-3 text-right text-heemia-grey">
        {riga.quantitaScartoRecuperato || '—'}
      </td>
      <td className={`font-mono-heemia px-2 py-3 text-right ${riga.quantitaScartoPerso > 0 ? 'text-heemia-carmine' : 'text-heemia-grey'}`}>
        {riga.quantitaScartoPerso || '—'}
      </td>
      <td className="font-mono-heemia px-2 py-3 pr-4 text-right">
        {riga.quantitaPressoLavorante > 0 ? (
          <span className="text-heemia-carmine">{riga.quantitaPressoLavorante}</span>
        ) : (
          <span className="text-heemia-grey-light">0</span>
        )}
      </td>
    </tr>
  )
}

function Dato({ etichetta, valore }: { etichetta: string; valore?: string | null }) {
  if (!valore) return null
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-dotted border-heemia-border pb-1.5 last:border-0">
      <span className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{etichetta}</span>
      <span className="text-right text-xs text-heemia-black">{valore}</span>
    </div>
  )
}

/**
 * Le note restano scrivibili anche dopo l'emissione: non spostano quantità. Tutto il resto
 * di una bolla emessa è congelato — si corregge annullando e riemettendo, così la
 * correzione lascia una traccia.
 */
function NoteBolla({
  bolla,
  modificabile,
  onSalva,
}: {
  bolla: BollaLavorazione
  modificabile: boolean
  onSalva: (note: string) => Promise<unknown>
}) {
  const [testo, setTesto] = useState(bolla.note ?? '')
  const [salvando, setSalvando] = useState(false)
  const cambiato = testo !== (bolla.note ?? '')

  return (
    <Card className="px-5 py-4">
      <p className="font-mono-heemia mb-2 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Note</p>
      {modificabile ? (
        <>
          <textarea className={fieldClass} rows={3} value={testo} onChange={(e) => setTesto(e.target.value)} />
          {cambiato && (
            <div className="mt-2 flex justify-end">
              <Button
                disabled={salvando}
                onClick={async () => {
                  setSalvando(true)
                  try { await onSalva(testo) } finally { setSalvando(false) }
                }}
              >
                {salvando ? 'Salvataggio…' : 'Salva le note'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-heemia-grey">{bolla.note || 'Nessuna nota.'}</p>
      )}
    </Card>
  )
}

function Allegati({
  bolla,
  modificabile,
  onAllega,
}: {
  bolla: BollaLavorazione
  modificabile: boolean
  onAllega: (a: { nome: string; dataUrl: string }) => Promise<unknown>
}) {
  const [inCorso, setInCorso] = useState(false)

  async function carica(file: File) {
    setInCorso(true)
    try {
      const dataUrl = await new Promise<string>((risolvi, rifiuta) => {
        const l = new FileReader()
        l.onload = () => risolvi(String(l.result))
        l.onerror = () => rifiuta(l.error)
        l.readAsDataURL(file)
      })
      await onAllega({ nome: file.name, dataUrl })
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Card className="px-5 py-4">
      <p className="font-mono-heemia mb-2 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Allegati</p>
      {bolla.allegati.length === 0 ? (
        <p className="mb-2 text-xs text-heemia-grey-light">Nessun documento allegato.</p>
      ) : (
        <div className="mb-2 flex flex-wrap gap-2">
          {bolla.allegati.map((a) => (
            <BottoneAllegato key={a.id} id={a.id} nome={a.nome} />
          ))}
        </div>
      )}
      {modificabile && (
        <label className="flex cursor-pointer items-center gap-2 rounded-heemia-sm border border-dashed border-heemia-border-strong px-3 py-2 text-xs text-heemia-grey transition-colors hover:border-heemia-black hover:text-heemia-black">
          <Paperclip className="h-3.5 w-3.5" />
          {inCorso ? 'Caricamento…' : 'Allega un documento'}
          <input
            type="file"
            className="hidden"
            accept="application/pdf,image/*"
            disabled={inCorso}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void carica(f) }}
          />
        </label>
      )}
    </Card>
  )
}

/** Il contenuto dell'allegato si scarica solo al click: i data URL pesano parecchio. */
function BottoneAllegato({ id, nome }: { id: string; nome: string }) {
  const [inCorso, setInCorso] = useState(false)
  return (
    <button
      type="button"
      disabled={inCorso}
      onClick={async () => {
        setInCorso(true)
        try {
          const a = await apriAllegato(id)
          const w = window.open()
          if (w) w.document.write(`<iframe src="${a.dataUrl}" style="border:0;width:100%;height:100%"></iframe>`)
        } finally {
          setInCorso(false)
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-heemia border border-heemia-border px-2.5 py-1 text-[11px] text-heemia-black transition-colors hover:border-heemia-black disabled:opacity-50"
    >
      <Paperclip className="h-3 w-3" />
      {inCorso ? 'Apro…' : nome}
    </button>
  )
}

function ChiusuraModal({
  bolla,
  puoForzare,
  onClose,
  onSubmit,
}: {
  bolla: BollaLavorazione
  puoForzare: boolean
  onClose: () => void
  onSubmit: (opzioni: { forzaDifferenza?: boolean; note?: string }) => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const fuori = bolla.righe.filter((r) => r.quantitaPressoLavorante > 0)

  return (
    <Modal title="Chiudi la lavorazione" subtitle={bolla.etichetta} onClose={onClose}>
      {fuori.length === 0 ? (
        <p className="text-sm text-heemia-black">
          Tutte le quantità sono riconciliate: niente è più presso il lavorante. La bolla può essere chiusa.
        </p>
      ) : (
        <>
          <p className="text-sm text-heemia-black">Presso il lavorante c'è ancora:</p>
          <ul className="mt-2 space-y-1">
            {fuori.map((r) => (
              <li key={r.id} className="font-mono-heemia text-[11px] text-heemia-carmine">
                {r.descrizione}: {r.quantitaPressoLavorante} {r.unitaMisura}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-heemia-grey">
            {puoForzare
              ? 'Puoi chiudere lo stesso dichiarando la differenza. Le quantità NON tornano in magazzino — non sono tornate davvero — e la bolla resta marcata come chiusa con differenza.'
              : 'Registra il rientro mancante prima di chiudere. Chiudere con quantità ancora fuori è riservato ad Admin e CEO.'}
          </p>
          {puoForzare && (
            <div className="mt-3">
              <Field label="Motivazione" required hint="Resta nello storico e nella scheda della bolla.">
                <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          )}
        </>
      )}

      {errore && <p role="alert" className="mt-3 text-[11px] text-heemia-carmine">{errore}</p>}

      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Annulla</Button>
        <Button
          disabled={inCorso || (fuori.length > 0 && (!puoForzare || !note.trim()))}
          onClick={async () => {
            setInCorso(true)
            setErrore(null)
            try {
              await onSubmit(fuori.length > 0 ? { forzaDifferenza: true, note: note.trim() } : {})
              onClose()
            } catch (e) {
              setErrore(e instanceof Error ? e.message : 'Chiusura non riuscita.')
            } finally {
              setInCorso(false)
            }
          }}
        >
          {inCorso ? 'Chiusura…' : fuori.length > 0 ? 'Chiudi con differenza' : 'Chiudi la lavorazione'}
        </Button>
      </FormActions>
    </Modal>
  )
}

function AnnullaModal({
  bolla,
  onClose,
  onSubmit,
}: {
  bolla: BollaLavorazione
  onClose: () => void
  onSubmit: (motivo?: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  return (
    <Modal title="Annulla la bolla" subtitle={bolla.etichetta} onClose={onClose}>
      <p className="text-sm text-heemia-black">
        {bolla.stato === 'bozza'
          ? 'La bozza non ha mosso giacenze: annullarla non cambia nessun numero.'
          : 'I materiali consegnati tornano disponibili in magazzino con un movimento di storno. Lo storico dell\'uscita resta visibile: il registro racconta cosa è successo, compreso l\'errore.'}
      </p>
      <div className="mt-3">
        <Field label="Motivo" hint="Finisce nell'audit log accanto all'operazione.">
          <input className={fieldClass} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Es. lavorante non disponibile" />
        </Field>
      </div>

      {errore && <p role="alert" className="mt-3 text-[11px] text-heemia-carmine">{errore}</p>}

      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Lascia com'è</Button>
        <Button
          disabled={inCorso}
          onClick={async () => {
            setInCorso(true)
            setErrore(null)
            try {
              await onSubmit(motivo.trim() || undefined)
              onClose()
            } catch (e) {
              setErrore(e instanceof Error ? e.message : 'Annullamento non riuscito.')
            } finally {
              setInCorso(false)
            }
          }}
        >
          {inCorso ? 'Annullamento…' : 'Annulla la bolla'}
        </Button>
      </FormActions>
    </Modal>
  )
}
