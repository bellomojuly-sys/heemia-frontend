import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, isoDate, num } from '../lib/api'
import type {
  ArticoloDisponibile, BollaLavorazione, CausaleBolla, MovimentoLavorazione, RientroBolla,
  RigaBolla, StatoBolla, TipoArticoloBolla,
} from '../types'

// Bolle di lavorazione esterna (2026-08-10). Sorgente unica: GET /lavorazioni/bolle.
// Nessun dato mock: se il server non risponde la pagina lo dice, non inventa righe.
//
// Come per le altre sezioni, i Decimal di Prisma arrivano come stringhe ("30.0000") e
// vanno convertiti qui una volta sola, così le pagine lavorano solo con numeri.

type Row = Record<string, unknown>

const s = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : String(v))

function toRiga(r: Row): RigaBolla {
  return {
    id: String(r.id),
    materialId: s(r.materialId),
    accessoryId: s(r.accessoryId),
    variantId: s(r.variantId),
    descrizione: String(r.descrizione ?? ''),
    sku: s(r.sku),
    unitaMisura: String(r.unitaMisura ?? ''),
    lotto: s(r.lotto),
    colore: s(r.colore),
    variante: s(r.variante),
    note: s(r.note),
    provenienza: (r.provenienza as RigaBolla['provenienza']) ?? 'magazzino',
    costoUnitario: num(r.costoUnitario),
    fonteCosto: (r.fonteCosto as RigaBolla['fonteCosto']) ?? 'materiale',
    quantitaInviata: num(r.quantitaInviata),
    quantitaUtilizzata: num(r.quantitaUtilizzata),
    quantitaRestituita: num(r.quantitaRestituita),
    quantitaScartoRecuperato: num(r.quantitaScartoRecuperato),
    quantitaScartoPerso: num(r.quantitaScartoPerso),
    costoConsumato: num(r.costoConsumato),
    costoPerso: num(r.costoPerso),
    quantitaPressoLavorante: num(r.quantitaPressoLavorante),
  }
}

function toRientro(r: Row): RientroBolla {
  const autore = r.registratoDa as Row | null
  return {
    id: String(r.id),
    data: isoDate(r.data),
    numeroDocumentoLavorante: s(r.numeroDocumentoLavorante),
    note: s(r.note),
    createdAt: String(r.createdAt ?? ''),
    registratoDa: autore ? { id: String(autore.id), nome: String(autore.nome) } : undefined,
    righe: ((r.righe as Row[]) ?? []).map((x) => ({
      id: String(x.id),
      rigaId: String(x.rigaId),
      quantitaUtilizzata: num(x.quantitaUtilizzata),
      quantitaRestituita: num(x.quantitaRestituita),
      quantitaScartoRecuperato: num(x.quantitaScartoRecuperato),
      quantitaScartoPerso: num(x.quantitaScartoPerso),
      note: s(x.note),
    })),
    capi: ((r.capi as Row[]) ?? []).map((c) => ({
      id: String(c.id),
      variantId: String(c.variantId),
      sku: String(c.sku),
      taglia: String(c.taglia),
      colore: String(c.colore),
      quantita: Number(c.quantita ?? 0),
      note: s(c.note),
    })),
    allegati: ((r.allegati as Row[]) ?? []).map((a) => ({
      id: String(a.id), nome: String(a.nome), caricatoIl: String(a.caricatoIl ?? ''),
    })),
  }
}

