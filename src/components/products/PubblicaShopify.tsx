import { useState } from 'react'
import { Button } from '../ui/Button'
import { api } from '../../lib/api'
import type { Product } from '../../types'

/**
 * «Pubblica su Shopify» — dal capo, non dal pannello di Shopify.
 *
 * Il capo qui dentro ha già nome, descrizione, foto, taglie, colori, composizione, prezzo e
 * giacenze: metterlo online significava riscrivere quelle stesse cose nel negozio, e da quel
 * momento esistevano due versioni dello stesso capo destinate a divergere.
 *
 * **Chi può usarlo.** Chiunque possa modificare i capi (decisione di Giulia, 2026-09-10).
 * La rotta sul server sta sotto il modulo `prodotti`, non `shopify`: pubblicare *questo*
 * capo è un gesto dell'anagrafica, mentre il modulo Shopify continua a proteggere ciò che
 * riguarda il negozio nel suo insieme — riconciliazioni, giacenze, ordini.
 *
 * **Il capo nasce in bozza su Shopify.** L'app prepara la scheda, la vetrina la apre una
 * persona. Ripetere la pubblicazione aggiorna lo stesso prodotto invece di crearne un altro:
 * l'abbinamento è lo SKU, come nel resto dell'integrazione.
 */

interface EsitoPubblicazione {
  shopifyProductId: string
  titolo: string
  handle: string
  stato: string
  creato: boolean
  varianti: number
  immaginiInviate: number
  avvisi: string[]
}

export function PubblicaShopify({
  product,
  canEdit,
  onPubblicato,
}: {
  product: Product
  canEdit: boolean
  onPubblicato?: () => void
}) {
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState<EsitoPubblicazione | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  const giaSuShopify = product.statoPubblicazioneShopify !== 'non_pubblicato'

  async function pubblica() {
    setInCorso(true)
    setErrore(null)
    setEsito(null)
    try {
      // Si aspetta la conferma del server, che a sua volta aspetta quella di Shopify:
      // un'azione esterna non è completata finché il servizio esterno non lo dice.
      const r = await api.post<EsitoPubblicazione>(`/products/${product.id}/shopify/pubblica`, {})
      setEsito(r)
      onPubblicato?.()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Pubblicazione non riuscita.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="rounded-heemia border border-heemia-border bg-heemia-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
            {giaSuShopify ? 'Sincronizza con Shopify' : 'Pubblica su Shopify'}
          </p>
          <p className="mt-1 text-xs text-heemia-grey">
            {giaSuShopify
              ? 'Riporta su Shopify nome, descrizione, foto, taglie, colori, composizione e prezzo di questo capo. Aggiorna il prodotto esistente: non ne crea un altro.'
              : 'Crea la scheda su Shopify con i dati già presenti qui. Il capo nasce in bozza: la vetrina si apre da Shopify, quando decidi tu.'}
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => void pubblica()} disabled={inCorso}>
            {inCorso ? 'Invio a Shopify…' : giaSuShopify ? 'Sincronizza con Shopify' : 'Pubblica su Shopify'}
          </Button>
        )}
      </div>

      <p className="mt-3 text-[11px] text-heemia-grey-light">
        Le giacenze non passano da qui: si scrivono dalla pagina Shopify, con «Pubblica
        giacenze», che scrive quantità assolute ed è ripetibile senza sommare.
      </p>

      {errore && <p className="mt-3 text-sm text-heemia-carmine">{errore}</p>}

      {esito && (
        <div className="mt-3 border-t border-heemia-border pt-3">
          <p className="text-sm text-heemia-black">
            {esito.creato ? 'Capo creato su Shopify' : 'Capo aggiornato su Shopify'}: «{esito.titolo}» —
            stato <span className="font-mono-heemia">{esito.stato}</span>, {esito.varianti}{' '}
            {esito.varianti === 1 ? 'variante' : 'varianti'}, {esito.immaginiInviate}{' '}
            {esito.immaginiInviate === 1 ? 'foto' : 'foto'}.
          </p>
          {esito.avvisi.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-heemia-carmine">
              {esito.avvisi.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
