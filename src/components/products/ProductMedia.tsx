import { useState } from 'react'
import { Star, Trash2 } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { fieldClass } from '../ui/Modal'
import { ApiError } from '../../lib/api'
import { driveFileId, isDriveFolder } from '../../lib/driveImage'
import { importaImmaginiDaCartella } from '../../lib/driveApi'
import { ProductImage } from './ProductImage'
import type { Product } from '../../types'

/**
 * Immagini del capo, collegate da Google Drive (FR-16: i file restano su Drive).
 *
 * **La prima immagine è la copertina**: è quella che compare nella galleria del catalogo e
 * nell'elenco. Non c'è un campo "copertina" separato — si sposta un'immagine in cima, che
 * è anche il modo per riordinare le altre. Un campo in meno da tenere allineato.
 */
export function ProductMedia({
  product,
  canEdit,
  onSave,
}: {
  product: Product
  canEdit: boolean
  onSave: (immaginiUrl: string[]) => Promise<void>
}) {
  const [nuovo, setNuovo] = useState('')
  const [errore, setErrore] = useState('')
  const [avviso, setAvviso] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const immagini = product.immaginiUrl ?? []

  const salva = async (urls: string[]) => {
    setInCorso(true)
    setErrore('')
    try {
      await onSave(urls)
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Modifica non salvata.')
    } finally {
      setInCorso(false)
    }
  }

  /**
   * Cartella Drive: si collegano tutte le foto che contiene, in ordine di nome.
   *
   * Prima questo caso era un errore («serve il link del singolo file»), e con 93 capi da
   * caricare avrebbe significato incollare centinaia di link a mano. Elencare il contenuto
   * di una cartella però Drive lo concede solo a chi è autenticato: se la credenziale non
   * c'è, il server lo dice e resta la strada del file singolo, che funziona sempre.
   */
  const importaCartella = async (url: string) => {
    setInCorso(true)
    setErrore('')
    try {
      const { immagini: trovate, nonPubbliche } = await importaImmaginiDaCartella(url)
      if (trovate.length === 0) {
        setErrore('Nella cartella non ci sono immagini.')
        return
      }
      const nuove = trovate.map((i) => i.url).filter((u) => !immagini.includes(u))
      if (nuove.length === 0) {
        setErrore('Le immagini di questa cartella sono già collegate al capo.')
        return
      }
      await onSave([...immagini, ...nuove])
      setNuovo('')
      setAvviso(
        `Collegate ${nuove.length} foto dalla cartella.` +
          (nonPubbliche > 0
            ? ` Attenzione: ${nonPubbliche} non sono condivise con «Chiunque abbia il link», quindi resteranno un riquadro vuoto finché non lo sono.`
            : ''),
      )
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Non è stato possibile leggere la cartella su Drive.')
    } finally {
      setInCorso(false)
    }
  }

  const aggiungi = async () => {
    const url = nuovo.trim()
    if (!url) return
    setAvviso('')
    if (isDriveFolder(url)) {
      await importaCartella(url)
      return
    }
    if (!/^https?:\/\//i.test(url)) {
      setErrore("L'indirizzo deve iniziare con http:// o https://")
      return
    }
    if (immagini.includes(url)) {
      setErrore('Questa immagine è già collegata al capo.')
      return
    }
    await salva([...immagini, url])
    setNuovo('')
  }

  /** Portare in cima significa "usa come copertina": non serve un campo dedicato. */
  const inCopertina = (url: string) => salva([url, ...immagini.filter((u) => u !== url)])
  const rimuovi = (url: string) => salva(immagini.filter((u) => u !== url))

  return (
    <Card>
      <CardHeader
        title="Immagini del capo"
        subtitle="Collegate da Google Drive. La prima è la copertina: compare nella galleria del catalogo e nell'elenco."
      />
      <div className="p-5">
        {canEdit && (
          <div className="mb-5">
            <div className="flex flex-wrap items-end gap-2">
              <input
                className={`${fieldClass} flex-1`}
                value={nuovo}
                onChange={(e) => setNuovo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void aggiungi()}
                placeholder="Link del file, o della cartella con tutte le foto del capo"
                aria-label="Collegamento all'immagine su Drive"
              />
              <Button variant="secondary" onClick={() => void aggiungi()} disabled={inCorso || !nuovo.trim()}>
                {inCorso ? 'Salvataggio…' : isDriveFolder(nuovo) ? 'Collega tutte le foto' : 'Collega immagine'}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-heemia-grey">
              Puoi incollare il link di una <strong>singola foto</strong> o quello della{' '}
              <strong>cartella del capo</strong>: in quel caso vengono collegate tutte le foto che contiene.
              Su Drive i file devono essere condivisi con <strong>«Chiunque abbia il link»</strong>, altrimenti
              l'immagine non si vede: Drive la mostra solo a chi ha già l'accesso.
            </p>
            {avviso && <p className="mt-2 text-[12px] text-heemia-black">{avviso}</p>}
            {errore && <p className="mt-2 text-[12px] text-heemia-carmine">{errore}</p>}
          </div>
        )}

        {immagini.length === 0 ? (
          <div className="flex items-center gap-4">
            <ProductImage nome={product.nome} className="h-28 w-28 rounded-heemia" />
            <p className="max-w-sm text-sm text-heemia-grey">
              Nessuna immagine collegata. {canEdit ? "Incolla qui sopra il link Drive della foto del capo." : ''}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {immagini.map((url, i) => (
              <figure key={url} className="relative">
                <ProductImage
                  url={url}
                  nome={product.nome}
                  className="aspect-square w-full rounded-heemia border border-heemia-border"
                  larghezza={400}
                />
                {i === 0 && (
                  <span className="absolute left-2 top-2">
                    <Badge variant="neutral">Copertina</Badge>
                  </span>
                )}
                {canEdit && (
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    {i === 0 ? (
                      <span className="text-[10px] text-heemia-grey-light">Mostrata nel catalogo</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void inCopertina(url)}
                        disabled={inCorso}
                        className="inline-flex items-center gap-1 text-[11px] text-heemia-grey transition-colors hover:text-heemia-black"
                      >
                        <Star className="h-3 w-3" /> Usa come copertina
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void rimuovi(url)}
                      disabled={inCorso}
                      title="Scollega immagine"
                      aria-label="Scollega immagine"
                      className="rounded-heemia-sm p-1 text-heemia-grey transition-colors hover:text-heemia-carmine"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {!driveFileId(url) && (
                  <figcaption className="mt-1 text-[10px] text-heemia-grey-light">
                    Indirizzo esterno, non su Drive
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
