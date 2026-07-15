import { useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../lib/statusBadge'
import { productIdeas as initialIdeas } from '../../mock'
import { useRole } from '../../context/RoleContext'
import { canEdit } from '../../lib/permissions'

// Le idee capo non hanno uno store condiviso (non toccano supplierRequests/productionSteps):
// la promozione qui è locale alla pagina, si resetta navigando via — coerente con "demo, non persistita".
export function ProductIdeas() {
  const { role } = useRole()
  const [ideas, setIdeas] = useState(initialIdeas)

  const promote = (id: string) => {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, stato: 'promossa' as const } : i)))
  }

  return (
    <div>
      <PageHeader
        title="Idee capo"
        subtitle="Inserimento idee prima che diventino prodotti — promozione a prodotto quando raggiungono 'Sviluppo modello' (FR-02)."
      />

      {ideas.length === 0 ? (
        <p className="text-sm text-heemia-grey">Nessuna idea capo registrata.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ideas.map((idea) => (
            <Card key={idea.id} className="p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="font-display text-lg italic text-heemia-black">{idea.nome}</p>
                <StatusBadge status={idea.stato} />
              </div>
              <p className="mb-3 text-sm text-heemia-black">{idea.concept}</p>
              <dl className="mb-3 grid grid-cols-2 gap-3">
                <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Materiali stimati</dt><dd className="mt-0.5 text-sm text-heemia-black">{idea.materialiStimati}</dd></div>
                <div><dt className="font-mono-heemia text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Quantità stimata</dt><dd className="font-mono-heemia mt-0.5 text-sm text-heemia-black">{idea.quantitaStimate}</dd></div>
              </dl>
              {idea.noteCreative && <p className="mb-3 text-xs italic text-heemia-grey">"{idea.noteCreative}"</p>}
              {canEdit(role) && idea.stato !== 'promossa' && (
                <Button variant="secondary" onClick={() => promote(idea.id)}>
                  Promuovi a prodotto
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
