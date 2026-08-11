import { useCallback, useEffect, useState } from 'react'
import { Card, CardHeader } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { api, ApiError } from '../../lib/api'
import { useRole } from '../../context/RoleContext'

// Stato delle integrazioni esterne (Fase 15.1). Legge `/integrations/status`, che finora
// esisteva sul server e non lo guardava nessuno: la stessa informazione arrivava solo a
// chi premeva un pulsante e riceveva un errore.
//
// Cosa mostra, e cosa NON mostra: quali credenziali risultano presenti **sul server che
// sta girando davvero** e i nomi di quelle mancanti. Mai un valore: una schermata che
// stampa una chiave è una chiave che finisce in uno screenshot.

interface StatoIntegrazione {
  chiave: string
  nome: string
  scopo: string
  configurato: boolean
  variabiliMancanti: string[]
  riferimento: string
}

export function IntegrationsCard() {
  const { role } = useRole()
  const [stato, setStato] = useState<StatoIntegrazione[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [provaInCorso, setProvaInCorso] = useState(false)
  const [esitoProva, setEsitoProva] = useState<{ ok: boolean; testo: string } | null>(null)

  const carica = useCallback(async () => {
    try {
      const r = await api.get<{ integrazioni: StatoIntegrazione[] }>('/integrations/status')
      setStato(r.integrazioni)
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Stato delle integrazioni non disponibile.')
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  const gmail = stato?.find((i) => i.chiave === 'gmail')
  // La prova manda posta davvero: stesso limite di ruolo dell'endpoint, che comunque
  // rifiuta per conto suo se qualcuno ci arriva da un'altra strada.
  const puoProvare = (role === 'admin' || role === 'ceo') && gmail?.configurato

  async function provaGmail() {
    setProvaInCorso(true)
    setEsitoProva(null)
    try {
      const r = await api.post<{ destinatario: string }>('/integrations/gmail/test')
      setEsitoProva({ ok: true, testo: `Email di prova inviata a ${r.destinatario}. Controlla la casella.` })
    } catch (e) {
      setEsitoProva({ ok: false, testo: e instanceof ApiError ? e.message : 'Invio non riuscito.' })
    } finally {
      setProvaInCorso(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Integrazioni esterne"
        subtitle="Quali servizi sono collegati a questo server. Finché una credenziale manca, la funzione che la usa lo dice e non fa finta di aver funzionato."
      />
      <div className="p-5">
        {errore && <p className="text-sm text-heemia-carmine">{errore}</p>}
        {!stato && !errore && <p className="text-sm text-heemia-grey">Lettura dello stato…</p>}

        {stato && (
          <ul className="space-y-3">
            {stato.map((i) => (
              <li key={i.chiave} className="rounded-heemia border border-heemia-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-heemia-black">{i.nome}</span>
                  <Badge variant={i.configurato ? 'success' : 'neutral'}>
                    {i.configurato ? 'Collegata' : 'Da collegare'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-heemia-grey">{i.scopo}</p>
                {!i.configurato && (
                  <p className="font-mono-heemia mt-2 text-[11px] text-heemia-grey">
                    Manca: {i.variabiliMancanti.join(', ')} · {i.riferimento}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {gmail && (
          <div className="mt-4 border-t border-heemia-border pt-4">
            <p className="text-xs text-heemia-grey">
              {gmail.configurato
                ? "La prova manda un'email all'indirizzo aziendale stesso: nessun fornitore viene contattato."
                : 'La prova d\'invio si attiva quando le credenziali Google sono state inserite.'}
            </p>
            <button
              type="button"
              disabled={!puoProvare || provaInCorso}
              onClick={() => void provaGmail()}
              className="mt-2 rounded-heemia-sm border border-heemia-border-strong px-3 py-1.5 text-xs text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-black hover:bg-heemia-surface hover:text-heemia-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {provaInCorso ? 'Invio in corso…' : 'Invia email di prova'}
            </button>
            {esitoProva && (
              <p className={`mt-2 text-xs ${esitoProva.ok ? 'text-heemia-green' : 'text-heemia-carmine'}`}>
                {esitoProva.testo}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
