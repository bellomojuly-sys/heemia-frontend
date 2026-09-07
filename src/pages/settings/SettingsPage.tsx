import { useState } from 'react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { IntegrationsCard } from '../../components/settings/IntegrationsCard'
import { ChangePasswordCard } from '../../components/settings/ChangePasswordCard'
import { PermissionMatrix } from '../../components/settings/PermissionMatrix'
import { canWrite, ROLE_LABELS } from '../../lib/permissions'
import { useMarginThreshold } from '../../hooks/useMarginThreshold'
import { useRole } from '../../context/RoleContext'
import { useGoatAlert } from '../../context/GoatAlertContext'
import { isGoatSoundMuto, playGoatBleat, setGoatSoundMuto } from '../../lib/goatSound'

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

      {/* Sta in cima e vale per tutti i ruoli: la pagina Utenti è degli amministratori,
          la propria password è di chiunque abbia un accesso. */}
      <ChangePasswordCard />

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
            disabled={!canWrite(role, 'impostazioni')}
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

      <PermissionMatrix />
    </div>
  )
}
