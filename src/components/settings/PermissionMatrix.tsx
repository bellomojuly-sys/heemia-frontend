import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader } from '../ui/Card'
import { Button } from '../ui/Button'
import { LoadingState } from '../ui/States'
import { useServerPermissions, type VoceMatrice } from '../../hooks/useServerPermissions'
import { useAuth } from '../../context/AuthContext'
import { ApiError } from '../../lib/api'
import { AZIONE_LABELS, ROLE_LABELS, type Azione, type ModuleKey, type PermessiModulo } from '../../lib/permissions'
import type { Role } from '../../types'

/**
 * La matrice ruolo × modulo, **modificabile**.
 *
 * Fino a ieri questa tabella era un promemoria: mostrava ✓ e – letti da una costante nel
 * codice del client, e cambiare un permesso voleva dire modificare due file (client e
 * server) e ripubblicare. Ora è una schermata di amministrazione vera: le spunte si
 * cliccano, si salvano in `role_permissions` e **chiudono davvero gli endpoint** —
 * `core/guards.ts` legge questa matrice a ogni richiesta.
 *
 * Quattro dettagli che decidono se una schermata così è usabile o pericolosa:
 *
 *   1. **Si salva quando si dice**, non a ogni clic. Cambiare venti caselle sarebbe
 *      altrimenti venti salvataggi e venti stati intermedi, alcuni dei quali chiudono
 *      fuori qualcuno per un istante.
 *   2. **Si vede cosa è cambiato** prima di salvare: le celle modificate sono evidenziate
 *      e il conteggio sta sul pulsante.
 *   3. **Visualizza è il presupposto**: togliendola cadono anche le altre tre, perché
 *      scrivere in un modulo che non si vede non significa niente. Il server rifiuta
 *      comunque quella combinazione; qui non la si costruisce nemmeno.
 *   4. **Alcune caselle non si toccano**: un amministratore non può togliersi Impostazioni
 *      né Utenti, che sono le due schermate da cui si rimedia a un permesso sbagliato.
 */
