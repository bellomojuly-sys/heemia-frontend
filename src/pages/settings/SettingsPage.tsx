import { useState } from 'react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { IntegrationsCard } from '../../components/settings/IntegrationsCard'
import { NAV_GROUPS } from '../../components/layout/nav'
import { canAccessModule, canEdit, ROLE_LABELS, type ModuleKey } from '../../lib/permissions'
import { useMarginThreshold } from '../../hooks/useMarginThreshold'
import { useRole } from '../../context/RoleContext'
import { useGoatAlert } from '../../context/GoatAlertContext'
import { isGoatSoundMuto, playGoatBleat, setGoatSoundMuto } from '../../lib/goatSound'
import type { Role } from '../../types'

const ROLES: Role[] = ['admin', 'ceo', 'team', 'viewer']
// Le voci fuse nella sidebar restano moduli distinti per il controllo accessi: la matrice
// deve mostrarle anche quando non hanno più una voce di navigazione autonoma.
const NESTED_MODULES: { label: string; path: string; moduleKey: ModuleKey }[] = [
  { label: 'Richieste showroom', path: '/ordini/showroom', moduleKey: 'richieste-showroom' },
  { label: 'Shopify', path: '/ordini/shopify', moduleKey: 'shopify' },
  { label: 'Scadenze', path: '/fatture/scadenze', moduleKey: 'scadenze' },
  { label: 'Report economici', path: '/margini/report', moduleKey: 'report' },
  { label: 'Activity log', path: '/impostazioni/log', moduleKey: 'activity-log' },
  { label: 'Bolle e lavorazioni', path: '/fornitori/lavorazioni', moduleKey: 'lavorazioni' },
]
const ALL_ITEMS = [...NAV_GROUPS.flatMap((g) => g.items), ...NESTED_MODULES]

export function SettingsPage() {
  const MARGIN_THRESHOLD_PERCENT = useMarginThreshold()
  const { role } = useRole()
  const { avvisa } = useGoatAlert()
  // Letto una sola volta all'apertura pagina: se lo si cambiasse da un'altra scheda
  // aperta, questa non se ne accorgerebbe finché non viene ricaricata — coerente col
  // resto delle preferenze del prototipo, che non sono sincronizzate tra schede.
  const [suonoMuto, setSuonoMuto] = useState(() => isGoatSoundMuto())

  return (
    <div>
      <IntegrationsCard />

      <Card className="mb-6">
        <CardHeader title="Ruolo attivo" subtitle="Deciso dal server in base all'utente con cui hai fatto accesso: non si cambia dall'app." />
        <div className="p-5">
          <Badge variant="info">{ROLE_LABELS[role]}</Badge>
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Avvisi della capretta"
          subtitle="Il popup che segnala azioni bloccate (dati mancanti, salvataggi falliti, spostamenti non consentiti…)."
        />
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <label className="flex items-center gap-2 text-sm text-heemia-black">
            <input
              type="checkbox"
              checked={!suonoMuto}
              onChange={(e) => {
                const attivo = e.target.checked
                setSuonoMuto(!attivo)
                setGoatSoundMuto(!attivo)
                if (attivo) playGoatBleat()
              }}
              className="h-3.5 w-3.5 accent-heemia-black"
            />
            Verso della capretta a ogni avviso
          </label>
          <button
            type="button"
            onClick={() => avvisa('generico', { titolo: 'Prova avviso', testo: 'È così che si presenta un avviso della capretta.' })}
            className="rounded-heemia-sm border border-heemia-border-strong px-3 py-1.5 text-xs text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-black hover:bg-heemia-surface hover:text-heemia-black active:scale-95"
          >
            Prova un avviso
          </button>
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
            className="font-mono-heemia w-24 rounded-heemia border border-heemia-border bg-heemia-surface px-3 py-1.5 text-sm text-heemia-black"
          />
          <span className="ml-2 text-sm text-heemia-grey">%</span>
          <p className="mt-2 text-xs text-heemia-grey">
            Valore letto dalle impostazioni del server, non da questa pagina: oggi si modifica solo lato
            server, ed è il motivo per cui il campo è in sola lettura.
          </p>
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
