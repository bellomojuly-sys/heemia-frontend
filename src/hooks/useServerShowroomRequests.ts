import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, isoDate, num } from '../lib/api'
import type { ShowroomRequest } from '../types'

// Richieste arrivate dalla vista cliente (spec 2026-08-06 §7). Sorgente unica: GET
// /showroom-requests. Il modulo è "richieste-showroom": chi non ha accesso riceve 403 e
// vede una lista vuota, non un errore tecnico.

type Row = Record<string, unknown>

const s = (v: unknown) => (v === null || v === undefined ? undefined : String(v))

function toRichiesta(r: Row): ShowroomRequest {
  const cliente = (r.customer ?? {}) as Row
  const prodotto = r.product as Row | null
  const ordine = r.order as Row | null
  return {
    id: String(r.id),
    numero: String(r.numero),
    tipo: r.tipo as ShowroomRequest['tipo'],
    stato: r.stato as ShowroomRequest['stato'],
    createdAt: String(r.createdAt ?? ''),
    cliente: {
      id: String(cliente.id ?? ''),
      nome: String(cliente.nome ?? ''),
      cognome: s(cliente.cognome),
      email: s(cliente.email),
      consensoMarketing: Boolean(cliente.consensoMarketing),
    },
    prodotto: prodotto
      ? {
          id: String(prodotto.id),
          nome: String(prodotto.nome),
          codiceProdotto: String(prodotto.codiceProdotto ?? ''),
          categoria: s(prodotto.categoria),
        }
      : undefined,
    tagliaBase: s(r.tagliaBase),
    coloreDesiderato: s(r.coloreDesiderato),
    lunghezza: s(r.lunghezza),
    modifiche: s(r.modifiche),
    note: s(r.note),
    misure: (r.misure as Record<string, string> | null) ?? undefined,
    dataDesiderata: r.dataDesiderata ? isoDate(r.dataDesiderata) : undefined,
    immagini: ((r.immagini as Row[]) ?? []).map((i) => ({
      id: String(i.id),
      nome: String(i.nome),
      dataUrl: String(i.dataUrl),
    })),
    noteInterne: s(r.noteInterne),
    preventivoImporto: r.preventivoImporto === null || r.preventivoImporto === undefined ? undefined : num(r.preventivoImporto),
    preventivoInviatoIl: s(r.preventivoInviatoIl),
    appuntamentoIl: s(r.appuntamentoIl),
    ordine: ordine ? { id: String(ordine.id), numero: String(ordine.numero), stato: String(ordine.stato) } : undefined,
  }
}

export interface PatchRichiesta {
  stato?: ShowroomRequest['stato']
  noteInterne?: string
  preventivoImporto?: number
  preventivoInviatoIl?: string
  appuntamentoIl?: string
  tagliaBase?: string
  coloreDesiderato?: string
  lunghezza?: string
  modifiche?: string
  misure?: Record<string, string>
}

export function useServerShowroomRequests() {
  const [richieste, setRichieste] = useState<ShowroomRequest[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const ricarica = useCallback(async () => {
    setCaricamento(true)
    try {
      const rows = await api.get<Row[]>('/showroom-requests')
      setRichieste(rows.map(toRichiesta))
      setErrore(null)
    } catch (e) {
      if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) {
        setRichieste([])
        setErrore(null)
      } else {
        setErrore(e instanceof Error ? e.message : 'Richieste non caricate')
      }
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => { void ricarica() }, [ricarica])

  /** Salva e rimpiazza la riga con quella che torna dal server: se la conferma ha creato
   *  l'ordine SM-*, il numero compare subito senza dover ricaricare la pagina. */
  const aggiorna = useCallback(async (id: string, patch: PatchRichiesta) => {
    const aggiornata = toRichiesta(await api.patch<Row>(`/showroom-requests/${id}`, patch))
    setRichieste((prev) => prev.map((r) => (r.id === id ? aggiornata : r)))
    return aggiornata
  }, [])

  return { richieste, caricamento, errore, ricarica, aggiorna }
}
