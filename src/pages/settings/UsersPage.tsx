import { useState } from 'react'
import { KeyRound, UserPlus } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState, LoadingState } from '../../components/ui/States'
import { Field, FormActions, Modal, campoClass, fieldClass } from '../../components/ui/Modal'
import { useFormSubmit, regole } from '../../hooks/useFormSubmit'
import { useServerUsers, PASSWORD_MIN, type UtenteApp } from '../../hooks/useServerUsers'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS } from '../../lib/permissions'
import type { Role } from '../../types'

// Utenti e accessi (2026-08-12). Fino a questa pagina l'unico account era quello creato dal
// seed: il team non poteva avere credenziali proprie se non scrivendo a mano sul database, e
// togliere l'accesso a qualcuno era un'operazione da database. L'autorità resta il server —
// qui si nasconde e si spiega, non si decide.

const RUOLI: Role[] = ['admin', 'ceo', 'team', 'viewer']

const DESCRIZIONE_RUOLO: Record<string, string> = {
  admin: 'Vede e modifica tutto, gestisce gli accessi.',
  ceo: 'Vede e modifica tutto, esclusa la gestione degli accessi.',
  team: 'Lavoro operativo: prodotti, produzione, inventario, ordini. Niente costi e margini.',
  viewer: 'Sola lettura sulle aree operative.',
}

function passwordDebole(v: string) {
  if (!v) return 'La password è obbligatoria.'
  return v.length < PASSWORD_MIN ? `Servono almeno ${PASSWORD_MIN} caratteri (ora ne ha ${v.length}).` : undefined
}