export function toBolla(r: Row): BollaLavorazione {
  const lav = (r.supplier ?? {}) as Row
  const prod = r.product as Row | null
  const scheda = r.technicalSheet as Row | null
  const ordine = r.order as Row | null
  const persona = (v: unknown) => {
    const p = v as Row | null
    return p ? { id: String(p.id), nome: String(p.nome) } : undefined
  }
  return {
    id: String(r.id),
    numero: s(r.numero),
    etichetta: String(r.etichetta ?? r.numero ?? ''),
    data: isoDate(r.data),
    causale: r.causale as CausaleBolla,
    stato: r.stato as StatoBolla,
    supplierId: String(r.supplierId),
    lavorante: {
      id: String(lav.id ?? ''),
      nome: String(lav.nome ?? ''),
      partitaIva: s(lav.partitaIva),
      citta: s(lav.citta),
      email: s(lav.email),
    },
    lavoranteNome: s(r.lavoranteNome),
    lavorantePartitaIva: s(r.lavorantePartitaIva),
    prodotto: prod
      ? { id: String(prod.id), nome: String(prod.nome), codiceProdotto: String(prod.codiceProdotto ?? '') }
      : undefined,
    schedaTecnica: scheda
      ? { id: String(scheda.id), versione: String(scheda.versione), statoScheda: String(scheda.statoScheda ?? '') }
      : undefined,
    commessa: s(r.commessa),
    ordine: ordine ? { id: String(ordine.id), numero: String(ordine.numero) } : undefined,
    quantitaAttesa: Number(r.quantitaAttesa ?? 0),
    note: s(r.note),
    differenzaNote: s(r.differenzaNote),
    chiusaConDifferenza: Boolean(r.chiusaConDifferenza),
    righe: ((r.righe as Row[]) ?? []).map(toRiga),
    rientri: ((r.rientri as Row[]) ?? []).map(toRientro),
    allegati: ((r.allegati as Row[]) ?? []).map((a) => ({
      id: String(a.id), nome: String(a.nome), caricatoIl: String(a.caricatoIl ?? ''),
    })),
    capiRientrati: Number(r.capiRientrati ?? 0),
    tuttoRiconciliato: Boolean(r.tuttoRiconciliato),
    materialeAncoraFuori: num(r.materialeAncoraFuori),
    costoConsumato: num(r.costoConsumato),
    costoPerso: num(r.costoPerso),
    costoLavorazione: num(r.costoLavorazione),
    creataDa: persona(r.creataDa),
    emittente: persona(r.emittente),
    chiuditore: persona(r.chiuditore),
    emessaIl: s(r.emessaIl),
    chiusaIl: s(r.chiusaIl),
    annullataIl: s(r.annullataIl),
    createdAt: String(r.createdAt ?? ''),
  }
}

function toMovimento(r: Row): MovimentoLavorazione {
  const autore = r.eseguitoDa as Row | null
  return {
    id: String(r.id),
    rigaId: s(r.rigaId),
    rientroId: s(r.rientroId),
    tipo: r.tipo as MovimentoLavorazione['tipo'],
    da: r.da as MovimentoLavorazione['da'],
    a: r.a as MovimentoLavorazione['a'],
    quantita: num(r.quantita),
    costoUnitario: num(r.costoUnitario),
    valore: num(r.valore),
    descrizione: String(r.descrizione ?? ''),
    unitaMisura: String(r.unitaMisura ?? ''),
    motivo: s(r.motivo),
    note: s(r.note),
    createdAt: String(r.createdAt ?? ''),
    eseguitoDa: autore ? { id: String(autore.id), nome: String(autore.nome) } : undefined,
  }
}

export interface FiltriBolle {
  supplierId?: string
  stato?: StatoBolla
  numero?: string
  dataDa?: string
  dataA?: string
}

export interface NuovaRigaInput {
  tipo: TipoArticoloBolla
  articoloId: string
  quantita: number
  provenienza?: 'magazzino' | 'scampoli'
  lotto?: string
  colore?: string
  variante?: string
  note?: string
}

export interface NuovaBollaInput {
  supplierId: string
  data: string
  causale?: CausaleBolla
  productId?: string
  technicalSheetId?: string
  commessa?: string
  quantitaAttesa?: number
  note?: string
  righe: NuovaRigaInput[]
}

export interface RientroInput {
  data: string
  numeroDocumentoLavorante?: string
  note?: string
  righe: {
    rigaId: string
    utilizzata?: number
    restituita?: number
    scartoRecuperato?: number
    scartoPerso?: number
    note?: string
  }[]
  capi?: { variantId: string; quantita: number; note?: string }[]
  allegato?: { nome: string; dataUrl: string }
}

function query(f: FiltriBolle): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, String(v))
  const q = p.toString()
  return q ? `?${q}` : ''
}

