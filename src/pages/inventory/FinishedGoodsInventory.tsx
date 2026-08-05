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
import { getStockOverview } from '../../lib/dashboard'
import type { InventoryRecord } from '../../types'
import { useMockStore } from '../../context/MockStore'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'

export function FinishedGoodsInventory() {
  const { role } = useRole()
  const {
    inventoryRecords, productVariants, products, updateVariantQuantities,
    transferStock, loadStockMovements, caricamento,
  } = useMockStore()
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
      // Magazzino + laboratorio: sono entrambe giacenze di capi finiti, quindi entrambe
      // vendibili. Non è modificabile perché è la somma delle due colonne accanto.
      accessor: (r) => (
        <div>
          <p className="font-mono-heemia text-sm text-heemia-black">{r.disponibileTotale}</p>
          {r.qtaInProduzione > 0 && (
            <p className="font-mono-heemia text-[10px] text-heemia-grey">{r.disponibileReale} liberi</p>
          )}
        </div>
      ),
    },
    {
      header: 'Magazzino',
      align: 'right',
      // Modificabile: aggiorna anche la variante del prodotto (stessa fonte, updateVariantQuantities).
      accessor: (r) =>
        userCanEdit ? (
          <input
            type="number"
            min="0"
            value={r.qtaMagazzino}
            onChange={(e) => updateVariantQuantities(r.variantId, { qtaMagazzino: Math.max(0, Number(e.target.value) || 0) })}
            className={qtyInputClass}
            aria-label={`Magazzino ${r.variantId}`}
          />
        ) : (
          r.qtaMagazzino
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
          <button
            type="button"
            onClick={() => setLabDetail(r)}
            title="Apri il dettaglio del laboratorio"
            className="font-mono-heemia rounded-heemia-sm border border-heemia-border px-2 py-1 text-sm text-heemia-black transition-all duration-200 ease-heemia hover:border-heemia-black hover:shadow-heemia-xs"
          >
            {r.qtaLaboratorio}
            {r.qtaInProduzione > 0 && <span className="ml-1 text-[10px] text-heemia-grey">({r.qtaInProduzione} in produzione)</span>}
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
          <input
            type="number"
            min="0"
            value={r.sogliaMinimaLaboratorio}
            onChange={(e) => updateVariantQuantities(r.variantId, { sogliaMinimaLaboratorio: Math.max(0, Number(e.target.value) || 0) })}
            className={qtyInputClass}
            aria-label={`Soglia laboratorio ${r.variantId}`}
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
          <input
            type="number"
            min="0"
            value={r.qtaRiservata}
            onChange={(e) => updateVariantQuantities(r.variantId, { qtaRiservata: Math.max(0, Number(e.target.value) || 0) })}
            className={qtyInputClass}
            aria-label={`Riservato ${r.variantId}`}
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
        <KpiTile label="In produzione" value={stock.inProduzione} tooltip="Capi mandati in lavorazione: sono ancora in laboratorio, ma non piu disponibili per altro." />
        <KpiTile label="Da reintegrare" value={stock.daReintegrare} critical={stock.daReintegrare > 0} tooltip="Varianti con la scorta di laboratorio sotto soglia." />
        <KpiTile label="Esaurito" value={stock.esaurito} critical={stock.esaurito > 0} />
      </div>

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
          onSubmit={(quantita, note) =>
            transferStock(trasferimento.record.variantId, trasferimento.direzione, quantita, note)
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
