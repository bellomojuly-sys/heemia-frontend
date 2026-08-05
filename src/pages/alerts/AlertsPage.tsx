import { useMemo } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { AzioniRichieste } from '../../components/alerts/AzioniRichieste'
import { useServerAlerts } from '../../hooks/useServerAlerts'
import { useMockStore } from '../../context/MockStore'
import { toAzioni } from '../../lib/azioni'

// Backlog "Note" §9: stessa lettura della dashboard, non un secondo formato. Prima questa
// pagina raggruppava per livello (Critici / Attenzione / Info) e la dashboard per modulo:
// due tassonomie diverse sugli stessi dati. Ora il raggruppamento è per tipo di azione e il
// livello resta come ordinamento dentro ogni gruppo.
export function AlertsPage() {
  // Gli alert arrivano dal server già filtrati per ruolo (canSeeAlertModulo lato API).
  const alerts = useServerAlerts()
  const { products } = useMockStore()
  const azioni = useMemo(() => toAzioni(alerts, products), [alerts, products])

  return (
    <div>
      <PageHeader
        title="Azioni richieste"
        subtitle={`Tutte le segnalazioni aperte, raggruppate per tipo. ${azioni.length} in totale.`}
      />

      <Card>
        <div className="p-4">
          <AzioniRichieste azioni={azioni} />
        </div>
      </Card>
    </div>
  )
}
