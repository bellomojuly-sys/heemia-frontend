import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, num } from '../lib/api'

// Report economico mensile (spec Giulia 2026-08-13): quanto è entrato, quanto è uscito e
// in che cosa. Calcolato dal server: i numeri che finiscono su un PDF non si ricostruiscono
// nel browser, altrimenti due schermi aperti insieme possono mostrare cifre diverse.

export interface VoceCategoria {
  categoria: string
  etichetta: string
  imponibile: number
  numeroFatture: number
}

export interface ReportEconomico {
  mese: string
  meseLabel: string
  generatoIl: string
  entrate: {
    ordiniShopify: number
    ordiniShowroom: number
    incassoScontrini: number
    scontriniRegistrati: boolean
    totale: number
  }
  uscite: {
    perCategoria: VoceCategoria[]
    totaleImponibile: number
    totaleIva: number
    pagate: number
    daPagare: number
    scadute: number
    numeroFatture: number
  }
  costiFissi: {
    totaleAnnuo: number
    quotaMensile: number
    voci: { nome: string; importoAnnuo: number }[]
  }
  risultato: number
  avvisi: string[]
}

type Row = Record<string, unknown>

/** Prisma serializza i Decimal come stringhe: qui tornano numeri, una volta sola. */
function toReport(r: Row): ReportEconomico {
  const entrate = r.entrate as Row
  const uscite = r.uscite as Row
  const fissi = r.costiFissi as Row
  return {
    mese: String(r.mese),
    meseLabel: String(r.meseLabel),
    generatoIl: String(r.generatoIl),
    entrate: {
      ordiniShopify: num(entrate.ordiniShopify),
      ordiniShowroom: num(entrate.ordiniShowroom),
      incassoScontrini: num(entrate.incassoScontrini),
      scontriniRegistrati: Boolean(entrate.scontriniRegistrati),
      totale: num(entrate.totale),
    },
    uscite: {
      perCategoria: ((uscite.perCategoria as Row[]) ?? []).map((c) => ({
        categoria: String(c.categoria),
        etichetta: String(c.etichetta),
        imponibile: num(c.imponibile),
        numeroFatture: Number(c.numeroFatture ?? 0),
      })),
      totaleImponibile: num(uscite.totaleImponibile),
      totaleIva: num(uscite.totaleIva),
      pagate: num(uscite.pagate),
      daPagare: num(uscite.daPagare),
      scadute: num(uscite.scadute),
      numeroFatture: Number(uscite.numeroFatture ?? 0),
    },
    costiFissi: {
      totaleAnnuo: num(fissi.totaleAnnuo),
      quotaMensile: num(fissi.quotaMensile),
      voci: ((fissi.voci as Row[]) ?? []).map((v) => ({ nome: String(v.nome), importoAnnuo: num(v.importoAnnuo) })),
    },
    risultato: num(r.risultato),
    avvisi: ((r.avvisi as string[]) ?? []).map(String),
  }
}

/** Mese corrente in formato "YYYY-MM". */
function meseCorrente(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function useServerReportEconomico() {
  const [mesi, setMesi] = useState<string[]>([])
  const [mese, setMese] = useState<string>(meseCorrente())
  const [report, setReport] = useState<ReportEconomico | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  // I mesi selezionabili sono quelli che hanno movimenti: si sceglie il più recente,
  // che è quasi sempre quello che interessa.
  useEffect(() => {
    void (async () => {
      try {
        const r = await api.get<{ mesi: string[] }>('/reports/economico/mesi')
        setMesi(r.mesi)
        if (r.mesi.length > 0) setMese(r.mesi[0])
      } catch {
        // Nessun mese da scegliere non è un errore: resta il mese corrente.
      }
    })()
  }, [])

  const carica = useCallback(async (m: string) => {
    setCaricamento(true)
    try {
      setReport(toReport(await api.get<Row>(`/reports/economico?mese=${m}`)))
      setErrore(null)
    } catch (e) {
      if (e instanceof ApiError && (e.isForbidden || e.isAuthError)) {
        setReport(null)
        setErrore(null)
      } else {
        setErrore(e instanceof Error ? e.message : 'Report non caricato')
      }
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => { void carica(mese) }, [carica, mese])

  return { report, mesi, mese, setMese, caricamento, errore, ricarica: () => carica(mese) }
}
