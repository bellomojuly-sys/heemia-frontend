import { useOutletContext } from 'react-router-dom'
import type { PatchRichiesta } from '../../hooks/useServerShowroomRequests'
import type { ShowroomRequest } from '../../types'

export interface SalesChannelsOutlet {
  showroom: {
    richieste: ShowroomRequest[]
    caricamento: boolean
    errore: string | null
    ricarica: () => Promise<void>
    aggiorna: (id: string, patch: PatchRichiesta) => Promise<ShowroomRequest>
  }
}

export function useSalesChannelsOutlet() {
  return useOutletContext<SalesChannelsOutlet>()
}
