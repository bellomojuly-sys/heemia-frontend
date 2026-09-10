// La pagina che si apre dal link ricevuto per email (DEC-071).
//
// Sta **fuori** dal gate di sessione in `AppRouter`: chi arriva qui non riesce a entrare,
// è tutto il punto. Il token viaggia nell'indirizzo perché è l'unico modo di far arrivare
// un segreto dentro un link, ma non viene mai mostrato a schermo né lasciato nella barra
// del browser dopo l'uso.
//
// La validità si controlla **all'apertura**, non al salvataggio: scoprire che il link è
// scaduto dopo aver scelto e ridigitato una password nuova è il modo più sicuro di far
// perdere la pazienza a chi è già rimasto fuori.
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'

type Stato = 'verifica' | 'valido' | 'scaduto' | 'fatto'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [stato, setStato] = useState<Stato>('verifica')
  const [password, setPassword] = useState('')
  const [conferma, setConferma] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    let annullato = false
    if (!token) {
      setStato('scaduto')
      return
    }
    void api
      .post<{ valido: boolean }>('/auth/reset-password/stato', { token })
      .then((esito) => {
        if (!annullato) setStato(esito.valido ? 'valido' : 'scaduto')
      })
      .catch(() => {
        if (!annullato) setStato('scaduto')
      })
    return () => {
      annullato = true
    }
  }, [token])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== conferma) {
      setErrore('Le due password non coincidono.')
      return
    }
    setInCorso(true)
    setErrore(null)
    try {
      await api.post('/auth/reset-password', { token, password })
      setStato('fatto')
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Reimpostazione non riuscita.')
    } finally {
      setInCorso(false)
    }
  }

  const inputClass =
    'w-full rounded-heemia border border-heemia-border bg-white px-3 py-2 text-sm text-heemia-black outline-none focus:border-heemia-black'

  return (
    <div className="flex min-h-screen items-center justify-center bg-heemia-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="wordmark text-2xl text-heemia-black">Heemia</p>
          <p className="font-mono-heemia mt-1 text-[10px] uppercase tracking-[0.18em] text-heemia-grey">
            Nuova password
          </p>
        </div>

        <div className="animate-pop rounded-heemia-xl border border-heemia-border bg-white p-6 shadow-heemia-md">
          {stato === 'verifica' && (
            <p className="text-xs text-heemia-grey">Controllo il link…</p>
          )}

          {stato === 'scaduto' && (
            <p className="text-xs leading-relaxed text-heemia-black">
              Questo link non è più valido: vale un'ora e si può usare una volta sola. Torna
              all'accesso e chiedine un altro da «Password dimenticata».
            </p>
          )}

          {stato === 'fatto' && (
            <p className="text-xs leading-relaxed text-heemia-black">
              Password cambiata. Le sessioni aperte altrove sono state chiuse: entra con la
              password nuova.
            </p>
          )}

          {stato === 'valido' && (
            <form onSubmit={submit}>
              <label className="mb-4 block">
                <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                  Nuova password
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </label>

              <label className="mb-5 block">
                <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">
                  Ripetila
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  className={inputClass}
                  value={conferma}
                  onChange={(e) => setConferma(e.target.value)}
                />
              </label>

              {errore && (
                <p role="alert" className="mb-4 animate-rise rounded-heemia border-l-2 border-heemia-carmine bg-heemia-carmine-light px-3 py-2 text-xs leading-relaxed text-heemia-black">
                  {errore}
                </p>
              )}

              <button
                type="submit"
                disabled={inCorso || !password || !conferma}
                className="w-full rounded-heemia-sm bg-heemia-black px-4 py-2 text-sm text-white shadow-heemia-xs transition-all duration-200 ease-heemia hover:bg-heemia-charcoal hover:shadow-heemia-md active:scale-[0.98] disabled:opacity-40 disabled:hover:shadow-heemia-xs disabled:active:scale-100"
              >
                {inCorso ? 'Salvataggio…' : 'Salva la nuova password'}
              </button>
            </form>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="mt-4 w-full text-center text-[11px] text-heemia-grey underline underline-offset-2 transition-colors hover:text-heemia-black"
        >
          Vai all'accesso
        </button>
      </div>
    </div>
  )
}
