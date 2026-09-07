import { useEffect, useState } from 'react'
import { Modal, FormActions } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { useDataStore, type VerificaEliminazioneCliente } from '../../context/DataStore'
import { ApiError } from '../../lib/api'
import type { Customer } from '../../types'

/**
 * Conferma di eliminazione di un cliente.
 *
 * Non chiede «sei sicuro?» a scatola chiusa: prima interroga il server
 * (`GET /customers/:id/deletion-check`), che conta cosa è collegato, e mostra la
 * differenza che conta davvero — perché le due relazioni si comportano al contrario:
 *
 *   • **ordini e fatture restano**, ma perdono l'intestatario. Il fatturato non cambia,
 *     il nome sul documento sì. È una perdita, non una pulizia;
 *   • **visite, preferiti e richieste showroom spariscono** con il cliente: sono suoi e
 *     senza di lui non significano niente.
 *
 * Quando c'è dello storico serve una spunta in più: il pulsante da solo non basta se la
 * conseguenza è che dei documenti contabili restano senza nome. Il server rifà comunque il
 * controllo e rifiuta con 409 se la spunta manca — fra la conferma a schermo e il clic può
 * essere arrivato un ordine.
 */
export function DeleteCustomerModal({
  cliente,
  onClose,
  onDeleted,
}: {
  cliente: Customer
  onClose: () => void
  onDeleted?: () => void
}) {
  const { checkCustomerDeletion, deleteCustomer } = useDataStore()
  const [verifica, setVerifica] = useState<VerificaEliminazioneCliente | null>(null)
  const [erroreVerifica, setErroreVerifica] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [confermato, setConfermato] = useState(false)

  useEffect(() => {
    let annullato = false
    checkCustomerDeletion(cliente.id)
      .then((v) => { if (!annullato) setVerifica(v) })
      .catch((e) => { if (!annullato) setErroreVerifica(e instanceof Error ? e.message : 'Verifica non riuscita') })
    return () => { annullato = true }
  }, [checkCustomerDeletion, cliente.id])

  const { inCorso, submit } = useFormSubmit(
    () => ({}),
    async () => {
      setErrore(null)
      try {
        await deleteCustomer(cliente.id, confermato)
        onClose()
        onDeleted?.()
      } catch (e) {
        setErrore(e instanceof ApiError ? e.message : "Non è stato possibile eliminare il cliente.")
        throw e
      }
    },
  )

  const bloccato = Boolean(verifica?.haStorico && !confermato)

  return (
    <Modal title={`Elimina "${cliente.nome}"`} subtitle={cliente.email ?? undefined} onClose={onClose}>
      {!verifica && !erroreVerifica && (
        <p className="text-sm text-heemia-grey">Controllo cosa è collegato a questo cliente…</p>
      )}

      {erroreVerifica && <p className="text-sm text-heemia-carmine">{erroreVerifica}</p>}

      {verifica && (
        <div className="space-y-3 text-sm">
          <p className="text-heemia-black">L'eliminazione è definitiva. Ecco cosa comporta:</p>
          <ul className="list-disc space-y-1 pl-5 text-heemia-grey">
            {verifica.avvertenze.length > 0 ? (
              verifica.avvertenze.map((a) => <li key={a}>{a}</li>)
            ) : (
              <li>Nessun documento collegato: non si perde niente.</li>
            )}
          </ul>

          {verifica.haStorico && (
            <label className="flex items-start gap-2 rounded-heemia-sm border border-heemia-carmine/30 bg-heemia-carmine-light px-3 py-2 text-heemia-black">
              <input
                type="checkbox"
                checked={confermato}
                onChange={(e) => setConfermato(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-heemia-carmine"
              />
              <span className="text-[13px] leading-snug">
                Ho letto che ordini e fatture di {verifica.nome} resteranno in archivio senza intestatario, e voglio
                procedere lo stesso.
              </span>
            </label>
          )}

          {errore && <p className="text-heemia-carmine">{errore}</p>}
        </div>
      )}

      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={inCorso}>Annulla</Button>
        {verifica?.eliminabile && (
          <Button
            onClick={() => void submit()}
            disabled={inCorso || bloccato}
            title={bloccato ? 'Serve la conferma qui sopra: ci sono ordini o fatture collegate.' : undefined}
            className="border-heemia-carmine bg-heemia-carmine text-white hover:border-heemia-carmine hover:bg-heemia-carmine/90 disabled:opacity-40"
          >
            {inCorso ? 'Eliminazione…' : 'Elimina definitivamente'}
          </Button>
        )}
      </FormActions>
    </Modal>
  )
}
