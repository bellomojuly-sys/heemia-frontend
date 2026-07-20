import { useState } from 'react'
import { ImagePlaceholder } from '../../components/ui/ImagePlaceholder'
import { Button } from '../../components/ui/Button'
import { formatCurrency } from '../../lib/format'
import { showroomClients } from '../../mock'
import { useMockStore } from '../../context/MockStore'
import { getMisureForCategoria } from '../../lib/measurements'
import type { Product } from '../../types'

// FR-29: sub-app separata, login proprio, nessun accesso al gestionale interno.
// Fuori da AppLayout/RoleGuard/NAV_GROUPS di proposito — non è raggiungibile dalla sidebar.
// Due cataloghi: capi pronti (visibileShowroom) e su misura (personalizzabileSuMisura, DEC-023):
// il cliente sceglie capo base, materiale disponibile e taglia, invia l'ordine col form; il
// contatto viene creato/collegato nell'app principale (sezione Clienti) e l'ordine registrato.
// Nessun dato interno esposto: solo nomi materiali (previsti da FR-29) e prezzi showroom.

const inputClass =
  'w-full rounded-[3px] border border-heemia-border px-3 py-2 text-sm focus:border-heemia-black focus:outline-none'

function SuMisuraForm({
  product,
  clientName,
  clientEmail,
  onClose,
  onSubmitted,
}: {
  product: Product
  clientName: string
  clientEmail: string
  onClose: () => void
  onSubmitted: (numeroOrdine: string) => void
}) {
  const { materials, customers, addCustomer, addOrder, logAction } = useMockStore()
  const [materialeId, setMaterialeId] = useState('')
  const [taglia, setTaglia] = useState('')
  const [note, setNote] = useState('')
  // Misure da prendere (estensione DEC-026, set proposto in lib/measurements.ts — da validare).
  // Facoltative: se il cliente non le conosce vengono prese in showroom alla prova.
  const misureDef = getMisureForCategoria(product.categoria)
  const [misure, setMisure] = useState<Record<string, string>>({})

  // Il cliente vede solo nome e composizione dei materiali disponibili (FR-29), niente costi o scorte.
  const availableMaterials = materials.filter((m) => m.stato === 'disponibile')
  const taglie = product.taglieDisponibili.length > 0 ? product.taglieDisponibili : ['XS', 'S', 'M', 'L', 'XL']

  const submit = () => {
    if (!materialeId || !taglia) return
    const materiale = availableMaterials.find((m) => m.id === materialeId)
    // DEC-023: il contatto è collegato all'app principale — riusa il cliente se l'email esiste,
    // altrimenti lo crea con tipologia showroom (comparirà nella sezione Clienti).
    const existing = customers.find((c) => c.email?.toLowerCase() === clientEmail.toLowerCase())
    const customer = existing ?? addCustomer({ nome: clientName, email: clientEmail, paese: 'IT', tipologia: 'showroom' })
    const numero = `SM-${Date.now().toString().slice(-5)}`
    addOrder({
      customerId: customer.id,
      numero,
      canale: 'fisico',
      stato: 'in_lavorazione',
      data: new Date().toISOString().slice(0, 10),
      totale: product.prezzoShowroom,
      prodottiIds: [product.id],
    })
    const misurePrese = misureDef
      .filter((m) => misure[m.id]?.trim())
      .map((m) => `${m.label.toLowerCase()} ${misure[m.id].trim()} cm`)
      .join(', ')
    logAction(
      'Ordine su misura showroom',
      'orders',
      numero,
      `${product.nome} · ${materiale?.nome ?? materialeId} · taglia ${taglia}${misurePrese ? ` · misure: ${misurePrese}` : ''}${note.trim() ? ` · note: ${note.trim()}` : ''}`,
    )
    onSubmitted(numero)
  }

  return (
    <div className="rounded-[3px] border border-heemia-border bg-white p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-lg italic text-heemia-black">{product.nome} su misura</p>
          <p className="text-xs text-heemia-grey">{product.categoria} · prezzo base {formatCurrency(product.prezzoShowroom)}. Il prezzo finale viene confermato dall'atelier in base alle personalizzazioni.</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-heemia-grey hover:text-heemia-black">Chiudi</button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Materiale</span>
          <select className={inputClass} value={materialeId} onChange={(e) => setMaterialeId(e.target.value)}>
            <option value="">Scegli il materiale…</option>
            {availableMaterials.map((m) => (
              <option key={m.id} value={m.id}>{m.nome} · {m.composizione}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Taglia</span>
          <select className={inputClass} value={taglia} onChange={(e) => setTaglia(e.target.value)}>
            <option value="">Scegli la taglia…</option>
            {taglie.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div className="sm:col-span-2">
          <p className="font-mono-heemia mb-1 text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Misure da prendere (cm)</p>
          <p className="mb-2 text-xs text-heemia-grey">Se non le conosci, le prendiamo insieme in showroom alla prova.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {misureDef.map((m) => (
              <label key={m.id} className="block">
                <span className="mb-0.5 block text-[11px] text-heemia-grey">{m.label}</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  inputMode="decimal"
                  value={misure[m.id] ?? ''}
                  onChange={(e) => setMisure((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  className={inputClass}
                  placeholder="cm"
                />
              </label>
            ))}
          </div>
        </div>
        <label className="block sm:col-span-2">
          <span className="font-mono-heemia mb-1 block text-[10px] uppercase tracking-[0.06em] text-heemia-grey">Personalizzazioni richieste</span>
          <textarea rows={3} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. maniche più corte, fodera in contrasto, richieste particolari…" />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-heemia-grey">L'ordine viene inviato all'atelier con la tua email ({clientEmail}); ti ricontattiamo per conferma e prova.</p>
        <Button onClick={submit} disabled={!materialeId || !taglia}>Invia ordine su misura</Button>
      </div>
    </div>
  )
}

export function ShowroomApp() {
  const { products, logAction } = useMockStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [entered, setEntered] = useState(false)
  const [sezione, setSezione] = useState<'pronti' | 'su_misura'>('pronti')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmedOrder, setConfirmedOrder] = useState<string | null>(null)

  const matchedClient = showroomClients.find((c) => c.email.toLowerCase() === email.trim().toLowerCase())
  const catalog = products.filter((p) => p.visibileShowroom)
  const suMisura = products.filter((p) => p.personalizzabileSuMisura)
  const selectedProduct = suMisura.find((p) => p.id === selectedId) ?? null

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
              // FR-29/FR-18: ogni accesso cliente alla sub-app viene registrato.
              logAction('Accesso sub-app showroom', 'showroom_sessions', email.trim().toLowerCase(), name.trim() || 'ospite')
              setEntered(true)
            }}
          >
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome e cognome"
              className={inputClass}
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className={inputClass}
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
      <header className="border-b border-heemia-border bg-heemia-black px-4 py-5 text-white sm:px-8 sm:py-6">
        <p className="font-display text-xl italic">Heemia Showroom</p>
        <p className="font-mono-heemia mt-1 text-[10px] uppercase tracking-[0.1em] text-white/50">
          {matchedClient ? `Bentornato, ${matchedClient.nome}` : `Benvenuto, ${name || 'ospite'}`}
        </p>
      </header>

      <main className="px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-6 flex gap-5 border-b border-heemia-border">
          {([['pronti', 'Capi pronti'], ['su_misura', 'Su misura']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setSezione(id); setSelectedId(null); setConfirmedOrder(null) }}
              className={`-mb-px border-b-2 pb-2.5 text-sm transition-colors ${
                sezione === id ? 'border-heemia-carmine font-medium text-heemia-black' : 'border-transparent text-heemia-grey hover:text-heemia-black'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {sezione === 'pronti' && (
          <>
            <h1 className="font-display mb-1 text-2xl italic text-heemia-black">Catalogo capi pronti</h1>
            <p className="mb-7 text-sm text-heemia-grey">Prezzi showroom.</p>
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
          </>
        )}

        {sezione === 'su_misura' && (
          <>
            <h1 className="font-display mb-1 text-2xl italic text-heemia-black">Catalogo su misura</h1>
            <p className="mb-7 text-sm text-heemia-grey">Scegli un capo base, il materiale e le personalizzazioni: l'atelier ti ricontatta per conferma e prova.</p>

            {confirmedOrder && (
              <div className="mb-6 rounded-[3px] border border-heemia-border-strong bg-white p-4 text-sm text-heemia-black">
                Ordine <span className="font-mono-heemia">{confirmedOrder}</span> inviato all'atelier. Ti ricontatteremo a breve all'indirizzo {email}.
              </div>
            )}

            {selectedProduct ? (
              <SuMisuraForm
                product={selectedProduct}
                clientName={name.trim() || matchedClient?.nome || 'Ospite showroom'}
                clientEmail={email.trim().toLowerCase()}
                onClose={() => setSelectedId(null)}
                onSubmitted={(numero) => { setSelectedId(null); setConfirmedOrder(numero) }}
              />
            ) : suMisura.length === 0 ? (
              <p className="text-sm text-heemia-grey">Nessun capo personalizzabile al momento.</p>
            ) : (
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
                {suMisura.map((p) => (
                  <div key={p.id} className="flex flex-col rounded-[3px] border border-heemia-border bg-white p-4">
                    <ImagePlaceholder label={p.nome} className="mb-3 h-40 w-full text-3xl" />
                    <p className="font-display italic text-heemia-black">{p.nome}</p>
                    <p className="mb-2 text-xs text-heemia-grey">{p.categoria} · personalizzabile</p>
                    <p className="font-mono-heemia mb-3 text-heemia-black">da {formatCurrency(p.prezzoShowroom)}</p>
                    <Button variant="secondary" onClick={() => { setSelectedId(p.id); setConfirmedOrder(null) }}>
                      Personalizza
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