export function PermissionMatrix() {
  const { dati, bloccati, caricamento, errore, salva, ripristina } = useServerPermissions()
  const { ricaricaPermessi } = useAuth()
  // Modifiche in sospeso, chiave `ruolo::modulo`. Vuoto = niente da salvare.
  const [bozza, setBozza] = useState<Map<string, PermessiModulo>>(new Map())
  const [inCorso, setInCorso] = useState(false)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const [erroreSalvataggio, setErroreSalvataggio] = useState<string | null>(null)

  // Una matrice ricaricata da fuori (o il ripristino) rende obsolete le modifiche in
  // sospeso: tenerle significherebbe salvare sopra dati che non si sono più visti.
  useEffect(() => { setBozza(new Map()) }, [dati?.matrice])

  const chiave = (role: Role, moduleKey: ModuleKey) => `${role}::${moduleKey}`

  const valore = (role: Role, moduleKey: ModuleKey): PermessiModulo | null => {
    const sospeso = bozza.get(chiave(role, moduleKey))
    if (sospeso) return sospeso
    return dati?.matrice[role]?.[moduleKey] ?? null
  }

  const modificata = (role: Role, moduleKey: ModuleKey) => bozza.has(chiave(role, moduleKey))

  const alterna = (role: Role, moduleKey: ModuleKey, azione: Azione) => {
    const attuale = valore(role, moduleKey)
    if (!attuale) return
    const nuovo: PermessiModulo = { ...attuale, [azione]: !attuale[azione] }
    // Togliere «Visualizza» toglie tutto il resto: un modulo che non si vede non si può
    // né creare né modificare né svuotare, e lasciare le spunte accese darebbe
    // l'impressione di un permesso che il server rifiuterebbe.
    if (azione === 'vedere' && !nuovo.vedere) {
      nuovo.creare = false
      nuovo.modificare = false
      nuovo.eliminare = false
    }
    // Accendere una scrittura accende anche la lettura: è il presupposto, non un extra.
    if (azione !== 'vedere' && nuovo[azione]) nuovo.vedere = true

    setBozza((m) => {
      const nuova = new Map(m)
      const originale = dati?.matrice[role]?.[moduleKey]
      const uguale =
        originale &&
        originale.vedere === nuovo.vedere &&
        originale.creare === nuovo.creare &&
        originale.modificare === nuovo.modificare &&
        originale.eliminare === nuovo.eliminare
      // Tornare al valore di partenza toglie la voce dalla bozza: «2 modifiche» deve
      // contare le differenze vere, non i clic.
      if (uguale) nuova.delete(chiave(role, moduleKey))
      else nuova.set(chiave(role, moduleKey), nuovo)
      return nuova
    })
  }

  const voci: VoceMatrice[] = useMemo(
    () =>
      [...bozza.entries()].map(([k, permessi]) => {
        const [role, moduleKey] = k.split('::')
        return { role: role as Role, moduleKey: moduleKey as ModuleKey, permessi }
      }),
    [bozza],
  )

  const applica = async () => {
    setInCorso(true)
    setErroreSalvataggio(null)
    setMessaggio(null)
    try {
      const esito = await salva(voci)
      setBozza(new Map())
      // I permessi di chi sta salvando possono essere cambiati adesso: senza rileggerli,
      // l'interfaccia continuerebbe a nascondere o mostrare secondo la matrice di prima e
      // la modifica sembrerebbe non aver preso.
      await ricaricaPermessi()
      setMessaggio(
        esito.cambiate === 0
          ? 'Nessun permesso è cambiato.'
          : `${esito.cambiate} ${esito.cambiate === 1 ? 'permesso aggiornato' : 'permessi aggiornati'}.`,
      )
    } catch (e) {
      setErroreSalvataggio(e instanceof ApiError ? e.message : 'Salvataggio non riuscito.')
    } finally {
      setInCorso(false)
    }
  }

  const azzera = async () => {
    setInCorso(true)
    setErroreSalvataggio(null)
    setMessaggio(null)
    try {
      const esito = await ripristina()
      await ricaricaPermessi()
      setMessaggio(
        esito.rimosse === 0
          ? 'La matrice era già quella predefinita.'
          : `Matrice riportata ai valori predefiniti (${esito.rimosse} personalizzazioni rimosse).`,
      )
    } catch (e) {
      setErroreSalvataggio(e instanceof ApiError ? e.message : 'Ripristino non riuscito.')
    } finally {
      setInCorso(false)
    }
  }

  if (caricamento) {
    return (
      <Card>
        <CardHeader title="Matrice ruolo × modulo" />
        <LoadingState rows={5} />
      </Card>
    )
  }

  if (errore) {
    return (
      <Card>
        <CardHeader title="Matrice ruolo × modulo" />
        <p className="p-5 text-sm text-heemia-carmine">{errore}</p>
      </Card>
    )
  }

  if (!dati) {
    return (
      <Card>
        <CardHeader
          title="Matrice ruolo × modulo"
          subtitle="Solo un amministratore può leggerla e modificarla."
        />
        <p className="p-5 text-sm text-heemia-grey">
          Il tuo ruolo non ha accesso alla configurazione dei permessi. Chiedi a un amministratore.
        </p>
      </Card>
    )
  }

  // Il ruolo showroom non è un utente del gestionale ma lo scope della sub-app cliente,
  // che vive su un prefisso API separato e senza login: mostrarne una colonna vuota
  // suggerirebbe che si possano dargli permessi interni.
  const ruoli = dati.ruoli.filter((r) => r !== 'showroom')

  return (
    <Card>
      <CardHeader
        title="Matrice ruolo × modulo"
        subtitle="Chi vede cosa e chi può scrivere. Le modifiche valgono davvero: il server controlla questa matrice a ogni richiesta, non solo l'interfaccia."
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => void azzera()} disabled={inCorso}>
              Ripristina predefiniti
            </Button>
            <Button onClick={() => void applica()} disabled={inCorso || voci.length === 0}>
              {inCorso
                ? 'Salvataggio…'
                : voci.length === 0
                  ? 'Nessuna modifica'
                  : `Salva ${voci.length} ${voci.length === 1 ? 'modifica' : 'modifiche'}`}
            </Button>
          </div>
        }
      />

      {(messaggio || erroreSalvataggio) && (
        <p
          className={`border-b border-heemia-border px-5 py-2.5 text-sm ${
            erroreSalvataggio ? 'text-heemia-carmine' : 'text-heemia-green'
          }`}
        >
          {erroreSalvataggio ?? messaggio}
        </p>
      )}

      <div className="overflow-x-auto p-5">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-heemia-border-strong">
              <th className="font-mono-heemia py-2 pr-4 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-heemia-grey">
                Modulo
              </th>
              {ruoli.map((r) => (
                <th
                  key={r}
                  colSpan={dati.azioni.length}
                  className="border-l border-heemia-border px-3 py-2 text-center text-[11px] font-medium text-heemia-black"
                >
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
            <tr className="border-b border-heemia-border">
              <th />
              {ruoli.flatMap((r) =>
                dati.azioni.map((a, i) => (
                  <th
                    key={`${r}-${a}`}
                    title={AZIONE_LABELS[a]}
                    className={`px-1.5 py-1.5 text-center font-mono-heemia text-[9px] font-normal uppercase tracking-[0.04em] text-heemia-grey ${
                      i === 0 ? 'border-l border-heemia-border' : ''
                    }`}
                  >
                    {AZIONE_LABELS[a].slice(0, 3)}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {dati.moduli.map((modulo) => (
              <tr key={modulo.chiave} className="border-b border-heemia-border last:border-0">
                <td className="py-1.5 pr-4 text-heemia-black">{modulo.etichetta}</td>
                {ruoli.flatMap((r) =>
                  dati.azioni.map((a, i) => {
                    const permessi = valore(r, modulo.chiave)
                    const motivoBlocco = bloccati.get(`${r}::${modulo.chiave}::${a}`)
                    const attivo = permessi?.[a] ?? false
                    return (
                      <td
                        key={`${r}-${modulo.chiave}-${a}`}
                        className={`px-1.5 py-1.5 text-center ${i === 0 ? 'border-l border-heemia-border' : ''} ${
                          modificata(r, modulo.chiave) ? 'bg-heemia-blue-light' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={attivo}
                          disabled={Boolean(motivoBlocco) || inCorso}
                          onChange={() => alterna(r, modulo.chiave, a)}
                          aria-label={`${AZIONE_LABELS[a]} · ${modulo.etichetta} · ${ROLE_LABELS[r]}`}
                          title={motivoBlocco ?? `${AZIONE_LABELS[a]} · ${modulo.etichetta} · ${ROLE_LABELS[r]}`}
                          className="h-3.5 w-3.5 accent-heemia-black disabled:opacity-40"
                        />
                      </td>
                    )
                  }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1 border-t border-heemia-border px-5 py-3 text-[11px] text-heemia-grey">
        <p>
          <strong className="font-medium text-heemia-black">Vis</strong> apre la pagina,{' '}
          <strong className="font-medium text-heemia-black">Cre</strong> permette di aggiungere,{' '}
          <strong className="font-medium text-heemia-black">Mod</strong> di correggere,{' '}
          <strong className="font-medium text-heemia-black">Eli</strong> di cancellare. Senza «Vis» le altre tre non
          hanno effetto e vengono spente da sole.
        </p>
        <p>
          Le caselle grigie non si possono togliere: sono quelle da cui un amministratore rientra dopo un permesso
          tolto per sbaglio. «Ripristina predefiniti» rimette la matrice come nasce nel codice.
        </p>
        <p>
          Il ruolo <em>Cliente showroom</em> non compare: non è un utente del gestionale ma lo scope della vista
          cliente, che vive su un'API separata e senza accesso.
        </p>
      </div>
    </Card>
  )
}
