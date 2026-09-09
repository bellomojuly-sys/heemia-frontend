import { useMemo, useState } from 'react'
import { Check, FolderSearch, TriangleAlert } from 'lucide-react'
import { Modal, fieldClass } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { ApiError } from '../../lib/api'
import { cercaAbbinamentiFoto, collegaFotoAbbinare, type EsitoRicerca } from '../../lib/driveApi'
import { ProductImage } from './ProductImage'

/**
 * Collega in una volta sola le foto di Drive a tutti i capi che le nominano (FR-16).
 *
 * Il problema da cui nasce: su Drive ci sono centinaia di foto e i capi sono 93. Collegarle
 * una per una — che è l'unico modo che esisteva prima — vuol dire copiare centinaia di link
 * a mano, e finché non lo si fa la galleria del catalogo resta una griglia di iniziali su
 * fondo grigio. Il riconoscimento si appoggia alla convenzione che le foto già rispettano:
 * **il file si chiama con il nome del capo** («Malta.jpg», «PECHINO + HELSINKI CORDA.jpg»);
 * dove non è così, spesso lo dice la cartella che lo contiene («CAPI IN LAVORAZIONE/BERNA»).
 *
 * Perché si passa da una proposta invece di collegare e basta: un abbinamento sbagliato non
 * si vede: mette la foto del pantalone dentro la scheda della giacca, e lì resta finché
 * qualcuno non apre quel capo. Chi guarda la proposta riconosce i propri capi in un istante;
 * l'algoritmo, sui nomi scritti a mano, no. Per questo gli abbinamenti **certi** arrivano
 * già spuntati e quelli **probabili** (ricavati correggendo un refuso) no.
 */
