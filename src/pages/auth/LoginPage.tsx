// Fase 13 — accesso reale all'app. Sostituisce il selettore di ruolo del prototipo:
// da qui in poi il ruolo arriva dall'utente autenticato, non è più una scelta dell'interfaccia.
import { useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ApiError, api } from '../../lib/api'
import { useGoatAlert } from '../../context/GoatAlertContext'

export function LoginPage() {
  const { login, sessioneScaduta } = useAuth()
  const { avvisa } = useGoatAlert()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [dimenticata, setDimenticata] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setInCorso(true)
    setErrore(null)
    try {
      await login(email.trim(), password)
    } catch (err) {
      // Le credenziali sbagliate non devono suggerire se l'email esista: messaggio unico.
      const motivo =
        err instanceof ApiError && err.status === 401
          ? 'Email o password non corretti.'
          : err instanceof Error
            ? err.message
            : 'Accesso non riuscito.'
      setErrore(motivo)
      // Qui il messaggio in linea resta: la schermata di accesso non ha altro
      // contenuto e la ragione deve restare sotto gli occhi mentre si ridigita.
      avvisa(err instanceof ApiError && err.code === 'NETWORK' ? 'connessione' : 'permesso', { testo: motivo })
    } finally {
      setInCorso(false)
    }
  }

  const inputClass =
    'w-full rounded-heemia border border-heemia-border bg-white px-3 py-2 text-sm text-heemia-black outline-none focus:border-heemia-black'

  if (dimenticata) {
    return <PasswordDimenticata emailIniziale={email} indietro={() => setDimenticata(false)} inputClass={inputClass} />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-heemia-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="wordmark text-2xl text-heemia-black">Heemia</p>
          <p className="font-mono-heemia mt-1 text-[10px] uppercase tracking-[0.18em] text-heemia-grey">
            Gestionale interno
          </p>
        </div>

        <form onSubmit={submit} className="animate-pop rounded-heemia-xl border border-heemia-border bg-white p-6 shadow-heemia-md">
          <label className="mb-4 block">
            <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
              Email
            </span>
            <input
              type="email"
              autoComplete="username"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </label>

          <label className="mb-5 block">
            <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {/* Spiega perché si è tornati qui da soli. Sparisce appena c'è un errore di accesso. */}
          {!errore && sessioneScaduta && (
            <p className="mb-4 animate-rise rounded-heemia border-l-2 border-heemia-border bg-heemia-surface px-3 py-2 text-xs text-heemia-black">
              La sessione è scaduta. Accedi di nuovo per continuare: i dati salvati sono al sicuro.
            </p>
          )}

          {errore && (
            <p role="alert" className="mb-4 animate-rise rounded-heemia border-l-2 border-heemia-carmine bg-heemia-carmine-light px-3 py-2 text-xs text-heemia-black">
              {errore}
            </p>
          )}

          <button
            type="submit"
            disabled={inCorso || !email.trim() || !password}
            className="w-full rounded-heemia-sm bg-heemia-black px-4 py-2 text-sm text-white shadow-heemia-xs transition-all duration-200 ease-heemia hover:bg-heemia-charcoal hover:shadow-heemia-md active:scale-[0.98] disabled:opacity-40 disabled:hover:shadow-heemia-xs disabled:active:scale-100"
          >
            {inCorso ? 'Accesso in corso…' : 'Entra'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setDimenticata(true)}
          className="mt-4 w-full text-center text-[11px] text-heemia-grey underline underline-offset-2 transition-colors hover:text-heemia-black"
        >
          Password dimenticata?
        </button>

        <p className="mt-2 text-center text-[11px] text-heemia-grey">
          Se non hai ancora le credenziali, chiedile all'amministratore.
        </p>
      </div>
    </div>
  )
}

/**
 * «Password dimenticata»: si lascia l'indirizzo e arriva un link via email (DEC-071).
 *
 * Due scelte che non sono estetiche.
 *
 * La conferma è **sempre la stessa**, indirizzo noto o no: se dicesse «questa email non
 * esiste» chiunque potrebbe usare questa schermata per scoprire chi lavora in Heemia.
 *
 * Finché Gmail non è collegato il server risponde 409 e qui si legge per intero, con
 * dentro la via d'uscita — chiedere la reimpostazione a un amministratore. Una schermata
 * che dicesse «fatto» senza che nessuna email parta sarebbe peggio di una che dice di no.
 */
function PasswordDimenticata({
  emailIniziale,
  indietro,
  inputClass,
}: {
  emailIniziale: string
  indietro: () => void
  inputClass: string
}) {
  const [email, setEmail] = useState(emailIniziale)
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [conferma, setConferma] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setInCorso(true)
    setErrore(null)
    try {
      const esito = await api.post<{ ok: boolean; messaggio: string }>('/auth/forgot-password', {
        email: email.trim(),
      })
      setConferma(esito.messaggio)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Richiesta non riuscita.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-heemia-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="wordmark text-2xl text-heemia-black">Heemia</p>
          <p className="font-mono-heemia mt-1 text-[10px] uppercase tracking-[0.18em] text-heemia-grey">
            Password dimenticata
          </p>
        </div>

        <div className="animate-pop rounded-heemia-xl border border-heemia-border bg-white p-6 shadow-heemia-md">
          {conferma ? (
            <p className="text-xs leading-relaxed text-heemia-black">{conferma}</p>
          ) : (
            <form onSubmit={submit}>
              <p className="mb-4 text-xs leading-relaxed text-heemia-grey">
                Scrivi l'indirizzo con cui entri: ti mandiamo un link per scegliere una password nuova.
              </p>

              <label className="mb-5 block">
                <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                  Email
                </span>
                <input
                  type="email"
                  autoComplete="username"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </label>

              {errore && (
                <p role="alert" className="mb-4 animate-rise rounded-heemia border-l-2 border-heemia-carmine bg-heemia-carmine-light px-3 py-2 text-xs leading-relaxed text-heemia-black">
                  {errore}
                </p>
              )}

              <button
                type="submit"
                disabled={inCorso || !email.trim()}
                className="w-full rounded-heemia-sm bg-heemia-black px-4 py-2 text-sm text-white shadow-heemia-xs transition-all duration-200 ease-heemia hover:bg-heemia-charcoal hover:shadow-heemia-md active:scale-[0.98] disabled:opacity-40 disabled:hover:shadow-heemia-xs disabled:active:scale-100"
              >
                {inCorso ? 'Invio in corso…' : 'Mandami il link'}
              </button>
            </form>
          )}
        </div>

        <button
          type="button"
          onClick={indietro}
          className="mt-4 w-full text-center text-[11px] text-heemia-grey underline underline-offset-2 transition-colors hover:text-heemia-black"
        >
          Torna all'accesso
        </button>
      </div>
    </div>
  )
}
