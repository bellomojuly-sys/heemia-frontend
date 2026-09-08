import { useCallback, useEffect, useState } from 'react'
import { Card, CardHeader } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { api, ApiError } from '../../lib/api'
import { useRole } from '../../context/RoleContext'

// Account OpenAI dell'azienda (2026-09-09).
//
// Il problema che questa schermata risolve non è tecnico ma di proprietà: la chiave che fa
// funzionare le letture AI era legata a un account personale, mentre l'abbonamento, il
// credito e la responsabilità sono dell'azienda. Da qui la CEO (o un amministratore)
// incolla la chiave dell'account aziendale una volta sola; da quel momento tutto il team
// usa le funzioni AI con i permessi Heemia che ha già, senza account OpenAI personali.
//
// Cosa NON fa, di proposito: non mostra mai la chiave. Arrivano dal server solo la
// provenienza, le ultime quattro lettere, chi l'ha collegata e quando. Il campo è di tipo
// password e si svuota dopo il salvataggio: una chiave che resta scritta a schermo è una
// chiave che finisce in uno screenshot.

interface StatoOpenAi {
  origine: 'app' | 'ambiente' | 'assente'
  configurata: boolean
  suffisso: string | null
  aggiornataIl: string | null
  impostataDa: string | null
  modello: string
}

function quando(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })
}