export function AbbinaFotoDrive({ onClose, onFatto }: { onClose: () => void; onFatto: () => Promise<void> }) {
  const [cartellaUrl, setCartellaUrl] = useState('')
  const [esito, setEsito] = useState<EsitoRicerca | null>(null)
  const [selezione, setSelezione] = useState<Map<string, Set<string>>>(new Map())
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')
  const [salvato, setSalvato] = useState<{ capi: number; foto: number } | null>(null)
  const [mostraSenzaFoto, setMostraSenzaFoto] = useState(false)
  const [mostraNonAbbinati, setMostraNonAbbinati] = useState(false)

  const cerca = async () => {
    setInCorso(true)
    setErrore('')
    setSalvato(null)
    try {
      const risultato = await cercaAbbinamentiFoto(cartellaUrl.trim())
      setEsito(risultato)
      // Preselezione: solo le certe e solo quelle non ancora in scheda. Le probabili si
      // spuntano a mano — è la sola differenza pratica fra le due categorie.
      const iniziale = new Map<string, Set<string>>()
      for (const p of risultato.proposte) {
        const urls = p.foto.filter((f) => !f.giaCollegata && f.sicurezza === 'certa').map((f) => f.url)
        if (urls.length > 0) iniziale.set(p.capoId, new Set(urls))
      }
      setSelezione(iniziale)
    } catch (e) {
      setEsito(null)
      setErrore(e instanceof ApiError ? e.message : 'Non è stato possibile leggere la cartella su Drive.')
    } finally {
      setInCorso(false)
    }
  }

  const commuta = (capoId: string, url: string) => {
    setSelezione((precedente) => {
      const copia = new Map(precedente)
      const urls = new Set(copia.get(capoId) ?? [])
      if (urls.has(url)) urls.delete(url)
      else urls.add(url)
      if (urls.size === 0) copia.delete(capoId)
      else copia.set(capoId, urls)
      return copia
    })
  }

  const tutteLeProbabili = () => {
    if (!esito) return
    setSelezione((precedente) => {
      const copia = new Map(precedente)
      for (const p of esito.proposte) {
        const probabili = p.foto.filter((f) => !f.giaCollegata && f.sicurezza === 'probabile')
        if (probabili.length === 0) continue
        const urls = new Set(copia.get(p.capoId) ?? [])
        probabili.forEach((f) => urls.add(f.url))
        copia.set(p.capoId, urls)
      }
      return copia
    })
  }

  // Contatori dell'intestazione: sono la risposta alla domanda per cui si apre questa
  // finestra — «quanti capi avranno un'anteprima quando ho finito».
  const conteggi = useMemo(() => {
    let foto = 0
    for (const urls of selezione.values()) foto += urls.size
    return { capi: selezione.size, foto }
  }, [selezione])

  const collega = async () => {
    if (!esito) return
    setInCorso(true)
    setErrore('')
    try {
      // L'ordine conta: si manda l'ordine della proposta (esclusive prima), non quello in
      // cui l'utente ha spuntato. La prima foto collegata diventa la copertina del capo.
      const abbinamenti = esito.proposte
        .map((p) => ({
          capoId: p.capoId,
          urls: p.foto.filter((f) => selezione.get(p.capoId)?.has(f.url)).map((f) => f.url),
        }))
        .filter((a) => a.urls.length > 0)
      if (abbinamenti.length === 0) return
      const risposta = await collegaFotoAbbinare(abbinamenti)
      setSalvato({ capi: risposta.capiAggiornati, foto: risposta.fotoCollegate })
      setSelezione(new Map())
      // Le foto appena salvate passano a «già collegata» senza rifare la ricerca su Drive:
      // altrimenti resterebbero spuntabili e chi ha collegato non distinguerebbe più ciò
      // che ha fatto da ciò che deve ancora fare.
      const salvate = new Map(abbinamenti.map((a) => [a.capoId, new Set(a.urls)]))
      setEsito((precedente) =>
        precedente === null
          ? precedente
          : {
              ...precedente,
              proposte: precedente.proposte.map((p) => ({
                ...p,
                foto: p.foto.map((f) =>
                  salvate.get(p.capoId)?.has(f.url) ? { ...f, giaCollegata: true } : f,
                ),
              })),
            },
      )
      await onFatto()
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Le foto non sono state collegate.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Modal
      title="Abbina le foto di Drive ai capi"
      subtitle="Il capo si riconosce dal nome del file. Niente viene scritto finché non confermi."
      onClose={onClose}
      larghezza="ampio"
    >
      <div className="flex flex-wrap items-end gap-2">
        <input
          className={`${fieldClass} flex-1`}
          value={cartellaUrl}
          onChange={(e) => setCartellaUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cartellaUrl.trim() && void cerca()}
          placeholder="Link della cartella Drive con le foto (anche con sottocartelle)"
          aria-label="Collegamento alla cartella Drive"
        />
        <Button onClick={() => void cerca()} disabled={inCorso || !cartellaUrl.trim()}>
          <span className="inline-flex items-center gap-1.5">
            <FolderSearch className="h-3.5 w-3.5" />
            {inCorso && !esito ? 'Ricerca…' : 'Cerca le foto'}
          </span>
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-heemia-grey">
        Vengono lette anche le sottocartelle. Su Drive i file devono essere condivisi con{' '}
        <strong>«Chiunque abbia il link»</strong>, altrimenti l'anteprima resta vuota anche dopo il collegamento.
      </p>

      {errore && <p className="mt-3 text-[12px] text-heemia-carmine">{errore}</p>}

      {salvato && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-heemia-black">
          <Check className="h-3.5 w-3.5" />
          Collegate {salvato.foto} foto a {salvato.capi} capi. Sono già visibili nella galleria del catalogo.
        </p>
      )}

      {esito && (
        <div className="mt-5 border-t border-heemia-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-heemia-grey">
              <strong className="text-heemia-black">{esito.totaleFoto}</strong> foto in {esito.cartelle}{' '}
              {esito.cartelle === 1 ? 'cartella' : 'cartelle'} ·{' '}
              <strong className="text-heemia-black">{esito.proposte.length}</strong> capi riconosciuti ·{' '}
              {esito.capiSenzaFoto.length} senza nessuna foto · {esito.nonAbbinati.length} file non riconosciuti
            </p>
            {esito.proposte.some((p) => p.foto.some((f) => !f.giaCollegata && f.sicurezza === 'probabile')) && (
              <Button variant="secondary" onClick={tutteLeProbabili}>
                Spunta anche i probabili
              </Button>
            )}
          </div>

          {esito.troncato && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-heemia-carmine">
              <TriangleAlert className="h-3.5 w-3.5" />
              La cartella contiene troppe sottocartelle: la ricerca si è fermata. Indica una cartella più interna.
            </p>
          )}
          {esito.nonPubbliche > 0 && (
            <p className="mt-2 text-[11px] text-heemia-grey">
              {esito.nonPubbliche} foto non risultano condivise con «Chiunque abbia il link»: si collegano lo
              stesso, ma resteranno un riquadro vuoto finché la condivisione non cambia.
            </p>
          )}

          <div className="scroll-smooth-y mt-4 max-h-[46vh] space-y-3 overflow-y-auto pr-1">
            {esito.proposte.map((p) => (
              <div key={p.capoId} className="rounded-heemia border border-heemia-border p-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-sm text-heemia-black">{p.nome}</span>
                  <span className="font-mono-heemia text-[11px] text-heemia-grey">{p.codiceProdotto}</span>
                  {p.oltreIlLimite > 0 && (
                    <span className="text-[10px] text-heemia-grey-light">
                      altre {p.oltreIlLimite} foto su Drive, da collegare dalla scheda
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.foto.map((f) => {
                    const scelta = selezione.get(p.capoId)?.has(f.url) ?? false
                    return (
                      <button
                        key={f.fileId}
                        type="button"
                        disabled={f.giaCollegata}
                        onClick={() => commuta(p.capoId, f.url)}
                        title={f.nomeFile}
                        aria-pressed={scelta}
                        className={`relative w-20 shrink-0 rounded-heemia-sm border p-0.5 text-left transition-all duration-200 ease-heemia ${
                          f.giaCollegata
                            ? 'cursor-default border-heemia-border opacity-45'
                            : scelta
                              ? 'border-heemia-black ring-2 ring-heemia-black/10'
                              : 'border-heemia-border hover:border-heemia-border-strong'
                        }`}
                      >
                        <ProductImage
                          url={f.url}
                          nome={p.nome}
                          className="aspect-[3/4] w-full rounded-heemia-sm"
                          larghezza={200}
                        />
                        {scelta && !f.giaCollegata && (
                          <span className="absolute right-1 top-1 rounded-full bg-heemia-black p-0.5 text-white">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                        <p className="mt-1 truncate text-[10px] text-heemia-grey">{f.nomeFile}</p>
                        {f.giaCollegata ? (
                          <p className="text-[9px] text-heemia-grey-light">già collegata</p>
                        ) : f.daCartella ? (
                          <p className="text-[9px] text-heemia-carmine">dalla cartella, da confermare</p>
                        ) : f.sicurezza === 'probabile' ? (
                          <p className="text-[9px] text-heemia-carmine">nome simile, da confermare</p>
                        ) : (
                          <p className="text-[9px] text-heemia-grey-light">
                            {f.esclusiva ? 'solo questo capo' : 'look con più capi'}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {esito.capiSenzaFoto.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setMostraSenzaFoto((v) => !v)}
                className="text-[11px] text-heemia-grey underline-offset-2 hover:text-heemia-black hover:underline"
              >
                {esito.capiSenzaFoto.length} capi resteranno senza anteprima
              </button>
              {mostraSenzaFoto && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {esito.capiSenzaFoto.map((c) => (
                    <Badge key={c.id} variant="neutral">
                      {c.codiceProdotto} · {c.nome}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {esito.nonAbbinati.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setMostraNonAbbinati((v) => !v)}
                className="text-[11px] text-heemia-grey underline-offset-2 hover:text-heemia-black hover:underline"
              >
                {esito.nonAbbinati.length} file in cui non si riconosce nessun capo
              </button>
              {mostraNonAbbinati && (
                <ul className="mt-2 max-h-40 overflow-y-auto text-[11px] text-heemia-grey">
                  {esito.nonAbbinati.map((f) => (
                    <li key={f.fileId} className="truncate">
                      {f.nomeFile}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-heemia-border pt-4">
            <Button variant="secondary" onClick={onClose}>
              Chiudi
            </Button>
            <Button onClick={() => void collega()} disabled={inCorso || conteggi.foto === 0}>
              {inCorso ? 'Collegamento…' : `Collega ${conteggi.foto} foto a ${conteggi.capi} capi`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