export function UsersPage() {
  const { utenti, caricamento, errore, crea, aggiorna, reimpostaPassword } = useServerUsers()
  const { user } = useAuth()
  const [nuovo, setNuovo] = useState(false)
  const [daReimpostare, setDaReimpostare] = useState<UtenteApp | null>(null)

  return (
    <div>
      <Card className="mb-6">
        <CardHeader
          title="Utenti e accessi"
          subtitle="Chi entra nel gestionale e con quale ruolo. Le password non sono leggibili da nessuno, nemmeno da qui: si reimpostano."
          action={
            <Button onClick={() => setNuovo(true)}>
              <UserPlus aria-hidden className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
              Nuovo utente
            </Button>
          }
        />

        {caricamento ? (
          <LoadingState rows={3} />
        ) : errore ? (
          <div className="p-5">
            <p className="text-sm text-heemia-carmine">{errore}</p>
          </div>
        ) : utenti.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nessun utente da mostrare"
              description="Se stai leggendo questo messaggio con un account amministratore, l'elenco non è arrivato dal server: ricarica la pagina."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-heemia-border text-left">
                  {['Nome', 'Email', 'Ruolo', 'Stato', 'Sessioni', ''].map((h) => (
                    <th key={h} className="font-mono-heemia px-5 py-2.5 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {utenti.map((u) => {
                  const sonoIo = u.id === user?.id
                  return (
                    <tr key={u.id} className="border-b border-heemia-border/60 last:border-0">
                      <td className="px-5 py-3 text-heemia-black">
                        {u.nome}
                        {sonoIo && <span className="ml-2 text-[11px] text-heemia-grey">(sei tu)</span>}
                      </td>
                      <td className="font-mono-heemia px-5 py-3 text-xs text-heemia-grey">{u.email}</td>
                      <td className="px-5 py-3">
                        <select
                          className={`${fieldClass} w-auto min-w-[9rem]`}
                          value={u.role}
                          // Un amministratore non può cambiare il proprio ruolo: è l'unico
                          // errore da cui non ci si riprende dall'app. Lo impedisce anche il
                          // server; qui si evita di offrire un gesto che verrebbe respinto.
                          disabled={sonoIo}
                          onChange={(e) => void aggiorna(u.id, { role: e.target.value as Role })}
                        >
                          {RUOLI.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        {u.attivo ? <Badge variant="success">Attivo</Badge> : <Badge variant="critical">Disattivato</Badge>}
                      </td>
                      <td className="font-mono-heemia px-5 py-3 text-xs text-heemia-grey">{u.sessioniAttive}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" onClick={() => setDaReimpostare(u)}>
                            <KeyRound aria-hidden className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                            Password
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={sonoIo}
                            title={sonoIo ? 'Non puoi disattivare il tuo stesso account' : undefined}
                            onClick={() => void aggiorna(u.id, { attivo: !u.attivo })}
                          >
                            {u.attivo ? 'Disattiva' : 'Riattiva'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-heemia-border px-5 py-3">
          <p className="text-[11px] text-heemia-grey">
            Disattivare un utente lo fa uscire subito: le sue sessioni aperte cadono all'istante, non alla
            scadenza. L'account non si cancella perché le sue azioni restano firmate nell'activity log e nei
            movimenti di magazzino.
          </p>
        </div>
      </Card>

      {nuovo && (
        <NuovoUtenteModal
          onClose={() => setNuovo(false)}
          onSubmit={async (dati) => { await crea(dati) }}
        />
      )}

      {daReimpostare && (
        <ReimpostaPasswordModal
          utente={daReimpostare}
          onClose={() => setDaReimpostare(null)}
          onSubmit={async (password) => { await reimpostaPassword(daReimpostare.id, password) }}
        />
      )}
    </div>
  )
}

function NuovoUtenteModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (dati: { nome: string; email: string; role: Role; password: string }) => Promise<void>
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('team')
  const [password, setPassword] = useState('')

  const { errori, inCorso, submit, pulisci } = useFormSubmit<'nome' | 'email' | 'password'>(
    () => ({
      nome: regole.obbligatorio(nome, 'Il nome'),
      email: regole.obbligatorio(email, 'L\'email') ?? regole.email(email),
      password: passwordDebole(password),
    }),
    async () => {
      await onSubmit({ nome: nome.trim(), email: email.trim(), role, password })
      onClose()
    },
  )

  return (
    <Modal
      title="Nuovo utente"
      subtitle="La password iniziale la scegli tu e gliela comunichi: chi entra può cambiarla dalle sue impostazioni."
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Nome e cognome" required error={errori.nome}>
          <input
            className={campoClass(errori.nome)}
            value={nome}
            onChange={(e) => { setNome(e.target.value); pulisci('nome') }}
            placeholder="Es. Maria Rossi"
          />
        </Field>

        <Field label="Email" required error={errori.email} hint="È anche il nome con cui accede.">
          <input
            className={campoClass(errori.email)}
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); pulisci('email') }}
            placeholder="nome@heemia.it"
          />
        </Field>

        <Field label="Ruolo" hint={DESCRIZIONE_RUOLO[role]}>
          <select className={fieldClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {RUOLI.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </Field>

        <Field
          label="Password iniziale"
          required
          error={errori.password}
          hint={`Almeno ${PASSWORD_MIN} caratteri. Una frase è più robusta e più facile da ricordare di otto simboli.`}
        >
          <input
            className={campoClass(errori.password)}
            type="text"
            value={password}
            onChange={(e) => { setPassword(e.target.value); pulisci('password') }}
            autoComplete="new-password"
          />
        </Field>
      </div>

      <FormActions>
        <Button variant="secondary" onClick={onClose} disabled={inCorso}>Annulla</Button>
        <Button onClick={() => void submit()} disabled={inCorso}>
          {inCorso ? 'Creazione…' : 'Crea utente'}
        </Button>
      </FormActions>
    </Modal>
  )
}

function ReimpostaPasswordModal({
  utente,
  onClose,
  onSubmit,
}: {
  utente: UtenteApp
  onClose: () => void
  onSubmit: (password: string) => Promise<void>
}) {
  const [password, setPassword] = useState('')

  const { errori, inCorso, submit, pulisci } = useFormSubmit<'password'>(
    () => ({ password: passwordDebole(password) }),
    async () => { await onSubmit(password); onClose() },
  )

  return (
    <Modal
      title={`Reimposta la password di ${utente.nome}`}
      subtitle="Si usa quando qualcuno la dimentica. La password attuale non serve — e non è leggibile da nessuna parte."
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field
          label="Nuova password"
          required
          error={errori.password}
          hint={`Almeno ${PASSWORD_MIN} caratteri. Comunicagliela di persona, non per email.`}
        >
          <input
            className={campoClass(errori.password)}
            type="text"
            value={password}
            onChange={(e) => { setPassword(e.target.value); pulisci('password') }}
            autoComplete="new-password"
          />
        </Field>
        <p className="rounded-heemia-sm border border-heemia-border bg-heemia-surface px-3 py-2 text-[11px] text-heemia-grey">
          Tutte le sessioni aperte di {utente.nome} verranno chiuse: dovrà rientrare con la password nuova.
        </p>
      </div>

      <FormActions>
        <Button variant="secondary" onClick={onClose} disabled={inCorso}>Annulla</Button>
        <Button onClick={() => void submit()} disabled={inCorso}>
          {inCorso ? 'Reimpostazione…' : 'Reimposta password'}
        </Button>
      </FormActions>
    </Modal>
  )
}
