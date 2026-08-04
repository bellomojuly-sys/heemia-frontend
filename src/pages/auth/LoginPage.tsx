// Fase 13 — accesso reale all'app. Sostituisce il selettore di ruolo del prototipo:
// da qui in poi il ruolo arriva dall'utente autenticato, non è più una scelta dell'interfaccia.
import { useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ApiError } from '../../lib/api'

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setInCorso(true)
    setErrore(null)
    try {
      await login(email.trim(), password)
    } catch (err) {
      // Le credenziali sbagliate non devono suggerire se l'email esista: messaggio unico.
      setErrore(
        err instanceof ApiError && err.status === 401
          ? 'Email o password non corretti.'
          : err instanceof Error
            ? err.message
            : 'Accesso non riuscito.',
      )
    } finally {
      setInCorso(false)
    }
  }

  const inputClass =
    'w-full rounded-[3px] border border-heemia-border bg-white px-3 py-2 text-sm text-heemia-black outline-none focus:border-heemia-black'

  return (
    <div className="flex min-h-screen items-center justify-center bg-heemia-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl italic text-heemia-black">Heemia</p>
          <p className="font-mono-heemia mt-1 text-[10px] uppercase tracking-[0.18em] text-heemia-grey">
            Gestionale interno
          </p>
        </div>

        <form onSubmit={submit} className="rounded-[3px] border border-heemia-border bg-white p-6">
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

          {errore && (
            <p role="alert" className="mb-4 rounded-[3px] bg-heemia-bg px-3 py-2 text-xs text-heemia-black">
              {errore}
            </p>
          )}

          <button
            type="submit"
            disabled={inCorso || !email.trim() || !password}
            className="w-full rounded-[3px] bg-heemia-black px-4 py-2 text-sm text-white transition disabled:opacity-40"
          >
            {inCorso ? 'Accesso in corso…' : 'Entra'}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-heemia-grey">
          Se non hai le credenziali, chiedile all'amministratore.
        </p>
      </div>
    </div>
  )
}
