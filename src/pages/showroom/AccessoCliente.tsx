import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { apriVisita, type VisitaCliente } from './showroomClient'

// Accesso alla vista cliente (spec §4): nome, cognome, email, consenso al trattamento
// (obbligatorio) e consenso marketing (separato e facoltativo), con l'informativa
// consultabile prima di entrare. I dati finiscono in anagrafica clienti come contatto
// showroom; l'accesso resta registrato con data e ora.

const inputClass =
  'w-full rounded-heemia border border-heemia-border px-3 py-2 text-sm transition-all duration-200 ease-heemia focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10'

/**
 * Informativa mostrata al cliente. I dati identificativi del titolare sono lasciati fra
 * parentesi quadre di proposito: vanno compilati con i dati reali prima di usare l'app
 * con clienti veri (OQ-25). Meglio un testo palesemente da completare che uno che sembra
 * definitivo senza esserlo.
 */
function InformativaPrivacy({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-heemia-black/50 px-4 py-10 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Informativa privacy"
        className="scroll-smooth-y max-h-full w-full max-w-lg animate-pop overflow-y-auto rounded-heemia-xl border border-heemia-border bg-white p-6 shadow-heemia-lg"
      >
        <p className="font-display text-lg text-heemia-black">Informativa sul trattamento dei dati</p>
        <div className="mt-3 space-y-3 text-xs leading-relaxed text-heemia-grey">
          <p>
            <strong className="text-heemia-black">Titolare del trattamento:</strong> Heemia —
            [ragione sociale, sede legale, P.IVA, indirizzo e-mail di contatto].
          </p>
          <p>
            <strong className="text-heemia-black">Dati raccolti:</strong> nome, cognome, indirizzo
            e-mail, data e ora dell'accesso, capi consultati e messi tra i preferiti, richieste di
            informazioni o di personalizzazione con le misure e le note che ci comunichi.
          </p>
          <p>
            <strong className="text-heemia-black">Finalità e base giuridica:</strong> gestire la tua
            visita in showroom e dare seguito alle richieste che ci invii (esecuzione di misure
            precontrattuali e contrattuali). L'invio di comunicazioni promozionali avviene solo con
            il tuo consenso separato e facoltativo, che puoi revocare in qualsiasi momento.
          </p>
          <p>
            <strong className="text-heemia-black">Conservazione:</strong> i dati restano
            nell'anagrafica clienti per il tempo necessario a gestire la richiesta e gli obblighi
            di legge conseguenti [periodo da definire].
          </p>
          <p>
            <strong className="text-heemia-black">Diritti:</strong> puoi chiedere accesso, rettifica,
            cancellazione, limitazione e portabilità dei tuoi dati, e opporti al trattamento,
            scrivendo al titolare all'indirizzo indicato sopra.
          </p>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Ho letto</Button>
        </div>
      </div>
    </div>
  )
}

export function AccessoCliente({ onEntrato }: { onEntrato: (v: VisitaCliente) => void }) {
  const [nome, setNome] = useState('')
  const [cognome, setCognome] = useState('')
  const [email, setEmail] = useState('')
  const [consensoPrivacy, setConsensoPrivacy] = useState(false)
  const [consensoMarketing, setConsensoMarketing] = useState(false)
  const [informativaAperta, setInformativaAperta] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const entra = async () => {
    if (inCorso) return
    if (!nome.trim() || !cognome.trim() || !email.trim()) {
      setErrore('Servono nome, cognome ed email per accedere al catalogo.')
      return
    }
    if (!consensoPrivacy) {
      setErrore('Per accedere serve il consenso al trattamento dei dati.')
      return
    }
    setInCorso(true)
    setErrore(null)
    try {
      // L'accesso si completa solo se il server ha registrato la visita: da lì in poi
      // ogni azione del cliente (viste, preferiti, richieste) ha un id a cui agganciarsi.
      const visita = await apriVisita({
        nome: nome.trim(),
        cognome: cognome.trim(),
        email: email.trim().toLowerCase(),
        consensoPrivacy: true,
        consensoMarketing,
      })
      onEntrato(visita)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Accesso non riuscito, riprova.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-heemia-surface px-4 py-10">
      <div className="w-full max-w-sm animate-pop rounded-heemia-xl border border-heemia-border bg-white p-9 shadow-heemia-md">
        <p className="wordmark text-center text-xl text-heemia-black">Heemia Showroom</p>
        <p className="mt-2 mb-7 text-center text-xs text-heemia-grey">
          Accesso riservato ai clienti in visita: nessun dato interno visibile.
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void entra()
          }}
        >
          <input type="text" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" className={inputClass} />
          <input type="text" required value={cognome} onChange={(e) => setCognome(e.target.value)} placeholder="Cognome" className={inputClass} />
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputClass} />

          <label className="flex items-start gap-2 pt-1 text-xs text-heemia-black">
            <input
              type="checkbox"
              checked={consensoPrivacy}
              onChange={(e) => setConsensoPrivacy(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-heemia-black"
            />
            <span>
              Acconsento al trattamento dei miei dati per la gestione della visita e delle richieste.{' '}
              <button
                type="button"
                onClick={() => setInformativaAperta(true)}
                className="underline underline-offset-2 hover:text-heemia-carmine"
              >
                Leggi l'informativa
              </button>
            </span>
          </label>

          <label className="flex items-start gap-2 text-xs text-heemia-grey">
            <input
              type="checkbox"
              checked={consensoMarketing}
              onChange={(e) => setConsensoMarketing(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-heemia-black"
            />
            <span>Voglio ricevere novità e inviti agli eventi Heemia (facoltativo).</span>
          </label>

          {errore && (
            <p role="alert" className="animate-rise rounded-heemia border-l-2 border-heemia-carmine bg-heemia-carmine-light px-3 py-2 text-xs text-heemia-black">
              {errore}
            </p>
          )}

          <Button type="submit" className="w-full py-2.5 text-center" disabled={inCorso}>
            {inCorso ? 'Accesso…' : 'Entra nel catalogo'}
          </Button>
        </form>
      </div>
      {informativaAperta && <InformativaPrivacy onClose={() => setInformativaAperta(false)} />}
    </div>
  )
}
