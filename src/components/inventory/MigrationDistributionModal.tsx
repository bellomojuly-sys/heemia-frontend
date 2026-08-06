import { useState } from 'react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { GoatIcon } from '../ui/GoatAlert'
import { useGoatAlert } from '../../context/GoatAlertContext'
import { ApiError } from '../../lib/api'
import type { InventoryRecord } from '../../types'

export type UbicazioneMigrazione = 'magazzino' | 'laboratorio'
export type ModalitaMigrazione = 'redistribuisci' | 'aggiungi' | 'colma'

/**
 * Distribuzione iniziale delle giacenze (FR-49) — la domanda della capretta.
 *
 * All'import il sistema conosce **solo il totale** di ogni variante, e lo mette tutto in
 * laboratorio. Quando poi qualcuno scrive "3" nel magazzino, quel 3 ha due significati
 * possibili e opposti:
 *
 * - erano già compresi nel totale → vanno **spostati** dal laboratorio (il totale non cambia);
 * - non erano mai stati contati → vanno **aggiunti** (il totale cresce).
 *
 * Indovinare significherebbe sbagliare metà delle volte in silenzio, su un numero che poi
 * alimenta margini, alert e confronto con Shopify. Quindi non si indovina: si chiede, e la
 * risposta viaggia fino al server come modalità esplicita.
 */
