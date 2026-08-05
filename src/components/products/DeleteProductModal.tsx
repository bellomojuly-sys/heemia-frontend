import { useEffect, useState } from 'react'
import { Modal, FormActions } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { useMockStore, type VerificaEliminazioneProdotto } from '../../context/MockStore'
import type { Product } from '../../types'

// Conferma di eliminazione di un capo.
//
// Il modale non chiede "sei sicuro?" a scatola chiusa: prima interroga il server
// (`deletion-check`) e mostra due cose diverse a seconda della risposta —
//   • il capo ha uno storico (ordini, fatture, movimenti, lavorazioni aperte): niente
//     cancellazione, si spiega il perché e si propone l'archiviazione, che toglie il capo
//     dalle liste operative senza distruggere niente;
//   • il capo è "pulito": si elenca esattamente cosa sparirà insieme a lui.
// Il server rifà comunque il controllo prima di cancellare: fra la conferma a schermo e il
// click può essere arrivato un ordine.
export function DeleteProductModal({
  product,
  onClose,
  onDeleted,
}: {
  product: Product
  onClose: () => void
  onDeleted?: () => void
}) {
  const { checkProductDeletion, deleteProduct, updateProduct } = useMockStore()
  const [verifica, setVerifica] = useState<VerificaEliminazioneProdotto | null>(null)
  const [erroreVerifica, setErroreVerifica] = useState<string | null>(null)

  useEffect(() => {
    let annullato = false
    checkProductDeletion(product.id)
      .then((v) => { if (!annullato) setVerifica(v) })
      .catch((e) => { if (!annullato) setErroreVerifica(e instanceof Error ? e.message : 'Verifica non riuscita') })
    return () => { annullato = true }
  }, [checkProductDeletion, product.id])

  const { inCorso, submit } = useFormSubmit(
    () => ({}),
    async () => {
      await deleteProduct(product.id)
      onClose()
      onDeleted?.()
    },
  )

  const { inCorso: archiviazioneInCorso, submit: archivia } = useFormSubmit(
    () => ({}),
    async () => {
      await updateProduct(product.id, { stato: 'archivio' })
      onClose()
    },
  )

  const c = verifica?.conseguenze
  const elenco = c
    ? [
        c.varianti > 0 ? `${c.varianti} ${c.varianti === 1 ? 'variante' : 'varianti'} (taglie e colori)` : null,
        c.pezziInGiacenza > 0 ? `${c.pezziInGiacenza} pezzi a giacenza fra magazzino e laboratorio` : null,
        c.schedeTecniche > 0 ? `${c.schedeTecniche} ${c.schedeTecniche === 1 ? 'scheda tecnica' : 'schede tecniche'} con foto e costi` : null,
        c.documentiModellista > 0 ? `${c.documentiModellista} ${c.documentiModellista === 1 ? 'documento della modellista' : 'documenti della modellista'}` : null,
        c.fasiPipeline > 0 ? `${c.fasiPipeline} ${c.fasiPipeline === 1 ? 'fase' : 'fasi'} di pipeline con il loro storico` : null,
      ].filter((r): r is string => r !== null)
    : []

  return (
    <Modal
      title={`Elimina "${product.nome}"`}
      subtitle={product.codiceProdotto}
      onClose={onClose}
    >
      {!verifica && !erroreVerifica && (
        <p className="text-sm text-heemia-grey">Controllo cosa è collegato a questo capo…</p>
      )}

      {erroreVerifica && (
        <p className="text-sm text-heemia-carmine">{erroreVerifica}</p>
      )}

      {verifica && !verifica.eliminabile && (
        <div className="space-y-3 text-sm">
          <p className="text-heemia-black">Questo capo non si può eliminare:</p>
          <ul className="list-disc space-y-1 pl-5 text-heemia-grey">
            {verifica.blocchi.map((b) => <li key={b}>{b}</li>)}
          </ul>
          <p className="text-heemia-grey">
            Cancellarlo lascerebbe vendite e costi senza il capo a cui si riferiscono, e i report
            passati non tornerebbero più. Puoi <strong className="font-medium text-heemia-black">archiviarlo</strong>:
            sparisce dalle liste operative e dalla pipeline, ma resta collegato al suo storico.
          </p>
        </div>
      )}

      {verifica?.eliminabile && (
        <div className="space-y-3 text-sm">
          <p className="text-heemia-black">L'eliminazione è definitiva e porta via anche:</p>
          {elenco.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-heemia-grey">
              {elenco.map((r) => <li key={r}>{r}</li>)}
            </ul>
          ) : (
            <p className="text-heemia-grey">Nessun dato collegato: il capo è vuoto.</p>
          )}
          <p className="text-heemia-grey">
            Non ci sono ordini né fatture collegate, quindi non si perde niente di contabile.
            Se preferisci tenerne traccia, puoi archiviarlo invece di eliminarlo.
          </p>
        </div>
      )}

      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso || archiviazioneInCorso}>Annulla</Button>
        {verifica && (
          <Button variant="secondary" onClick={() => void archivia()} disabled={inCorso || archiviazioneInCorso}>
            {archiviazioneInCorso ? 'Archiviazione…' : 'Archivia'}
          </Button>
        )}
        {verifica?.eliminabile && (
          <Button
            onClick={() => void submit()}
            disabled={inCorso || archiviazioneInCorso}
            className="border-heemia-carmine bg-heemia-carmine text-white hover:border-heemia-carmine hover:bg-heemia-carmine/90"
          >
            {inCorso ? 'Eliminazione…' : 'Elimina definitivamente'}
          </Button>
        )}
      </FormActions>
    </Modal>
  )
}
