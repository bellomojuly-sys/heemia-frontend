import { useOutletContext } from 'react-router-dom'
import type { Deadline } from '../../types'

/** Dati condivisi dalle schede della pagina unificata Fatture e scadenze. */
export interface AmministrazioneOutlet {
  deadlines: Deadline[]
}

export function useAmministrazioneOutlet(): AmministrazioneOutlet {
  return useOutletContext<AmministrazioneOutlet>()
}