export function MigrationDistributionModal({
  record,
  descrizione,
  ubicazione,
  quantita,
  onClose,
  onConferma,
}: {
  record: InventoryRecord
  descrizione: string
  ubicazione: UbicazioneMigrazione
  /** Il valore appena digitato nel campo dell'ubicazione. */
  quantita: number
  onClose: () => void
  onConferma: (modalita: ModalitaMigrazione) => Promise<unknown>
}) {
  const [inCorso, setInCorso] = useState<ModalitaMigrazione | null>(null)
  const { avvisa } = useGoatAlert()

  const versoMagazzino = ubicazione === 'magazzino'
  const altraEtichetta = versoMagazzino ? 'laboratorio' : 'magazzino'
  const attuale = versoMagazzino ? record.qtaMagazzino : record.qtaLaboratorio
  const altra = versoMagazzino ? record.qtaLaboratorio : record.qtaMagazzino
  const delta = quantita - attuale

  // Esito 1 — "già compresi": l'ubicazione arriva a `quantita`, la differenza esce dall'altra.
  const redistribuito = {
    magazzino: versoMagazzino ? quantita : record.qtaMagazzino - delta,
    laboratorio: versoMagazzino ? record.qtaLaboratorio - delta : quantita,
    totale: record.totaleDichiarato,
  }
  // Esito 2 — "da aggiungere": l'ubicazione arriva allo stesso numero, ma la differenza
  // arriva da fuori invece che dall'altra ubicazione, quindi il totale si muove con lei.
  const aggiunto = {
    magazzino: versoMagazzino ? quantita : record.qtaMagazzino,
    laboratorio: versoMagazzino ? record.qtaLaboratorio : quantita,
    totale: record.totaleDichiarato + delta,
  }

  // Esito 3 — "erano nel totale ma non assegnati": compare **solo** quando c'è uno scarto
  // fra quanto è stato distribuito e quanto risulta registrato. Senza scarto sarebbe la
  // stessa cosa della prima risposta, con un'etichetta diversa: rumore.
  const scartoPrima = record.totaleDistribuito - record.totaleDichiarato
  const scartoDopo = scartoPrima + delta
  const colmato = {
    magazzino: versoMagazzino ? quantita : record.qtaMagazzino,
    laboratorio: versoMagazzino ? record.qtaLaboratorio : quantita,
    totale: record.totaleDichiarato,
  }
  const colmaVisibile = scartoPrima !== 0
  const colmaInutile = Math.abs(scartoDopo) >= Math.abs(scartoPrima)

  // La ridistribuzione è possibile solo se l'altra ubicazione ha i capi da cedere:
  // il server la rifiuterebbe comunque, ma dirlo prima evita un errore inutile.
  const ridistribuzioneImpossibile = delta > altra
  const nienteDaAggiungere = delta === 0

  const esegui = async (modalita: ModalitaMigrazione) => {
    setInCorso(modalita)
    try {
      await onConferma(modalita)
      onClose()
    } catch (e) {
      // Il modale **resta aperto** e la ragione del server la annuncia la capretta,
      // come per gli altri form (useFormSubmit): un rifiuto non deve mai somigliare
      // a un salvataggio riuscito.
      avvisa('salvataggio', {
        testo: e instanceof ApiError ? e.message : 'Non è stato possibile salvare la distribuzione.',
      })
    } finally {
      setInCorso(null)
    }
  }

  return (
    <Modal title="Distribuzione iniziale" subtitle={descrizione} onClose={onClose}>
      <div className="mb-4 flex items-start gap-3 rounded-heemia-lg border border-heemia-border-strong bg-heemia-surface px-4 py-3">
        <GoatIcon className="-my-1 -ml-1 h-16 w-16 shrink-0" />
        <p className="text-sm text-heemia-black">
          Questi <strong>{Math.abs(delta)}</strong> capi in {ubicazione} sono <strong>da aggiungere</strong> alla
          quantità totale, oppure erano <strong>già compresi nel totale</strong> e vanno spostati dal{' '}
          {altraEtichetta}?
        </p>
      </div>

      <p className="mb-3 text-xs text-heemia-grey">
        Oggi: magazzino {record.qtaMagazzino} · laboratorio {record.qtaLaboratorio} · totale registrato{' '}
        {record.totaleDichiarato}.
      </p>

      <div className="space-y-3">
        <Scelta
          titolo="Già compresi nel totale"
          descrizione={`I capi si spostano dal ${altraEtichetta}: il totale non cambia.`}
          esito={redistribuito}
          disabilitata={ridistribuzioneImpossibile}
          motivoDisabilitata={
            ridistribuzioneImpossibile
              ? `Nel ${altraEtichetta} ci sono ${altra} capi: non se ne possono spostare ${delta}.`
              : undefined
          }
          inCorso={inCorso === 'redistribuisci'}
          bloccata={inCorso !== null}
          onClick={() => esegui('redistribuisci')}
        />
        <Scelta
          titolo="Da aggiungere al totale"
          descrizione={
            delta >= 0
              ? 'Capi mai registrati: il laboratorio resta com’è e il totale cresce.'
              : 'Capi contati per errore: si tolgono dal totale, l’altra ubicazione resta com’è.'
          }
          esito={aggiunto}
          disabilitata={nienteDaAggiungere}
          motivoDisabilitata={nienteDaAggiungere ? 'La quantità è già questa: non cambia niente.' : undefined}
          inCorso={inCorso === 'aggiungi'}
          bloccata={inCorso !== null}
          onClick={() => esegui('aggiungi')}
        />
        {colmaVisibile && (
          <Scelta
            titolo="Erano nel totale, ma non ancora assegnati"
            descrizione={`Il totale registrato resta ${record.totaleDichiarato}: si chiude lo scarto fra capi distribuiti e capi registrati.`}
            esito={colmato}
            disabilitata={colmaInutile}
            motivoDisabilitata={
              colmaInutile
                ? `Con questa quantità lo scarto non si riduce (da ${scartoPrima} a ${scartoDopo}).`
                : undefined
            }
            inCorso={inCorso === 'colma'}
            bloccata={inCorso !== null}
            onClick={() => esegui('colma')}
          />
        )}
      </div>

      {colmaVisibile && (
        <p className="mt-3 text-xs text-heemia-carmine">
          Attenzione: di questa variante risultano {record.totaleDistribuito} capi distribuiti su{' '}
          {record.totaleDichiarato} registrati. Finché lo scarto resta, la distribuzione non si può confermare.
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose} disabled={inCorso !== null}>
          Annulla
        </Button>
      </div>
    </Modal>
  )
}

/**
 * Una delle due risposte, con l'esito numerico già scritto: la scelta si fa guardando i
 * numeri che resteranno, non immaginandoli.
 */
function Scelta({
  titolo,
  descrizione,
  esito,
  disabilitata,
  motivoDisabilitata,
  inCorso,
  bloccata,
  onClick,
}: {
  titolo: string
  descrizione: string
  esito: { magazzino: number; laboratorio: number; totale: number }
  disabilitata: boolean
  motivoDisabilitata?: string
  inCorso: boolean
  bloccata: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabilitata || bloccata}
      className="surface-interactive w-full rounded-heemia-lg border border-heemia-border bg-white px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-none"
    >
      <p className="text-sm font-medium text-heemia-black">{inCorso ? 'Salvataggio…' : titolo}</p>
      <p className="mt-0.5 text-sm text-heemia-grey">{descrizione}</p>
      <p className="font-mono-heemia mt-2 text-xs text-heemia-black">
        magazzino {esito.magazzino} · laboratorio {esito.laboratorio} · totale {esito.totale}
      </p>
      {motivoDisabilitata && <p className="mt-1 text-xs text-heemia-carmine">{motivoDisabilitata}</p>}
    </button>
  )
}
