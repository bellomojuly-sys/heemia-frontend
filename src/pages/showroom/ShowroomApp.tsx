import { useState } from 'react'
import { ImagePlaceholder } from '../../components/ui/ImagePlaceholder'
import { Button } from '../../components/ui/Button'
import { formatCurrency } from '../../lib/format'
import { products, showroomClients } from '../../mock'

// FR-29: sub-app separata, login proprio, nessun accesso al gestionale interno.
// Fuori da AppLayout/RoleGuard/NAV_GROUPS di proposito — non è raggiungibile dalla sidebar.
// Scope: solo catalogo capi pronti (visibileShowroom). Il catalogo "abiti su misura" richiesto
// da FR-29 non ha un modello dati nel prototipo — vedi 00_Index/Open_Questions.md.
export function ShowroomApp() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [entered, setEntered] = useState(false)

  const matchedClient = showroomClients.find((c) => c.email.toLowerCase() === email.trim().toLowerCase())
  const catalog = products.filter((p) => p.visibileShowroom)

  if (!entered) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-heemia-cream px-4">
        <div className="w-full max-w-sm rounded-[3px] border border-heemia-border bg-white p-9 text-center">
          <p className="font-display text-2xl italic text-heemia-black">Heemia Showroom</p>
          <p className="mt-2 mb-7 text-xs text-heemia-grey">Accesso riservato ai clienti in visita: nessun dato interno visibile.</p>
          <form
            className="space-y-3 text-left"
            onSubmit={(e) => {
              e.preventDefault()
              setEntered(true)
            }}
          >
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome e cognome"
              className="w-full rounded-[3px] border border-heemia-border px-3 py-2 text-sm focus:border-heemia-black focus:outline-none"
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-[3px] border border-heemia-border px-3 py-2 text-sm focus:border-heemia-black focus:outline-none"
            />
            <Button type="submit" className="w-full py-2.5 text-center">
              Entra nel catalogo
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-heemia-cream">
      <header className="border-b border-heemia-border bg-heemia-black px-8 py-6 text-white">
        <p className="font-display text-xl italic">Heemia Showroom</p>
        <p className="font-mono-heemia mt-1 text-[10px] uppercase tracking-[0.1em] text-white/50">
          {matchedClient ? `Bentornato, ${matchedClient.nome}` : `Benvenuto, ${name || 'ospite'}`}
        </p>
      </header>

      <main className="px-8 py-8">
        <h1 className="font-display mb-1 text-2xl italic text-heemia-black">Catalogo capi pronti</h1>
        <p className="mb-7 text-sm text-heemia-grey">Prezzi showroom. Il catalogo abiti su misura non è ancora disponibile in questo prototipo.</p>

        {catalog.length === 0 ? (
          <p className="text-sm text-heemia-grey">Nessun capo disponibile per la visualizzazione showroom al momento.</p>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {catalog.map((p) => (
              <div key={p.id} className="rounded-[3px] border border-heemia-border bg-white p-4">
                <ImagePlaceholder label={p.nome} className="mb-3 h-40 w-full text-3xl" />
                <p className="font-display italic text-heemia-black">{p.nome}</p>
                <p className="mb-2 text-xs text-heemia-grey">{p.categoria} · {p.taglieDisponibili.join(', ')}</p>
                <p className="font-mono-heemia text-heemia-black">{formatCurrency(p.prezzoShowroom)}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
