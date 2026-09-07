import { useEffect, useState } from 'react'
import { KeyRound, Trash2, UserPlus } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState, LoadingState } from '../../components/ui/States'
import { Field, FormActions, Modal, campoClass, fieldClass } from '../../components/ui/Modal'
import { useFormSubmit, regole } from '../../hooks/useFormSubmit'
import {
  useServerUsers, PASSWORD_MIN, type UtenteApp, type VerificaEliminazioneUtente,
} from '../../hooks/useServerUsers'
import { ApiError } from '../../lib/api'
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
  const { utenti, caricamento, errore, crea, aggiorna, reimpostaPassword, verificaEliminazione, elimina } = useServerUsers()
  const { user } = useAuth()
  const [nuovo, setNuovo] = useState(false)
  const [daReimpostare, setDaReimpostare] = useState<UtenteApp | null>(null)
  const [daEliminare, setDaEliminare] = useState<UtenteApp | null>(null)
  // Quanti amministratori attivi restano: serve a spegnere il pulsante sull'ultimo, prima
  // che il server lo rifiuti. Il controllo vero resta suo — questo evita il gesto inutile.
  const adminAttivi = utenti.filter((u) => u.role === 'admin' && u.attivo).length

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
                  const ultimoAdmin = (x: UtenteApp) => x.role === 'admin' && x.attivo && adminAttivi <= 1
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
                          <button
                            type="button"
                            disabled={sonoIo || ultimoAdmin(u)}
                            title={
                              sonoIo
                                ? 'Non puoi eliminare il tuo stesso account'
                                : ultimoAdmin(u)
                                  ? "È l'ultimo amministratore attivo: nominane un altro prima di eliminarlo"
                                  : `Elimina ${u.nome}`
                            }
                            aria-label={`Elimina ${u.nome}`}
                            onClick={() => setDaEliminare(u)}
                            className="rounded-heemia-sm border border-transparent p-1.5 text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-carmine/40 hover:bg-heemia-carmine-light/60 hover:text-heemia-carmine disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-heemia-grey"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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
            Disattivare un utente lo fa uscire subito: le sue sessioni aperte cadono all'istante, non alla scadenza,
            e tutte le sue firme restano. <strong className="font-medium text-heemia-black">Eliminare</strong> è
            un'altra cosa: le operazioni che ha firmato nell'activity log e nei movimenti di magazzino restano
            registrate, ma diventano anonime. Nella maggior parte dei casi la scelta giusta è disattivare; eliminare
            serve per un account creato per sbaglio o per un doppione. Il proprio account e l'ultimo amministratore
            attivo non si eliminano: lo impedisce il server, non solo questo pulsante.
          </p>
        </div>
      </Card>

      {nuovo && (
        <NuovoUtenteModal
          onClose={() => setNuovo(false)}
          onSubmit={async (dati) => { await crea(dati) }}
        />
      )}

      {daEliminare && (
        <EliminaUtenteModal
          utente={daEliminare}
          verifica={verificaEliminazione}
          onClose={() => setDaEliminare(null)}
          onConferma={(confermaStorico) => elimina(daEliminare.id, confermaStorico)}
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

/**
 * Conferma di eliminazione di un utente.
 *
 * Prima chiede al server cosa comporta (`deletion-check`) e mostra tre casi distinti:
 *
 *   • **bloccato** — il proprio account o l'ultimo amministratore attivo: si spiega perché
 *     e non si offre nessun pulsante che verrebbe respinto;
 *   • **con storico** — l'account ha firmato operazioni: si dice quante diventano anonime e
 *     serve una spunta esplicita, perché disattivare è quasi sempre la scelta giusta;
 *   • **pulito** — un account che non ha mai fatto niente: si elimina e basta.
 *
 * Il server rifà comunque tutti i controlli: fra la conferma a schermo e il clic un altro
 * amministratore può essere stato disattivato.
 */
function EliminaUtenteModal({
  utente,
  verifica,
  onClose,
  onConferma,
}: {
  utente: UtenteApp
  verifica: (id: string) => Promise<VerificaEliminazioneUtente>
  onClose: () => void
  onConferma: (confermaStorico: boolean) => Promise<void>
}) {
  const [esito, setEsito] = useState<VerificaEliminazioneUtente | null>(null)
  const [erroreVerifica, setErroreVerifica] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [confermato, setConfermato] = useState(false)

  useEffect(() => {
    let annullato = false
    verifica(utente.id)
      .then((v) => { if (!annullato) setEsito(v) })
      .catch((e) => { if (!annullato) setErroreVerifica(e instanceof Error ? e.message : 'Verifica non riuscita') })
    return () => { annullato = true }
  }, [verifica, utente.id])

  const { inCorso, submit } = useFormSubmit(
    () => ({}),
    async () => {
      setErrore(null)
      try {
        await onConferma(confermato)
        onClose()
      } catch (e) {
        setErrore(e instanceof ApiError ? e.message : "Non è stato possibile eliminare l'utente.")
        throw e
      }
    },
  )

  const bloccatoDaConferma = Boolean(esito?.haStorico && !confermato)

  return (
    <Modal title={`Elimina ${utente.nome}`} subtitle={utente.email} onClose={onClose}>
      {!esito && !erroreVerifica && <p className="text-sm text-heemia-grey">Controllo cosa ha firmato questo account…</p>}
      {erroreVerifica && <p className="text-sm text-heemia-carmine">{erroreVerifica}</p>}

      {esito && !esito.eliminabile && (
        <div className="space-y-3 text-sm">
          <p className="text-heemia-black">Questo account non si può eliminare:</p>
          <ul className="list-disc space-y-1 pl-5 text-heemia-grey">
            {esito.blocchi.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
      )}

      {esito?.eliminabile && (
        <div className="space-y-3 text-sm">
          <p className="text-heemia-black">L'eliminazione è definitiva. Ecco cosa comporta:</p>
          <ul className="list-disc space-y-1 pl-5 text-heemia-grey">
            {esito.avvertenze.map((a) => <li key={a}>{a}</li>)}
          </ul>
          <p className="text-heemia-grey">{esito.alternativa}</p>

          {esito.haStorico && (
            <label className="flex items-start gap-2 rounded-heemia-sm border border-heemia-carmine/30 bg-heemia-carmine-light px-3 py-2 text-heemia-black">
              <input
                type="checkbox"
                checked={confermato}
                onChange={(e) => setConfermato(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-heemia-carmine"
              />
              <span className="text-[13px] leading-snug">
                Ho letto che le firme di {esito.nome} diventeranno anonime, e voglio eliminare comunque l'account.
              </span>
            </label>
          )}

          {errore && <p className="text-heemia-carmine">{errore}</p>}
        </div>
      )}

      <FormActions>
        <Button variant="secondary" onClick={onClose} disabled={inCorso}>Annulla</Button>
        {esito?.eliminabile && (
          <Button
            onClick={() => void submit()}
            disabled={inCorso || bloccatoDaConferma}
            title={bloccatoDaConferma ? 'Serve la conferma qui sopra.' : undefined}
            className="border-heemia-carmine bg-heemia-carmine text-white hover:border-heemia-carmine hover:bg-heemia-carmine/90 disabled:opacity-40"
          >
            {inCorso ? 'Eliminazione…' : 'Elimina definitivamente'}
          </Button>
        )}
      </FormActions>
    </Modal>
  )
}
