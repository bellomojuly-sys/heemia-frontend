import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { EmptyState } from '../ui/States'
import { raggruppaAzioni, type AzioneRichiesta } from '../../lib/azioni'

// Backlog "Note" §9. Una sola sezione, poche categorie, e ogni riga scritta come una frase
// leggibile: cosa manca (titolo), perché (motivo), su quale capo (prodotto), cosa fare
// (pulsante). L'urgenza resta affidata all'intensità del carminio, come nel resto dell'app:
// nessun colore nuovo fuori palette (UI_Design_System.md).
const LIVELLO_DOT: Record<AzioneRichiesta['livello'], string> = {
  critico: 'bg-heemia-carmine',
  attenzione: 'bg-heemia-carmine/45',
  info: 'bg-heemia-grey-light',
}

const LIVELLO_LABEL: Record<AzioneRichiesta['livello'], string> = {
  critico: 'Critico',
  attenzione: 'Da controllare',
  info: 'Informativo',
}

export function AzioniRichieste({
  azioni,
  vuotoTitolo = 'Nessuna azione richiesta',
  vuotoDescrizione = 'Non ci sono segnalazioni aperte per i moduli visibili a questo ruolo.',
}: {
  azioni: AzioneRichiesta[]
  vuotoTitolo?: string
  vuotoDescrizione?: string
}) {
  const gruppi = raggruppaAzioni(azioni)

  if (gruppi.length === 0) {
    return <EmptyState title={vuotoTitolo} description={vuotoDescrizione} />
  }

  return (
    <div className="animate-fade-in space-y-5">
      {gruppi.map((g) => (
        <section key={g.id}>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="font-display text-sm font-medium text-heemia-black">{g.label}</h3>
            <span className="font-mono-heemia text-[11px] text-heemia-grey">{g.azioni.length}</span>
          </div>
          <ul className="divide-y divide-heemia-border overflow-hidden rounded-heemia-lg border border-heemia-border bg-white">
            {g.azioni.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${LIVELLO_DOT[a.livello]}`}
                  title={LIVELLO_LABEL[a.livello]}
                />
                {/* `min-w-[14rem]`: sotto questa larghezza il pulsante va a capo invece di
                    spremere il testo in una colonna di due parole (verificato a 375px). */}
                <div className="min-w-[14rem] flex-1">
                  <p className="text-sm font-medium text-heemia-black">{a.titolo}</p>
                  <p className="mt-0.5 text-sm text-heemia-grey">{a.motivo}</p>
                  {a.prodotto && (
                    <p className="mt-1 text-xs text-heemia-grey">
                      Prodotto:{' '}
                      <Link to={a.prodotto.link} className="font-display text-heemia-black hover:underline">
                        {a.prodotto.nome}
                      </Link>
                    </p>
                  )}
                </div>
                {a.link && (
                  <Link
                    to={a.link}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-heemia-sm border border-heemia-border-strong bg-white px-3 py-1.5 text-xs font-medium text-heemia-black transition-all duration-200 ease-heemia hover:border-heemia-black hover:shadow-heemia-sm active:scale-[0.96] active:duration-75"
                  >
                    {a.azione}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