export function OpenAiKeyCard() {
  const { role } = useRole()
  const puoCollegare = role === 'admin' || role === 'ceo'

  const [stato, setStato] = useState<StatoOpenAi | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [chiave, setChiave] = useState('')
  const [inCorso, setInCorso] = useState<'salvo' | 'provo' | 'tolgo' | null>(null)
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null)

  const carica = useCallback(async () => {
    try {
      setStato(await api.get<StatoOpenAi>('/integrations/openai'))
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : "Stato dell'account OpenAI non disponibile.")
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  async function collega() {
    setInCorso('salvo')
    setEsito(null)
    try {
      // Il server prova la chiave con una richiesta minima PRIMA di salvarla: se questa
      // risposta arriva, l'AI funziona davvero — non è solo "scritto a database".
      const r = await api.put<StatoOpenAi>('/integrations/openai', { apiKey: chiave.trim() })
      setStato(r)
      setChiave('')
      setEsito({ ok: true, testo: `Account OpenAI collegato e verificato sul modello ${r.modello}. Le funzioni AI sono attive per tutto il team.` })
    } catch (e) {
      setEsito({ ok: false, testo: e instanceof ApiError ? e.message : 'Collegamento non riuscito.' })
    } finally {
      setInCorso(null)
    }
  }

  async function prova() {
    setInCorso('provo')
    setEsito(null)
    try {
      const r = await api.post<{ modello: string }>('/integrations/openai/test')
      setEsito({ ok: true, testo: `Risposta ricevuta da OpenAI sul modello ${r.modello}: l'account è attivo e ha credito.` })
    } catch (e) {
      setEsito({ ok: false, testo: e instanceof ApiError ? e.message : 'Prova non riuscita.' })
    } finally {
      setInCorso(null)
    }
  }

  async function togli() {
    setInCorso('tolgo')
    setEsito(null)
    try {
      const r = await api.del<StatoOpenAi>('/integrations/openai')
      setStato(r)
      setEsito({
        ok: true,
        testo: r.configurata
          ? "Chiave dell'app rimossa: il server è tornato a usare quella delle proprie variabili d'ambiente."
          : 'Chiave rimossa. Le funzioni AI restano spente finché non ne viene collegata un’altra.',
      })
    } catch (e) {
      setEsito({ ok: false, testo: e instanceof ApiError ? e.message : 'Rimozione non riuscita.' })
    } finally {
      setInCorso(null)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Account OpenAI dell'azienda"
        subtitle="Una chiave sola, inserita qui dalla direzione, che accende le funzioni AI per tutto il team. Nessuno deve avere un account OpenAI personale."
      />
      <div className="p-5">
        {errore && <p className="text-sm text-heemia-carmine">{errore}</p>}
        {!stato && !errore && <p className="text-sm text-heemia-grey">Lettura dello stato…</p>}

        {stato && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-heemia border border-heemia-border p-3">
              <div className="min-w-0">
                <p className="text-sm text-heemia-black">
                  {stato.origine === 'app' && 'Collegato dall’app'}
                  {stato.origine === 'ambiente' && 'Collegato dalle variabili del server'}
                  {stato.origine === 'assente' && 'Nessun account collegato'}
                </p>
                <p className="font-mono-heemia mt-1 text-[11px] text-heemia-grey">
                  {stato.suffisso ? `chiave …${stato.suffisso} · ` : ''}
                  modello {stato.modello}
                  {stato.impostataDa ? ` · inserita da ${stato.impostataDa}` : ''}
                  {stato.aggiornataIl ? ` · ${quando(stato.aggiornataIl)}` : ''}
                </p>
              </div>
              <Badge variant={stato.configurata ? 'success' : 'neutral'}>
                {stato.configurata ? 'Attivo' : 'Da collegare'}
              </Badge>
            </div>

            {puoCollegare ? (
              <div className="mt-4 border-t border-heemia-border pt-4">
                <label className="block text-xs text-heemia-grey" htmlFor="openai-api-key">
                  Chiave dell&apos;account aziendale (si crea su platform.openai.com → API keys)
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    id="openai-api-key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={chiave}
                    onChange={(e) => setChiave(e.target.value)}
                    placeholder="sk-…"
                    className="font-mono-heemia min-w-0 flex-1 rounded-heemia border border-heemia-border bg-heemia-surface px-3 py-1.5 text-sm text-heemia-black"
                  />
                  <button
                    type="button"
                    disabled={chiave.trim().length < 20 || inCorso !== null}
                    onClick={() => void collega()}
                    className="rounded-heemia-sm border border-heemia-border-strong px-3 py-1.5 text-xs text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-black hover:bg-heemia-surface hover:text-heemia-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {inCorso === 'salvo' ? 'Verifica in corso…' : stato.configurata ? 'Sostituisci la chiave' : 'Verifica e collega'}
                  </button>
                  <button
                    type="button"
                    disabled={!stato.configurata || inCorso !== null}
                    onClick={() => void prova()}
                    className="rounded-heemia-sm border border-heemia-border-strong px-3 py-1.5 text-xs text-heemia-grey transition-all duration-200 ease-heemia hover:border-heemia-black hover:bg-heemia-surface hover:text-heemia-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {inCorso === 'provo' ? 'Prova in corso…' : 'Prova adesso'}
                  </button>
                  {stato.origine === 'app' && (
                    <button
                      type="button"
                      disabled={inCorso !== null}
                      onClick={() => void togli()}
                      className="rounded-heemia-sm border border-heemia-border-strong px-3 py-1.5 text-xs text-heemia-carmine transition-all duration-200 ease-heemia hover:border-heemia-carmine hover:bg-heemia-surface active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {inCorso === 'tolgo' ? 'Rimozione…' : 'Togli la chiave'}
                    </button>
                  )}
                </div>

                {esito && (
                  <p className={`mt-2 text-xs ${esito.ok ? 'text-heemia-green' : 'text-heemia-carmine'}`}>{esito.testo}</p>
                )}

                <div className="mt-4 space-y-1.5 text-xs text-heemia-grey">
                  <p>
                    La chiave viene provata con una richiesta reale <em>prima</em> di essere salvata: se il pulsante
                    conferma, le funzioni AI funzionano davvero.
                  </p>
                  <p>
                    Resta cifrata sul server e non torna mai indietro a questa schermata: qui si vedono solo le ultime
                    quattro lettere, che bastano a riconoscerla.
                  </p>
                  <p>
                    Attenzione a una cosa sola, perché sorprende tutti: l&apos;abbonamento a ChatGPT{' '}
                    <strong className="font-medium text-heemia-black">non comprende</strong> l&apos;API. Il credito è
                    separato e si ricarica su platform.openai.com → Billing. Una scheda tecnica letta dall&apos;AI costa
                    pochi centesimi.
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-heemia-grey">
                L&apos;account OpenAI lo collega la direzione (CEO o amministratore). Le funzioni AI che il tuo ruolo può
                usare funzionano da sole, senza che tu debba avere una chiave tua.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
