import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, ArrowRight, History, X } from 'lucide-react'
import { KpiTile } from '../../components/dashboard/KpiTile'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import { StatusBadge } from '../../lib/statusBadge'
import { Badge } from '../../components/ui/Badge'
import { StockTransferModal, type TransferDirezione } from '../../components/inventory/StockTransferModal'
import { StockMovementsModal } from '../../components/inventory/StockMovementsModal'
import { LabDetailModal } from '../../components/inventory/LabDetailModal'
import {
  MigrationDistributionModal, type ModalitaMigrazione, type UbicazioneMigrazione,
} from '../../components/inventory/MigrationDistributionModal'
import { RefillSuggestions } from '../../components/inventory/RefillSuggestions'
import { Button } from '../../components/ui/Button'
import { QuantitaInput } from '../../components/ui/QuantitaInput'
import { getStockOverview } from '../../lib/dashboard'
import type { InventoryRecord } from '../../types'
import { useDataStore } from '../../context/DataStore'
import { useRole } from '../../context/RoleContext'
import { useGoatAlert } from '../../context/GoatAlertContext'
import { ApiError } from '../../lib/api'
import { canEdit } from '../../lib/permissions'

export function FinishedGoodsInventory() {
  const { role } = useRole()
  const {
    inventoryRecords, productVariants, products, updateVariantQuantities,
    transferStock, loadStockMovements, sistemaDistribuzione, confermaDistribuzione, caricamento,
  } = useDataStore()
  const { avvisa } = useGoatAlert()
  const userCanEdit = canEdit(role)
  const stock = getStockOverview(inventoryRecords)

  // Backlog "Note" §7: i KPI "Riservati al laboratorio" e "In magazzino" della dashboard
  // aprono questa pagina già ristretta alle sole varianti che hanno pezzi in quell'ubicazione.
  const [searchParams, setSearchParams] = useSearchParams()
  const vista = searchParams.get('vista')
  const righe = useMemo(() => {
    if (vista === 'laboratorio') return inventoryRecords.filter((r) => r.qtaLaboratorio > 0)
    if (vista === 'magazzino') return inventoryRecords.filter((r) => r.qtaMagazzino > 0)
    return inventoryRecords
  }, [inventoryRecords, vista])
  const vistaLabel = vista === 'laboratorio' ? 'Solo capi in laboratorio' : vista === 'magazzino' ? 'Solo capi in magazzino' : null

  const [trasferimento, setTrasferimento] = useState<{ record: InventoryRecord; direzione: TransferDirezione } | null>(null)
  const [storico, setStorico] = useState<InventoryRecord | null>(null)
  const [labDetail, setLabDetail] = useState<InventoryRecord | null>(null)
  // Distribuzione iniziale (FR-49): la quantità appena digitata aspetta qui finché non si
  // dice cosa significa — capi già compresi nel totale o capi mai contati.
  const [distribuzione, setDistribuzione] = useState<
    { record: InventoryRecord; ubicazione: UbicazioneMigrazione; quantita: number } | null
  >(null)

  const daMigrare = righe.filter((r) => !r.migrazioneCompletata)
  const daReintegrare = righe.filter((r) => r.reintegro)

  /** La conferma può essere rifiutata dal server (distribuzione che non torna): si dice perché. */
  const conferma = async (r: InventoryRecord) => {
    try {
      await confermaDistribuzione(r.variantId)
    } catch (e) {
      avvisa('salvataggio', {
        testo: e instanceof ApiError ? e.message : 'Non è stato possibile confermare la distribuzione.',
      })
    }
  }

  /**
   * Ogni modifica di quantità passa di qui: attende il server e, se il salvataggio viene
   * rifiutato, lo dice. Prima le scritture partivano senza `await` e senza `catch`: un
   * rifiuto (sessione scaduta, backend irraggiungibile, quantità non ammessa) spariva in
   * una promise non gestita e il numero tornava indietro da solo, senza spiegazioni.
   */
  const salva = async (azione: Promise<unknown>, ricaduta: string) => {
    try {
      await azione
    } catch (e) {
      avvisa('salvataggio', { testo: e instanceof ApiError ? e.message : ricaduta })
    }
  }

  /** Etichetta leggibile della variante, usata nei titoli dei modali. */
  const descrizioneVariante = (r: InventoryRecord) => {
    const v = productVariants.find((v) => v.id === r.variantId)
    const p = v ? products.find((p) => p.id === v.productId) : undefined
    return [p?.nome, v ? `${v.taglia}/${v.colore}` : undefined, v?.sku].filter(Boolean).join(' · ')
  }

  const caricaMovimenti = useCallback(
    () => loadStockMovements(storico?.variantId ?? ''),
    [loadStockMovements, storico],
  )

  const qtyInputClass =
    'font-mono-heemia w-20 rounded-heemia border border-heemia-border bg-white px-2 py-1 text-right text-sm text-heemia-black transition-all duration-200 ease-heemia focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10'

  const columns: DataTableColumn<InventoryRecord>[] = [
    {
      header: 'SKU',
      accessor: (r) => {
        const v = productVariants.find((v) => v.id === r.variantId)
        const p = v ? products.find((p) => p.id === v.productId) : undefined
        return (
          <div>
            <p className="font-mono-heemia text-[12px] text-heemia-black">{v?.sku ?? r.variantId}</p>
            <p className="font-display text-sm text-heemia-grey">{p?.nome} · {v?.taglia}/{v?.colore}</p>
          </div>
        )
      },
    },
    {
      header: 'Disponibile',
      align: 'right',
      // Magazzino + laboratorio: i capi finiti in casa, quindi vendibili. Non è
      // modificabile perché è la somma delle due colonne accanto. I capi in lavorazione
      // non sono qui dentro: sono una giacenza a sé (DEC-047) e si mostrano di fianco.
      accessor: (r) => (
        <div>
          <p className="font-mono-heemia text-sm text-heemia-black">{r.disponibileTotale}</p>
          {r.qtaInProduzione > 0 && (
            <p className="font-mono-heemia text-[10px] text-heemia-grey">+{r.qtaInProduzione} in lavorazione</p>
          )}
        </div>
      ),
    },
    {
      header: 'Magazzino',
      align: 'right',
      // Modificabile: aggiorna anche la variante del prodotto (stessa fonte, updateVariantQuantities).
      // Finché la distribuzione iniziale non è confermata il numero non si scrive di
      // filato: si digita e poi si dichiara cosa significa (FR-49).
      accessor: (r) =>
        !userCanEdit ? (
          r.qtaMagazzino
        ) : r.migrazioneCompletata ? (
          <QuantitaInput
            valore={r.qtaMagazzino}
            etichetta={`Magazzino ${r.variantId}`}
            className={qtyInputClass}
            onConferma={(qtaMagazzino) =>
              salva(
                updateVariantQuantities(r.variantId, { qtaMagazzino }),
                'Non è stato possibile aggiornare il magazzino.',
              )
            }
          />
        ) : (
          <QuantitaInput
            valore={r.qtaMagazzino}
            etichetta={`Magazzino ${r.variantId}`}
            className={qtyInputClass}
            onConferma={(quantita) => setDistribuzione({ record: r, ubicazione: 'magazzino', quantita })}
          />
        ),
    },
    {
      header: 'Laboratorio',
      align: 'right',
      // Posizione operativa da cui si preleva in produzione: cliccando si apre il
      // dettaglio con reintegri, consumi e capi in produzione.
      accessor: (r) => (
        <div className="flex items-center justify-end gap-2">
          {r.laboratorioSottoSoglia && <Badge variant="warning-outline">Da reintegrare</Badge>}
          {userCanEdit && !r.migrazioneCompletata && (
            <QuantitaInput
              valore={r.qtaLaboratorio}
              etichetta={`Laboratorio ${r.variantId}`}
              className={qtyInputClass}
              onConferma={(quantita) => setDistribuzione({ record: r, ubicazione: 'laboratorio', quantita })}
            />
          )}
          <button
            type="button"
            onClick={() => setLabDetail(r)}
            title="Apri il dettaglio del laboratorio"
            className="font-mono-heemia rounded-heemia-sm border border-heemia-border px-2 py-1 text-sm text-heemia-black transition-all duration-200 ease-heemia hover:border-heemia-black hover:shadow-heemia-xs"
          >
            {r.qtaLaboratorio}
            {/* I capi in lavorazione non sono dentro questo numero: sono usciti dal
                laboratorio e ci rientrano da terminati (DEC-047). */}
            {r.qtaInProduzione > 0 && <span className="ml-1 text-[10px] text-heemia-grey">+{r.qtaInProduzione} in lavorazione</span>}
          </button>
        </div>
      ),
    },
    {
      header: 'Soglia lab.',
      align: 'right',
      // Sotto questa quantità scatta l'alert di reintegro dal magazzino.
      accessor: (r) =>
        userCanEdit ? (
          <QuantitaInput
            valore={r.sogliaMinimaLaboratorio}
            etichetta={`Soglia laboratorio ${r.variantId}`}
            className={qtyInputClass}
            onConferma={(sogliaMinimaLaboratorio) =>
              salva(
                updateVariantQuantities(r.variantId, { sogliaMinimaLaboratorio }),
                'Non è stato possibile aggiornare la soglia di laboratorio.',
              )
            }
          />
        ) : (
          r.sogliaMinimaLaboratorio
        ),
    },
    {
      header: 'Riservato',
      align: 'right',
      accessor: (r) =>
        userCanEdit ? (
          <QuantitaInput
            valore={r.qtaRiservata}
            etichetta={`Riservato ${r.variantId}`}
            className={qtyInputClass}
            onConferma={(qtaRiservata) =>
              salva(
                updateVariantQuantities(r.variantId, { qtaRiservata }),
                'Non è stato possibile aggiornare i capi riservati.',
              )
            }
          />
        ) : (
          r.qtaRiservata
        ),
    },
    { header: 'Venduto', accessor: (r) => r.qtaVenduta, align: 'right' },
    { header: 'Soglia min.', accessor: (r) => r.sogliaMinima, align: 'right' },
    { header: 'Stato', accessor: (r) => <StatusBadge status={r.stato} /> },
    {
      header: 'Stock Shopify',
      accessor: (r) =>
        r.divergenzaShopify ? (
          <Badge variant="critical">Interno {r.disponibileTotale} · Shopify {r.stockShopify}</Badge>
        ) : (
          <span className="text-heemia-grey">{r.stockShopify} (allineato)</span>
        ),
    },
    {
      header: 'Distribuzione',
      // Stato della migrazione iniziale. A conferma avvenuta la colonna si fa da parte:
      // resta una riga di testo, non un badge che chiede attenzione ogni volta.
      accessor: (r) =>
        r.migrazioneCompletata ? (
          <span className="text-xs text-heemia-grey">Confermata</span>
        ) : (
          <div className="space-y-1">
            <Badge variant="warning-outline">Da confermare</Badge>
            <p className="font-mono-heemia text-[11px] text-heemia-grey">
              {r.totaleDistribuito} distribuiti su {r.totaleDichiarato} registrati
            </p>
            {r.differenzaMigrazione !== 0 && (
              <p className="text-[11px] text-heemia-carmine">
                {r.differenzaMigrazione > 0
                  ? `${r.differenzaMigrazione} capi in più del totale registrato.`
                  : `Mancano ${Math.abs(r.differenzaMigrazione)} capi rispetto al totale registrato.`}
              </p>
            )}
            {userCanEdit && (
              <Button
                variant="secondary"
                disabled={!r.migrazioneConfermabile}
                title={
                  r.migrazioneConfermabile
                    ? 'Chiudi la distribuzione iniziale di questa variante'
                    : 'La somma delle ubicazioni deve coincidere con il totale registrato'
                }
                onClick={() => conferma(r)}
              >
                Conferma distribuzione iniziale
              </Button>
            )}
          </div>
        ),
    },
    {
      header: 'Movimenti',
      // Il trasferimento passa da un modale con anteprima: la modifica in linea sposta
      // una quantità senza dire da dove arriva, il movimento invece resta tracciato.
      accessor: (r) => (
        <div className="flex items-center gap-1">
          {userCanEdit && (
            <>
              <IconButton
                titolo="Invia al laboratorio"
                disabled={r.qtaMagazzino <= 0}
                onClick={() => setTrasferimento({ record: r, direzione: 'to_lab' })}
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                titolo="Riporta in magazzino"
                disabled={r.qtaLaboratorio <= 0}
                onClick={() => setTrasferimento({ record: r, direzione: 'to_warehouse' })}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </IconButton>
            </>
          )}
          <IconButton titolo="Visualizza storico movimenti" onClick={() => setStorico(r)}>
            <History className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      ),
    },
  ]

  return (
    <div>
      <p className="mb-4 text-sm text-heemia-grey">Stock per variante, separato dai materiali. Le quantità sono modificabili e collegate alle varianti in Anagrafica prodotti.</p>

      <div className="mb-6 flex flex-wrap gap-3">
        <KpiTile label="Disponibile" value={stock.disponibile} tooltip="Magazzino + laboratorio: tutti i capi finiti in casa." />
        <KpiTile label="In magazzino" value={stock.inMagazzino} />
        <KpiTile label="In laboratorio" value={stock.inLaboratorio} />
        <KpiTile label="In produzione" value={stock.inProduzione} tooltip="Capi mandati in lavorazione: escono dal laboratorio e ci rientrano quando sono terminati." />
        <KpiTile label="Da reintegrare" value={stock.daReintegrare} critical={stock.daReintegrare > 0} tooltip="Varianti con la scorta di laboratorio sotto soglia." />
        <KpiTile label="Esaurito" value={stock.esaurito} critical={stock.esaurito > 0} />
      </div>

      {daMigrare.length > 0 && (
        <section className="mb-6 rounded-heemia-lg border border-heemia-border-strong bg-heemia-surface px-4 py-3">
          <h2 className="font-display text-sm font-medium text-heemia-black">
            Distribuzione iniziale da completare
            <span className="font-mono-heemia ml-2 text-[11px] text-heemia-grey">{daMigrare.length}</span>
          </h2>
          <p className="mt-1 text-sm text-heemia-grey">
            Dei capi importati si conosce solo la quantità totale, quindi risultano tutti in laboratorio. Correggi il
            magazzino variante per variante e conferma: da quel momento parte la gestione ordinaria delle scorte, con
            soglia di laboratorio e reintegri.
          </p>
        </section>
      )}

      {daReintegrare.length > 0 && (
        <RefillSuggestions
          records={daReintegrare}
          descrizione={descrizioneVariante}
          onTrasferisci={(r, quantita) =>
            salva(
              transferStock(r.variantId, 'to_lab', quantita, undefined, 'Reintegro laboratorio'),
              'Non è stato possibile reintegrare il laboratorio.',
            )
          }
          onModifica={(r) => setTrasferimento({ record: r, direzione: 'to_lab' })}
        />
      )}

      {vistaLabel && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-heemia-grey">Filtro dalla dashboard:</span>
          <button
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            className="inline-flex items-center gap-1.5 rounded-full border border-heemia-border-strong bg-white px-3 py-1 text-xs font-medium text-heemia-black transition-colors duration-200 ease-heemia hover:border-heemia-black"
          >
            {vistaLabel}
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <DataTable
        loading={caricamento} columns={columns} rows={righe} keyExtractor={(r) => r.id}
        emptyTitle="Nessuna variante"
        emptyDescription={vistaLabel ? 'Nessuna variante ha pezzi in questa ubicazione.' : 'Non ci sono varianti a magazzino.'} />

      {trasferimento && (
        <StockTransferModal
          record={trasferimento.record}
          descrizione={descrizioneVariante(trasferimento.record)}
          direzione={trasferimento.direzione}
          onClose={() => setTrasferimento(null)}
          onSubmit={(quantita, note, motivo) =>
            transferStock(trasferimento.record.variantId, trasferimento.direzione, quantita, note, motivo)
          }
        />
      )}

      {storico && (
        <StockMovementsModal
          descrizione={descrizioneVariante(storico)}
          carica={caricaMovimenti}
          onClose={() => setStorico(null)}
        />
      )}

      {distribuzione && (
        <MigrationDistributionModal
          record={distribuzione.record}
          descrizione={descrizioneVariante(distribuzione.record)}
          ubicazione={distribuzione.ubicazione}
          quantita={distribuzione.quantita}
          onClose={() => setDistribuzione(null)}
          onConferma={(modalita: ModalitaMigrazione) =>
            sistemaDistribuzione(distribuzione.record.variantId, {
              ubicazione: distribuzione.ubicazione,
              quantita: distribuzione.quantita,
              modalita,
            })
          }
        />
      )}

      {labDetail && (
        <LabDetailModal
          variantId={labDetail.variantId}
          descrizione={descrizioneVariante(labDetail)}
          canEdit={userCanEdit}
          onClose={() => setLabDetail(null)}
        />
      )}
    </div>
  )
}

function IconButton({
  titolo,
  onClick,
  disabled = false,
  children,
}: {
  titolo: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={titolo}
      aria-label={titolo}
      onClick={onClick}
      disabled={disabled}
      className="rounded-heemia-sm border border-heemia-border p-1.5 text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-black hover:text-heemia-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-heemia-border disabled:hover:text-heemia-grey"
    >
      {children}
    </button>
  )
}
