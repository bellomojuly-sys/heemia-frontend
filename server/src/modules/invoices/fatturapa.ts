// Lettura delle fatture elettroniche italiane (FatturaPA) — FR-19/FR-20.
//
// Le fatture dei fornitori arrivano **da sole** al Sistema di Interscambio quando il
// fornitore le emette: il lavoro manuale è solo il passaggio successivo, farle entrare
// in Heemia. Questo file fa quel passaggio: prende l'XML e ne ricava una fattura.
//
// È scritto come **funzione pura**, senza database e senza rete, per un motivo preciso:
// lo stesso XML può arrivare in due modi — caricato a mano dall'area riservata
// dell'Agenzia, oppure consegnato da un provider accreditato SDI via webhook quando
// l'integrazione automatica sarà attiva ([[API_Mapping]] §B6). Cambia solo come arriva
// il file: quello che lo interpreta resta questo, e va provato una volta sola.
import { XMLParser } from 'fast-xml-parser'

/** Una riga di dettaglio della fattura. */
export interface RigaFattura {
  descrizione: string
  quantita: number | null
  unitaMisura: string | null
  prezzoUnitario: number | null
  importo: number
  aliquotaIva: number | null
}

/** Il documento letto, nei termini che servono all'app (non tutti i campi FatturaPA). */
export interface FatturaLetta {
  /** Dati di chi ha emesso la fattura: per noi il fornitore. */
  fornitore: {
    denominazione: string
    partitaIva: string | null
    codiceFiscale: string | null
    paese: string
    citta: string | null
    email: string | null
  }
  /** Partita IVA del destinatario: serve a scartare le fatture che non sono di Heemia. */
  destinatarioPartitaIva: string | null
  numero: string
  data: string
  divisa: string
  imponibile: number
  iva: number
  totale: number
  dataScadenza: string | null
  modalitaPagamento: string | null
  /** true quando l'IVA non è addebitata dal fornitore ma dovuta da chi riceve. */
  reverseCharge: boolean
  righe: RigaFattura[]
  /** Tipo documento FatturaPA (TD01 fattura, TD04 nota di credito…). */
  tipoDocumento: string | null
}

export class FatturaNonLeggibile extends Error {}

const parser = new XMLParser({
  ignoreAttributes: false,
  // I nomi degli elementi arrivano con prefissi di namespace diversi a seconda di chi ha
  // generato il file (p:FatturaElettronica, ns2:FatturaElettronica, nessun prefisso…):
  // toglierli qui evita di inseguire ogni variante nel resto del codice.
  transformTagName: (tag) => tag.replace(/^.*:/, ''),
  parseTagValue: false, // i numeri li convertiamo noi: "0.00" e le date non vanno indovinate
  trimValues: true,
})

/**
 * I file scaricati dall'area riservata possono essere firmati (`.xml.p7m`): l'XML è
 * dentro un involucro binario CAdES. Estrarre la firma per verificarla richiederebbe una
 * libreria crittografica; qui interessa solo il **contenuto**, che si ritaglia fra il
 * primo `<` di apertura e l'ultimo tag di chiusura. La firma non viene verificata, e va
 * bene: il file arriva dall'area riservata dell'Agenzia o da un canale accreditato, non
 * da una fonte qualsiasi — chi lo carica sta guardando le proprie fatture.
 */
export function estraiXml(contenuto: Buffer): string {
  const testo = contenuto.toString('latin1')
  const inizio = testo.search(/<[A-Za-z_][\w.-]*:?FatturaElettronica[\s>]/)
  if (inizio < 0) {
    // Non è un p7m né una fattura: forse è un XML normale con dichiarazione iniziale.
    const utf8 = contenuto.toString('utf8')
    if (utf8.includes('FatturaElettronica')) return utf8
    throw new FatturaNonLeggibile('Il file non contiene una fattura elettronica.')
  }
  const chiusura = testo.lastIndexOf('FatturaElettronica>')
  if (chiusura < 0) throw new FatturaNonLeggibile('Fattura elettronica incompleta: manca la chiusura del documento.')
  const fine = testo.indexOf('>', chiusura) + 1
  const ritagliato = testo.slice(inizio, fine)
  // Il ritaglio è stato fatto su latin1 per non rompere i byte binari attorno: ora
  // rileggiamo quella porzione come UTF-8, altrimenti gli accenti diventano illeggibili.
  return Buffer.from(ritagliato, 'latin1').toString('utf8')
}

/** Sempre un array, anche quando l'XML ha un elemento solo (fast-xml-parser lo restituisce singolo). */
function elenco<T>(valore: T | T[] | undefined): T[] {
  if (valore === undefined || valore === null) return []
  return Array.isArray(valore) ? valore : [valore]
}

