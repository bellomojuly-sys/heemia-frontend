import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { NAV_GROUPS } from '../../components/layout/nav'
import { canAccessModule, canEdit, ROLE_LABELS } from '../../lib/permissions'
import { MARGIN_THRESHOLD_PERCENT } from '../../mock/margins'
import { useRole } from '../../context/RoleContext'
import type { Role } from '../../types'

const ROLES: Role[] = ['admin', 'ceo', 'team', 'viewer']
const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

export function SettingsPage() {
  const { role } = useRole()

  return (
    <div>
      <PageHeader title="Impostazioni" subtitle="Ruolo attivo, matrice permessi e parametri configurabili." />

      <Card className="mb-6">
        <CardHeader title="Ruolo attivo" subtitle="Selettore demo nell'header: sostituisce l'autenticazione reale in questa fase." />
        <div className="p-5">
          <Badge variant="info">{ROLE_LABELS[role]}</Badge>
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Soglia margine" subtitle="Applicata al calcolo margini di tutti i prodotti." />
        <div className="p-5">
          <input
            type="number"
            value={MARGIN_THRESHOLD_PERCENT}
            disabled={!canEdit(role)}
            readOnly
            className="font-mono-heemia w-24 rounded-[3px] border border-heemia-border bg-heemia-cream px-3 py-1.5 text-sm text-heemia-black"
          />
          <span className="ml-2 text-sm text-heemia-grey">%</span>
          <p className="mt-2 text-xs text-heemia-grey">Demo: modifica non persistita tra sessioni.</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Matrice ruolo × modulo" subtitle="Nessuna schermata è raggiungibile da un ruolo non autorizzato, nemmeno via URL diretto." />
        <div className="overflow-x-auto p-5">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="font-mono-heemia border-b border-heemia-border-strong text-left text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                <th className="py-2 pr-4 font-medium">Modulo</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-3 py-2 text-center font-medium">{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_ITEMS.map((item) => (
                <tr key={item.path} className="border-b border-heemia-border last:border-0">
                  <td className="py-2 pr-4 text-heemia-black">{item.label}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-3 py-2 text-center">
                      {canAccessModule(r, item.moduleKey) ? (
                        <span className="text-heemia-black">✓</span>
                      ) : (
                        <span className="text-heemia-grey-light">–</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
