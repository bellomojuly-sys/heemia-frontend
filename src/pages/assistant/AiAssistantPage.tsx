import { useState } from 'react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { formatPercent } from '../../lib/format'
import type { AiMessage, Accessory, Margin, Material, Product } from '../../types'
import { useMockStore } from '../../context/MockStore'
import { useLiveMargins } from '../../hooks/useLiveMargins'
import { useRole } from '../../context/RoleContext'
import { canAccessModule } from '../../lib/permissions'

const WELCOME: AiMessage = {
  id: 'ai-welcome',
  autore: 'assistant',
  testo: 'Ciao, sono l\'assistente Heemia. Posso rispondere a domande operative sull\'app e sui dati del gestionale, in sola lettura: non modifico nulla. Prova a chiedermi ad esempio "quali tessuti sono sotto scorta?" o "come funziona il break-even?".',
  data: new Date().toISOString(),
}

// FR-28: risposte sempre ancorate ai dati del gestionale (stato di sessione incluso), mai
// inventate; sui dati economici il filtro segue lo stesso gating del modulo Costi e margini.
interface AiData {
  materials: Material[]
  accessories: Accessory[]
  products: Product[]
  margins: Margin[]
}

function answer(question: string, canSeeEconomics: boolean, data: AiData): string {
  const { materials, accessories, products, margins } = data
  const q = question.toLowerCase()

  if (q.includes('tessut') && (q.includes('scorta') || q.includes('sotto') || q.includes('disponibil'))) {
    const list = materials.filter((m) => m.stato === 'sotto_soglia' || m.stato === 'esaurito').map((m) => m.nome)
    return list.length > 0
      ? `Tessuti sotto soglia o esauriti questa settimana: ${list.join(', ')}.`
      : 'Nessun tessuto è sotto soglia minima al momento.'
  }

  if (q.includes('accessor') && (q.includes('scorta') || q.includes('sotto'))) {
    const list = accessories.filter((a) => a.stato === 'sotto_soglia' || a.stato === 'esaurito').map((a) => a.nome)
    return list.length > 0 ? `Accessori sotto soglia o esauriti: ${list.join(', ')}.` : 'Nessun accessorio sotto soglia al momento.'
  }

  if (q.includes('break-even') || q.includes('break even')) {
    return 'Il break-even è il prezzo minimo a cui puoi vendere un capo senza perdere denaro: copre esattamente il costo diretto più la quota di costi fissi allocata. Sotto quel prezzo, ogni vendita è in perdita.'
  }

  if (q.includes('margine') && (q.includes('negativ') || q.includes('basso') || q.includes('maiorca') || q.includes('amalfi'))) {
    if (!canSeeEconomics) return 'Non ho accesso a questo dato con il ruolo attivo: i margini sono visibili solo ad Admin e Founder/CEO.'
    const target = q.includes('amalfi') ? 'prod-06' : 'prod-05'
    const m = margins.find((mg) => mg.productId === target)
    const p = products.find((pr) => pr.id === target)
    if (!m || !p) return 'Non trovo dati sufficienti su questo prodotto.'
    const relazioneCosto =
      m.costoTotale > m.prezzoNettoIva
        ? `supera il prezzo netto (${m.prezzoNettoIva.toFixed(2)}€): il capo si vende in perdita`
        : `è vicino al prezzo netto (${m.prezzoNettoIva.toFixed(2)}€), quindi resta poco margine`
    return `${p.nome} ha un margine netto stimato del ${formatPercent(m.marginePercentuale)}, sotto la soglia configurata. Il costo totale (${m.costoTotale.toFixed(2)}€) ${relazioneCosto} dopo la quota di costi fissi.`
  }

  if (q.includes('fattura') && q.includes('prodotto')) {
    return 'Per collegare una fattura a un prodotto: apri la fattura dalla sezione Fatture, poi associa i prodotti o i materiali collegati. Le fatture non associate compaiono come alert in dashboard.'
  }

  if (q.includes('tessuto') && q.includes('aggiung')) {
    return 'Per aggiungere un nuovo tessuto: vai su Inventario → Tessuti e usa "Aggiungi tessuto" (visibile ad Admin, CEO e Team interno). Servono fornitore, composizione, prezzo al metro e soglia minima.'
  }

  return 'Non ho una risposta pronta per questa domanda nei dati disponibili. Prova a riformulare, o chiedi a un membro del team con accesso al modulo specifico.'
}

export function AiAssistantPage() {
  const { role } = useRole()
  const { materials, accessories, products, logAction } = useMockStore()
  const liveMargins = useLiveMargins()
  const canSeeEconomics = canAccessModule(role, 'costi-margini')
  const [messages, setMessages] = useState<AiMessage[]>([WELCOME])
  const [input, setInput] = useState('')

  const send = () => {
    const text = input.trim()
    if (!text) return
    const userMsg: AiMessage = { id: `u-${Date.now()}`, autore: 'utente', testo: text, data: new Date().toISOString() }
    const aiMsg: AiMessage = {
      id: `a-${Date.now()}`, autore: 'assistant',
      testo: answer(text, canSeeEconomics, { materials, accessories, products, margins: liveMargins }),
      data: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg, aiMsg])
    // FR-28/FR-18: ogni domanda della sessione AI viene tracciata nell'activity log.
    logAction('Domanda AI assistant', 'ai_sessions', userMsg.id, text)
    setInput('')
  }

  const examples = [
    'Quali tessuti sono sotto scorta questa settimana?',
    'Come funziona il calcolo del break-even?',
    'Perché Maiorca Top ha un margine basso?',
    'Come collego una fattura a un prodotto?',
  ]

  return (
    <div>
      <PageHeader title="AI Assistant" subtitle="Accesso in sola lettura ai dati del gestionale: non modifica nulla." />

      <div className="flex flex-col rounded-[3px] border border-heemia-border bg-white">
        <div className="max-h-[50vh] space-y-3 overflow-y-auto p-5">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.autore === 'utente' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-md rounded-[3px] px-3.5 py-2.5 text-sm ${m.autore === 'utente' ? 'bg-heemia-black text-white' : 'bg-heemia-cream text-heemia-black'}`}>
                {m.testo}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-heemia-border p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setInput(ex)}
                className="rounded-[3px] border border-heemia-border px-3 py-1 text-xs text-heemia-grey transition-colors hover:border-heemia-black hover:text-heemia-black"
              >
                {ex}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Fai una domanda sull'app o sui dati…"
              className="flex-1 rounded-[3px] border border-heemia-border px-3 py-2 text-sm focus:border-heemia-black focus:outline-none"
            />
            <Button onClick={send}>Invia</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
