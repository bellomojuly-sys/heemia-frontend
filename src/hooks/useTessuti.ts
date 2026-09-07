import { useEffect, useState } from 'react'
import { api } from '../lib/api'

// Tessuti con composizione e consigli di cura. La tabella vive **solo sul server**
// (`core/tessuti.ts`, dalla pagina Notion «CONSIGLI DEL TEAM»): qui si legge e basta.
//
// Perché non una copia nel client: sono quattro righe di testo per dodici tessuti, e due
// copie che divergono significherebbero due capi con lo stesso tessuto e istruzioni di
// lavaggio diverse — su un'etichetta che finisce addosso al capo di un cliente.

export interface Tessuto {
  nome: string
  composizione: string
  consigliCura: string
}

export function useTessuti() {
  const [tessuti, setTessuti] = useState<Tessuto[]>([])

  useEffect(() => {
    void (async () => {
      try {
        setTessuti(await api.get<Tessuto[]>('/tessuti'))
      } catch {
        // Senza la tabella il campo resta un testo libero: si può comunque salvare un capo.
      }
    })()
  }, [])

  return tessuti
}
