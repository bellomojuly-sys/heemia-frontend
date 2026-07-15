import { useMemo } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { AlertList } from '../../components/alerts/AlertList'
import { computeAlerts } from '../../lib/alerts'
import { canSeeAlertModulo } from '../../lib/permissions'
import { useRole } from '../../context/RoleContext'
import type { AlertItem } from '../../types'

const LEVEL_LABEL: Record<AlertItem['livello'], string> = { critico: 'Critici', attenzione: 'Attenzione', info: 'Info' }

export function AlertsPage() {
  const { role } = useRole()

  // Il gating per-modulo va applicato qui (non da RoleGuard): la rotta /alert è aperta
  // a team/viewer, ma alcune categorie di alert (Margini, Fatture, Scadenze…) restano
  // riservate ad Admin/CEO anche dentro questa pagina.
  const visible = useMemo(() => computeAlerts().filter((a) => canSeeAlertModulo(role, a.modulo)), [role])

  const groups: AlertItem['livello'][] = ['critico', 'attenzione', 'info']

  return (
    <div>
      <PageHeader title="Alert e notifiche" subtitle="Tutte le segnalazioni operative, prioritizzate per livello (FR-27)." />

      <div className="space-y-6">
        {groups.map((level) => {
          const items = visible.filter((a) => a.livello === level)
          if (items.length === 0) return null
          return (
            <Card key={level}>
              <CardHeader title={LEVEL_LABEL[level]} subtitle={`${items.length} segnalazioni`} />
              <div className="p-4">
                <AlertList alerts={items} />
              </div>
            </Card>
          )
        })}
        {visible.length === 0 && <AlertList alerts={[]} />}
      </div>
    </div>
  )
}
