import { useState } from 'react'
import { Card, CardHeader } from '../ui/Card'
import { Button } from '../ui/Button'
import { Field, campoClass } from '../ui/Modal'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { useGoatAlert } from '../../context/GoatAlertContext'
import { cambiaPropriaPassword, PASSWORD_MIN } from '../../hooks/useServerUsers'

/**
 * Cambio della propria password (2026-08-12). Sta in Impostazioni generali e non nella
 * pagina Utenti, perché vale per **qualunque ruolo**: la pagina Utenti è degli admin, questa
 * riquadro è di chiunque abbia un accesso, viewer compreso.
 *
 * Chiede la password attuale di proposito: un portatile lasciato aperto non deve bastare a
 * prendersi l'account di qualcun altro.
 */
export function ChangePasswordCard() {
  const { avvisa } = useGoatAlert()
  const [attuale, setAttuale] = useState('')
  const [nuova, setNuova] = useState('')
  const [conferma, setConferma] = useState('')

  const { errori, inCorso, submit, pulisci } = useFormSubmit<'attuale' | 'nuova' | 'conferma'>(
    () => ({
      attuale: attuale ? undefined : 'Serve la password attuale.',
      nuova: !nuova
        ? 'Serve la nuova password.'
        : nuova.length < PASSWORD_MIN
          ? `Servono almeno ${PASSWORD_MIN} caratteri (ora ne ha ${nuova.length}).`
          : nuova === attuale
            ? 'La nuova password deve essere diversa da quella attuale.'
            : undefined,
      conferma: conferma === nuova ? undefined : 'Le due password non coincidono.',
    }),
    async () => {
      const esito = await cambiaPropriaPassword(attuale, nuova)
      setAttuale('')
      setNuova('')
      setConferma('')
      avvisa('generico', {
        titolo: 'Password cambiata',
        testo:
          esito.altreSessioniTerminate > 0
            ? `Fatto. Le altre ${esito.altreSessioniTerminate} sessioni aperte con la vecchia password sono state chiuse; questa resta valida.`
            : 'Fatto. Questa sessione resta valida: non devi rientrare.',
      })
    },
  )

  return (
    <Card className="mb-6">
      <CardHeader
        title="La tua password"
        subtitle="Cambiala quando vuoi. Le altre sessioni aperte con la vecchia password vengono chiuse; questa resta."
      />
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
        <Field label="Password attuale" required error={errori.attuale}>
          <input
            className={campoClass(errori.attuale)}
            type="password"
            autoComplete="current-password"
            value={attuale}
            onChange={(e) => { setAttuale(e.target.value); pulisci('attuale') }}
          />
        </Field>
        <Field label="Nuova password" required error={errori.nuova} hint={`Almeno ${PASSWORD_MIN} caratteri.`}>
          <input
            className={campoClass(errori.nuova)}
            type="password"
            autoComplete="new-password"
            value={nuova}
            onChange={(e) => { setNuova(e.target.value); pulisci('nuova') }}
          />
        </Field>
        <Field label="Ripeti la nuova" required error={errori.conferma}>
          <input
            className={campoClass(errori.conferma)}
            type="password"
            autoComplete="new-password"
            value={conferma}
            onChange={(e) => { setConferma(e.target.value); pulisci('conferma') }}
          />
        </Field>
      </div>
      <div className="flex justify-end border-t border-heemia-border px-5 py-3">
        <Button onClick={() => void submit()} disabled={inCorso}>
          {inCorso ? 'Salvataggio…' : 'Cambia password'}
        </Button>
      </div>
    </Card>
  )
}
