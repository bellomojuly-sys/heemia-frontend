import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { Azione, ModuleKey, PermessiModulo } from '../lib/permissions'
import type { Role } from '../types'

// Matrice permessi ruolo × modulo (2026-09-07). Sorgente unica: `/permissions/matrix`.
//
// La matrice **non** si costruisce dai valori predefiniti del client: quelli servono solo
// al primo render dell'app. Qui si legge quella vera, comprese le personalizzazioni
// salvate dall'amministratore, perché è la schermata da cui si modifica: mostrarne una
// copia locale significherebbe permettere di salvare partendo da uno stato sbagliato.

export interface MatricePermessi {
  ruoli: Role[]
  moduli: { chiave: ModuleKey; etichetta: string }[]
  azioni: Azione[]
  matrice: Record<Role, Record<ModuleKey, PermessiModulo>>
  /** Caselle sempre attive e non modificabili, col motivo da mostrare a schermo. */
  bloccati: { role: Role; moduleKey: ModuleKey; azione: Azione; motivo: string }[]
}

export interface VoceMatrice {
  role: Role
  moduleKey: ModuleKey
  permessi: PermessiModulo
}

export function useServerPermissions() {
  const [dati, setDati] = useState<MatricePermessi | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const ricarica = useCallback(async () => {
    setCaricamento(true)
    try {
      setDati(await api.get<MatricePermessi>('/permissions/matrix'))
      setErrore(null)
    } catch (e) {
      if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) {
        setDati(null)
        setErrore(null)
      } else {
        setErrore(e instanceof Error ? e.message : 'Matrice permessi non caricata')
      }
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => { void ricarica() }, [ricarica])

  /**
   * Salva un blocco di voci. Il server risponde con la matrice aggiornata, che sostituisce
   * quella locale: se ha rifiutato o corretto qualcosa (una casella intoccabile, una
   * combinazione senza senso) si vede subito, invece di restare con lo stato che si
   * credeva di aver salvato.
   */
  const salva = useCallback(async (voci: VoceMatrice[]) => {
    const esito = await api.put<{ salvate: number; cambiate: number; matrice: MatricePermessi['matrice'] }>(
      '/permissions/matrix',
      { voci },
    )
    setDati((d) => (d ? { ...d, matrice: esito.matrice } : d))
    return esito
  }, [])

  const ripristina = useCallback(async () => {
    const esito = await api.post<{ rimosse: number; matrice: MatricePermessi['matrice'] }>(
      '/permissions/matrix/reset',
    )
    setDati((d) => (d ? { ...d, matrice: esito.matrice } : d))
    return esito
  }, [])

  /** Insieme delle caselle bloccate, per interrogarlo in O(1) mentre si disegna la tabella. */
  const bloccati = useMemo(() => {
    const mappa = new Map<string, string>()
    for (const b of dati?.bloccati ?? []) mappa.set(`${b.role}::${b.moduleKey}::${b.azione}`, b.motivo)
    return mappa
  }, [dati])

  return { dati, bloccati, caricamento, errore, ricarica, salva, ripristina }
}
