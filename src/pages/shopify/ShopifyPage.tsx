import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { LoadingState } from '../../components/ui/States'
import { StatusBadge } from '../../lib/statusBadge'
import { formatCurrency, formatDateIt } from '../../lib/format'
import { useDataStore } from '../../context/DataStore'
import { useGoatAlert } from '../../context/GoatAlertContext'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'
import { useServerShopify } from '../../hooks/useServerShopify'

// FR-17. Da qui si fanno le tre cose che l'integrazione permette (DEC-009 bidirezionale):
// leggere Shopify, scriverci le giacenze, portare dentro gli ordini. Le divergenze si
// vedono e si risolvono una per una: DEC-027 dice che nei conflitti vince il dato Shopify,
// **ma che la divergenza non si risolve mai in silenzio** — perciò l'allineamento è un
// pulsante, non un effetto della sincronizzazione.

function quandoLeggibile(iso: string | null): string {
  if (!iso) return 'mai'
  return new Date(iso).toLocaleString('it-IT')
}

export function ShopifyPage() {
  const { products, orders, customers } = useDataStore()
  const { stato, divergenze, caricamento, errore, riconcilia, pubblicaGiacenze, importaOrdini, allinea } =
    useServerShopify()
  const { avvisa } = useGoatAlert()
  const { role } = useRole()
  const [inCorso, setInCorso] = useState<string | null>(null)
  const shopifyOrders = orders.filter((o) => o.canale === 'shopify')
  const modificabile = canEdit(role)

  /** Ogni azione parla con Shopify: l'esito va detto, e un errore non deve restare muto. */
  async function esegui(nome: string, azione: () => Promise<string>) {
    if (inCorso) return
    setInCorso(nome)
    try {
      avvisa('generico', { titolo: 'Fatto', testo: await azione() })
    } catch (e) {
      avvisa('salvataggio', {
        testo: e instanceof Error ? e.message : 'Operazione non riuscita per un errore imprevisto.',
      })
    } finally {
      setInCorso(null)
    }
  }

  return (
    <div>
      <Card className="mb-6">
        <CardHeader
          title="Collegamento con il negozio online"
          subtitle="Letture, scritture e ordini passano dal server: il token della custom app non arriva mai al browser."
          action={stato.configurato ? <Badge variant="success">Collegato</Badge> : <Badge variant="info">Da collegare</Badge>}
        />
        {caricamento ? (
          <LoadingState rows={2} />
        ) : (
          <div className="p-5">
            {!stato.configurato && (
              <p className="mb-4 rounded-heemia-sm border border-heemia-border bg-heemia-surface px-3 py-2 text-xs text-heemia-grey">
                {stato.nota ??
                  'Mancano le credenziali della custom app Shopify. Finché non ci sono, i pulsanti qui sotto rispondono spiegando quale variabile serve: nessuna operazione viene eseguita a metà.'}
              </p>
            )}
            {errore && <p className="mb-4 text-sm text-heemia-carmine">{errore}</p>}

            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { etichetta: 'Pubblicati', valore: stato.pubblicati },
                { etichetta: 'Non pubblicati', valore: stato.nonPubblicati },
                { etichetta: 'Divergenze', valore: stato.divergenzeStock },
              ].map((k) => (
                <div key={k.etichetta} className="rounded-heemia border border-heemia-border bg-heemia-surface px-3 py-2">
                  <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">{k.etichetta}</p>
                  <p className="font-display text-xl text-heemia-black">{k.valore}</p>
                </div>
              ))}
              <div className="rounded-heemia border border-heemia-border bg-heemia-surface px-3 py-2">
                <p className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Ultima sincronia</p>
                <p className="text-xs text-heemia-black">{quandoLeggibile(stato.ultimaRiconciliazione)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!modificabile || inCorso !== null}
                onClick={() =>
                  esegui('sync', async () => {
                    const e = await riconcilia()
                    return `${e.abbinate} varianti abbinate, ${e.divergenze.length} divergenze, ${e.soloSuShopify.length} presenti solo su Shopify e ${e.soloInHeemia.length} solo qui.`
                  })
                }
              >
                {inCorso === 'sync' ? 'Lettura in corso…' : 'Leggi da Shopify'}
              </Button>
              <Button
                variant="secondary"
                disabled={!modificabile || inCorso !== null}
                onClick={() =>
                  esegui('push', async () => {
                    const e = await pubblicaGiacenze()
                    return e.scritte === 0 ? (e.nota ?? 'Niente da scrivere.') : `${e.scritte} giacenze scritte su Shopify.`
                  })
                }
              >
                {inCorso === 'push' ? 'Scrittura in corso…' : 'Pubblica le giacenze'}
              </Button>
              <Button
                variant="secondary"
                disabled={!modificabile || inCorso !== null}
                onClick={() =>
                  esegui('ordini', async () => {
                    const e = await importaOrdini()
                    const coda = e.righeSenzaCorrispondenza.length
                      ? ` ${e.righeSenzaCorrispondenza.length} righe hanno uno SKU che qui non esiste.`
                      : ''
                    return `Dal ${e.dal}: ${e.creati} ordini nuovi, ${e.aggiornati} aggiornati su ${e.letti} letti.${coda}`
                  })
                }
              >
                {inCorso === 'ordini' ? 'Import in corso…' : 'Importa gli ordini'}
              </Button>
            </div>
            <p className="mt-3 text-[11px] text-heemia-grey">
              «Leggi da Shopify» aggiorna quantità pubblicate e stato dei capi, e segnala le differenze: non
              cambia le giacenze del magazzino. Quelle si allineano una per una qui sotto.
            </p>
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Divergenza stock interno vs Shopify"
          subtitle="Nei conflitti vince il dato Shopify (DEC-027), ma la correzione resta un gesto esplicito: lascia un movimento di magazzino."
        />
        {divergenze.length === 0 ? (
          <p className="p-5 text-sm text-heemia-grey">
            {stato.ultimaRiconciliazione ? 'Nessuna divergenza rilevata.' : 'Nessuna lettura ancora eseguita.'}
          </p>
        ) : (
          <ul className="divide-y divide-heemia-border">
            {divergenze.map((d) => (
              <li key={d.variantId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-mono-heemia text-xs text-heemia-black">{d.sku}</p>
                  <p className="mt-0.5 text-xs text-heemia-grey">
                    {d.capo} · {d.taglia} · {d.colore}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="critical">
                    Interno {d.interno} · Shopify {d.shopify}
                  </Badge>
                  <Button
                    variant="secondary"
                    disabled={!modificabile || inCorso !== null}
                    onClick={() =>
                      esegui(d.variantId, async () => {
                        const e = await allinea(d.variantId)
                        return `${e.sku}: magazzino ${e.precedente} → ${e.nuovo}.`
                      })
                    }
                  >
                    Allinea a Shopify
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-6">
        <CardHeader title="Stato pubblicazione prodotti" subtitle="Letto da Shopify a ogni sincronizzazione." />
        <ul className="divide-y divide-heemia-border">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <Link to={`/prodotti/${p.id}`} className="font-display text-heemia-black hover:underline">
                {p.nome}
              </Link>
              <StatusBadge status={p.statoPubblicazioneShopify} />
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Ordini canale Shopify" />
        {shopifyOrders.length === 0 ? (
          <p className="p-5 text-sm text-heemia-grey">Nessun ordine importato dal canale Shopify.</p>
        ) : (
          <ul className="divide-y divide-heemia-border">
            {shopifyOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <div>
                  <p className="font-mono-heemia text-xs text-heemia-black">{o.numero}</p>
                  <p className="mt-0.5 text-xs text-heemia-grey">
                    {customers.find((c) => c.id === o.customerId)?.nome ?? 'Cliente non collegato'} ·{' '}
                    {formatDateIt(o.data)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono-heemia">{formatCurrency(o.totale)}</span>
                  <StatusBadge status={o.stato} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