function numero(valore: unknown): number | null {
  if (valore === undefined || valore === null || valore === '') return null
  const n = Number(String(valore).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function testo(valore: unknown): string | null {
  if (valore === undefined || valore === null) return null
  const t = String(valore).trim()
  return t === '' ? null : t
}

/** Natura FatturaPA che indicano inversione contabile: l'IVA la assolve chi riceve. */
const NATURE_REVERSE_CHARGE = ['N6', 'N6.1', 'N6.2', 'N6.3', 'N6.4', 'N6.5', 'N6.6', 'N6.7', 'N6.8', 'N6.9']

export function leggiFatturaPa(xml: string): FatturaLetta {
  let documento: Record<string, any>
  try {
    documento = parser.parse(xml)
  } catch (err) {
    throw new FatturaNonLeggibile(`XML non valido: ${err instanceof Error ? err.message : 'errore di lettura'}`)
  }

  const radice = documento.FatturaElettronica
  if (!radice) throw new FatturaNonLeggibile('Il file non è una fattura elettronica (manca FatturaElettronica).')

  const header = radice.FatturaElettronicaHeader ?? {}
  const cedente = header.CedentePrestatore?.DatiAnagrafici ?? {}
  const sedeCedente = header.CedentePrestatore?.Sede ?? {}
  const contatti = header.CedentePrestatore?.Contatti ?? {}
  const cessionario = header.CessionarioCommittente?.DatiAnagrafici ?? {}

  const denominazione =
    testo(cedente.Anagrafica?.Denominazione) ??
    [testo(cedente.Anagrafica?.Nome), testo(cedente.Anagrafica?.Cognome)].filter(Boolean).join(' ')
  if (!denominazione) throw new FatturaNonLeggibile('Fattura senza denominazione del fornitore.')

  // Un file può contenere più corpi (fatture multiple dello stesso fornitore). Prendiamo
  // il primo e lo segnaliamo a chi importa: meglio dirlo che unire documenti diversi.
  const corpo = elenco(radice.FatturaElettronicaBody)[0]
  if (!corpo) throw new FatturaNonLeggibile('Fattura senza corpo del documento.')

  const generali = corpo.DatiGenerali?.DatiGeneraliDocumento ?? {}
  const numeroDoc = testo(generali.Numero)
  const dataDoc = testo(generali.Data)
  if (!numeroDoc || !dataDoc) throw new FatturaNonLeggibile('Fattura senza numero o data.')

  const riepiloghi = elenco<Record<string, any>>(corpo.DatiBeniServizi?.DatiRiepilogo)
  const imponibile = riepiloghi.reduce((somma, r) => somma + (numero(r.ImponibileImporto) ?? 0), 0)
  const iva = riepiloghi.reduce((somma, r) => somma + (numero(r.Imposta) ?? 0), 0)
  const reverseCharge = riepiloghi.some((r) => {
    const natura = testo(r.Natura)
    return natura ? NATURE_REVERSE_CHARGE.includes(natura) : false
  })

  // Il totale dichiarato può mancare (è facoltativo in FatturaPA): in quel caso lo
  // ricostruiamo dai riepiloghi, che sono obbligatori.
  const totaleDichiarato = numero(generali.ImportoTotaleDocumento)
  const totale = totaleDichiarato ?? Math.round((imponibile + iva) * 100) / 100

  const pagamenti = elenco<Record<string, any>>(corpo.DatiPagamento)
  const dettagliPagamento = pagamenti.flatMap((p) => elenco<Record<string, any>>(p.DettaglioPagamento))
  // Con più rate prendiamo la prima scadenza: è quella che fa scattare il promemoria.
  const scadenze = dettagliPagamento.map((d) => testo(d.DataScadenzaPagamento)).filter(Boolean) as string[]
  const dataScadenza = scadenze.sort()[0] ?? null

  const righe = elenco<Record<string, any>>(corpo.DatiBeniServizi?.DettaglioLinee).map((linea) => ({
    descrizione: testo(linea.Descrizione) ?? '(senza descrizione)',
    quantita: numero(linea.Quantita),
    unitaMisura: testo(linea.UnitaMisura),
    prezzoUnitario: numero(linea.PrezzoUnitario),
    importo: numero(linea.PrezzoTotale) ?? 0,
    aliquotaIva: numero(linea.AliquotaIVA),
  }))

  const paese = testo(sedeCedente.Nazione) ?? testo(cedente.IdFiscaleIVA?.IdPaese) ?? 'IT'

  return {
    fornitore: {
      denominazione,
      partitaIva: testo(cedente.IdFiscaleIVA?.IdCodice),
      codiceFiscale: testo(cedente.CodiceFiscale),
      paese,
      citta: testo(sedeCedente.Comune),
      email: testo(contatti.Email),
    },
    destinatarioPartitaIva: testo(cessionario.IdFiscaleIVA?.IdCodice) ?? testo(cessionario.CodiceFiscale),
    numero: numeroDoc,
    data: dataDoc,
    divisa: testo(generali.Divisa) ?? 'EUR',
    imponibile: Math.round(imponibile * 100) / 100,
    iva: Math.round(iva * 100) / 100,
    totale,
    dataScadenza,
    modalitaPagamento: testo(dettagliPagamento[0]?.ModalitaPagamento),
    reverseCharge,
    righe,
    tipoDocumento: testo(generali.TipoDocumento),
  }
}

/** Quante fatture contiene il file: serve ad avvisare quando un XML ne porta più di una. */
export function contaDocumenti(xml: string): number {
  try {
    const radice = parser.parse(xml).FatturaElettronica
    return elenco(radice?.FatturaElettronicaBody).length
  } catch {
    return 0
  }
}