export function useServerLavorazioni(filtri: FiltriBolle = {}) {
  const [bolle, setBolle] = useState<BollaLavorazione[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  // I filtri sono un oggetto ricreato a ogni render: dipendere da lui farebbe ricaricare
  // all'infinito. Si dipende dalla querystring, che cambia solo quando cambia un filtro.
  const qs = query(filtri)

  const ricarica = useCallback(async () => {
    setCaricamento(true)
    try {
      const rows = await api.get<Row[]>(`/lavorazioni/bolle${qs}`)
      setBolle(rows.map(toBolla))
      setErrore(null)
    } catch (e) {
      if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) {
        setBolle([])
        setErrore(null)
      } else {
        setErrore(e instanceof Error ? e.message : 'Bolle non caricate')
      }
    } finally {
      setCaricamento(false)
    }
  }, [qs])

  useEffect(() => { void ricarica() }, [ricarica])

  /** Rimpiazza in lista la bolla che torna dal server: numero e stato compaiono subito. */
  const sostituisci = useCallback((b: BollaLavorazione) => {
    setBolle((prev) => {
      const c = prev.some((x) => x.id === b.id)
      return c ? prev.map((x) => (x.id === b.id ? b : x)) : [b, ...prev]
    })
    return b
  }, [])

  const crea = useCallback(
    async (input: NuovaBollaInput) => sostituisci(toBolla(await api.post<Row>('/lavorazioni/bolle', input))),
    [sostituisci],
  )

  const aggiorna = useCallback(
    async (id: string, patch: Partial<NuovaBollaInput>) =>
      sostituisci(toBolla(await api.patch<Row>(`/lavorazioni/bolle/${id}`, patch))),
    [sostituisci],
  )

  const emetti = useCallback(
    async (id: string) => sostituisci(toBolla(await api.post<Row>(`/lavorazioni/bolle/${id}/emetti`))),
    [sostituisci],
  )

  const registraRientro = useCallback(
    async (id: string, input: RientroInput) =>
      sostituisci(toBolla(await api.post<Row>(`/lavorazioni/bolle/${id}/rientri`, input))),
    [sostituisci],
  )

  const chiudi = useCallback(
    async (id: string, opzioni: { forzaDifferenza?: boolean; note?: string } = {}) =>
      sostituisci(toBolla(await api.post<Row>(`/lavorazioni/bolle/${id}/chiudi`, opzioni))),
    [sostituisci],
  )

  const annulla = useCallback(
    async (id: string, motivo?: string) =>
      sostituisci(toBolla(await api.post<Row>(`/lavorazioni/bolle/${id}/annulla`, { motivo }))),
    [sostituisci],
  )

  const elimina = useCallback(async (id: string) => {
    await api.del(`/lavorazioni/bolle/${id}`)
    setBolle((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const allega = useCallback(
    async (id: string, allegato: { nome: string; dataUrl: string; rientroId?: string }) => {
      await api.post(`/lavorazioni/bolle/${id}/allegati`, allegato)
      sostituisci(toBolla(await api.get<Row>(`/lavorazioni/bolle/${id}`)))
    },
    [sostituisci],
  )

  return {
    bolle, caricamento, errore, ricarica,
    crea, aggiorna, emetti, registraRientro, chiudi, annulla, elimina, allega,
  }
}

/**
 * Una singola bolla e le azioni che la riguardano. Ogni azione rimpiazza lo stato con la
 * bolla che torna dal server invece di ricalcolarlo qui: dopo un rientro cambiano stato,
 * quantità per riga e capi caricati tutti insieme, e ricostruirli lato client vorrebbe dire
 * duplicare le regole del backend con l'unico risultato di poterle sbagliare.
 */
export function useServerBolla(id: string | undefined) {
  const [bolla, setBolla] = useState<BollaLavorazione | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const ricarica = useCallback(async () => {
    if (!id) return
    setCaricamento(true)
    try {
      setBolla(toBolla(await api.get<Row>(`/lavorazioni/bolle/${id}`)))
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Bolla non caricata')
    } finally {
      setCaricamento(false)
    }
  }, [id])

  useEffect(() => { void ricarica() }, [ricarica])

  const applica = useCallback((r: Row) => {
    const b = toBolla(r)
    setBolla(b)
    return b
  }, [])

  const emetti = useCallback(
    async () => applica(await api.post<Row>(`/lavorazioni/bolle/${id}/emetti`)),
    [applica, id],
  )
  const registraRientro = useCallback(
    async (input: RientroInput) => applica(await api.post<Row>(`/lavorazioni/bolle/${id}/rientri`, input)),
    [applica, id],
  )
  const chiudi = useCallback(
    async (opzioni: { forzaDifferenza?: boolean; note?: string } = {}) =>
      applica(await api.post<Row>(`/lavorazioni/bolle/${id}/chiudi`, opzioni)),
    [applica, id],
  )
  const annulla = useCallback(
    async (motivo?: string) => applica(await api.post<Row>(`/lavorazioni/bolle/${id}/annulla`, { motivo })),
    [applica, id],
  )
  const salvaNote = useCallback(
    async (note: string) => applica(await api.patch<Row>(`/lavorazioni/bolle/${id}`, { note })),
    [applica, id],
  )
  const allega = useCallback(
    async (allegato: { nome: string; dataUrl: string; rientroId?: string }) => {
      await api.post(`/lavorazioni/bolle/${id}/allegati`, allegato)
      return applica(await api.get<Row>(`/lavorazioni/bolle/${id}`))
    },
    [applica, id],
  )

  return { bolla, caricamento, errore, ricarica, emetti, registraRientro, chiudi, annulla, salvaNote, allega }
}

/** Articoli reali dell'inventario per il selettore di riga, con la disponibilità vera. */
export function useArticoliDisponibili() {
  const [articoli, setArticoli] = useState<ArticoloDisponibile[]>([])
  const [caricamento, setCaricamento] = useState(true)

  const ricarica = useCallback(async () => {
    setCaricamento(true)
    try {
      const rows = await api.get<Row[]>('/lavorazioni/articoli')
      setArticoli(
        rows.map((r) => ({
          tipo: r.tipo as TipoArticoloBolla,
          id: String(r.id),
          descrizione: String(r.descrizione),
          sku: s(r.sku),
          unitaMisura: String(r.unitaMisura),
          disponibile: num(r.disponibile),
          scampoli: num(r.scampoli),
          pressoTerzisti: num(r.pressoTerzisti),
          patrimonio: num(r.patrimonio),
        })),
      )
    } catch {
      setArticoli([])
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => { void ricarica() }, [ricarica])
  return { articoli, caricamento, ricarica }
}

/**
 * Registro dei movimenti di una bolla: sta su una rotta a sé perché è la parte che cresce
 * (una bolla con dieci rientri ha decine di righe) e non serve nell'elenco.
 *
 * `revisione` è quello che tiene il registro allineato. L'id della bolla non cambia mai,
 * quindi un effetto che dipendesse solo da quello caricherebbe i movimenti una volta
 * all'apertura e poi resterebbe fermo: dopo un'emissione o un rientro la scheda mostrava
 * ancora "nessun movimento" mentre il database ne aveva tre. Passando una chiave che cambia
 * con lo stato della bolla, il ricaricamento è automatico e non può essere dimenticato in
 * uno dei punti che la modificano.
 */
export function useMovimentiBolla(bollaId: string | null, revisione = '') {
  const [movimenti, setMovimenti] = useState<MovimentoLavorazione[]>([])
  const [caricamento, setCaricamento] = useState(false)

  useEffect(() => {
    if (!bollaId) {
      setMovimenti([])
      return
    }
    let attivo = true
    setCaricamento(true)
    api
      .get<Row[]>(`/lavorazioni/bolle/${bollaId}/movimenti`)
      .then((rows) => { if (attivo) setMovimenti(rows.map(toMovimento)) })
      .catch(() => { if (attivo) setMovimenti([]) })
      .finally(() => { if (attivo) setCaricamento(false) })
    return () => { attivo = false }
  }, [bollaId, revisione])

  return { movimenti, caricamento }
}

/** Scarica il contenuto di un allegato solo quando serve davvero (i data URL pesano). */
export async function apriAllegato(id: string) {
  const a = await api.get<Row>(`/lavorazioni/allegati/${id}`)
  return { nome: String(a.nome), dataUrl: String(a.dataUrl) }
}
