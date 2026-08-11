import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { apriVisita, type VisitaCliente } from './showroomClient'
import { TITOLARE } from '../../lib/azienda'

// Accesso alla vista cliente (spec §4): nome, cognome, email, consenso al trattamento
// (obbligatorio) e consenso marketing (separato e facoltativo), con l'informativa
// consultabile prima di entrare. I dati finiscono in anagrafica clienti come contatto
// showroom; l'accesso resta registrato con data e ora.

const inputClass =
  'w-full rounded-heemia border border-heemia-border px-3 py-2 text-sm transition-all duration-200 ease-heemia focus:border-heemia-black focus:outline-none focus:ring-2 focus:ring-heemia-black/10'

/**
 * Dati identificativi del titolare del trattamento. **Completi dal 2026-08-11** (OQ-25
 * chiusa): ragione sociale, sede con CAP, partita IVA e indirizzo di contatto arrivano
 * tutti da Giulia — inventarli in un documento che leggono clienti veri non era un'opzione,
 * ed è il motivo per cui il segnaposto qui sotto è rimasto in piedi fino ad allora.
 *
 * Se un domani cambiano, alza anche `INFORMATIVA_VERSIONE` sul server
 * (`server/src/modules/showroom/service.ts`): la versione viene registrata su ogni visita,
 * così resta scritto quale testo ha letto ciascun cliente.
 */
// I dati del titolare vivono in lib/azienda.ts: servono anche all'import delle fatture
// elettroniche, e due copie della stessa partita IVA prima o poi divergono.

/** Campo del titolare, o un segnaposto che si vede, se non è ancora stato compilato. */
function datoTitolare(valore: string, etichetta: string) {
  return valore.trim() || `[${etichetta} da inserire]`
}

/**
 * Informativa mostrata al cliente prima dell'accesso (art. 13 GDPR). Il contenuto descrive
 * esattamente ciò che l'applicazione fa: i dati elencati sono le colonne che salviamo
 * davvero (`showroom_visits`, `showroom_product_views`, `showroom_favorites`,
 * `showroom_requests`, contatto in `customers`), né più né meno. Se un domani si raccoglie
 * un dato in più, questo testo va aggiornato **insieme** al codice che lo raccoglie.
 *
 * I tempi di conservazione sono **confermati da Giulia il 2026-08-11** (OQ-25 chiusa,
 * DEC-057): 24 mesi dall'ultimo contatto per contatto, accessi, capi visti e preferiti;
 * 24 mesi per le richieste che non diventano ordine; 10 anni per ciò che è legato a ordini
 * e documenti fiscali (obbligo di legge); consenso marketing fino a revoca. Cambiarli qui
 * significa cambiare una promessa già fatta ai clienti che hanno letto questa versione:
 * si alza anche `INFORMATIVA_VERSIONE` sul server, così resta scritto chi ha letto cosa.
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
        <p className="font-display text-lg text-heemia-black">Informativa sul trattamento dei dati personali</p>
        <p className="font-mono-heemia mt-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey-light">
          Art. 13 Regolamento UE 2016/679 (GDPR) · aggiornata ad agosto 2026
        </p>
        <div className="mt-4 space-y-3 text-xs leading-relaxed text-heemia-grey">
          <p>
            <strong className="text-heemia-black">Titolare del trattamento.</strong>{' '}
            {datoTitolare(TITOLARE.ragioneSociale, 'ragione sociale')}, con sede in{' '}
            {datoTitolare(TITOLARE.sedeLegale, 'sede legale')}, P. IVA{' '}
            {datoTitolare(TITOLARE.partitaIva, 'partita IVA')}. Per qualsiasi richiesta relativa ai
            tuoi dati puoi scrivere a {datoTitolare(TITOLARE.email, 'indirizzo e-mail')}.
          </p>

          <p>
            <strong className="text-heemia-black">Quali dati trattiamo.</strong> Per l'accesso al
            catalogo: <em>nome, cognome e indirizzo e-mail</em>, insieme a data e ora dell'accesso.
            Durante la visita registriamo i <em>capi che apri</em> e quelli che metti tra i{' '}
            <em>preferiti</em>. Se ci invii una richiesta di informazioni o di personalizzazione,
            conserviamo anche ciò che ci comunichi: taglia di partenza, <em>misure personali</em>,
            colore e lunghezza desiderati, modifiche richieste, note, data desiderata e le eventuali{' '}
            <em>immagini di riferimento</em> che alleghi. Se la richiesta si trasforma in un ordine,
            conserviamo i dati dell'ordine (numero, capo, importo, appuntamento).
          </p>

          <p>
            <strong className="text-heemia-black">Perché li trattiamo, e con quale base giuridica.</strong>
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              Gestire la tua visita, risponderti e preparare l'eventuale capo su misura: esecuzione
              di misure precontrattuali e del contratto richiesto da te (art. 6.1.b GDPR). Il
              conferimento di nome, cognome ed e-mail è necessario per accedere; misure, note e
              immagini sono facoltative e servono solo a lavorare meglio la tua richiesta.
            </li>
            <li>
              Adempiere agli obblighi contabili e fiscali, se l'ordine viene confermato: obbligo di
              legge (art. 6.1.c GDPR).
            </li>
            <li>
              Inviarti novità e inviti agli eventi: solo con il tuo <em>consenso</em> separato e
              facoltativo (art. 6.1.a GDPR), che puoi revocare in qualsiasi momento senza
              conseguenze sul resto del rapporto.
            </li>
          </ul>

          <p>
            <strong className="text-heemia-black">Per quanto tempo li conserviamo.</strong> Contatto,
            accessi, capi visti e preferiti: 24 mesi dall'ultimo contatto con te. Richieste che non
            si concludono in un ordine: 24 mesi dalla chiusura della richiesta. Dati legati a ordini
            e documenti fiscali: 10 anni, come impone la legge. Consenso marketing: fino alla tua
            revoca. Alla scadenza i dati vengono cancellati o resi anonimi.
          </p>

          <p>
            <strong className="text-heemia-black">Chi può accedervi.</strong> Le persone di Heemia
            che seguono lo showroom e la produzione, ciascuna limitatamente a ciò che le serve. I
            dati sono conservati su server nell'Unione Europea (Francoforte) del fornitore che
            ospita l'applicazione, che tratta i dati come responsabile per nostro conto; essendo una
            società con sede negli Stati Uniti, non si può escludere un accesso dall'estero per
            sola assistenza tecnica, regolato da clausole contrattuali standard. Non vendiamo né
            diffondiamo i tuoi dati a nessuno.
          </p>

          <p>
            <strong className="text-heemia-black">Nessuna decisione automatica.</strong> Non c'è
            profilazione né alcuna decisione presa da un sistema automatico: i capi che apri e i
            preferiti servono soltanto a chi ti segue in showroom per arrivare preparato.
          </p>

          <p>
            <strong className="text-heemia-black">I tuoi diritti.</strong> Puoi chiedere in ogni
            momento accesso, rettifica, cancellazione, limitazione e portabilità dei tuoi dati,
            opporti al trattamento e revocare il consenso marketing, scrivendo all'indirizzo del
            titolare indicato sopra. Se ritieni che il trattamento violi la normativa puoi proporre
            reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).
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
