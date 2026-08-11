// Import delle fatture elettroniche ricevute — FR-19/FR-20, [[API_Mapping]] §B6.
//
// Le fatture dei fornitori arrivano da sole al Sistema di Interscambio quando il fornitore
// le emette; dall'area riservata dell'Agenzia si scaricano in blocco (uno ZIP di XML,
// alcuni firmati `.p7m`). Qui quei file diventano fatture di Heemia — con il fornitore
// riconosciuto, gli importi, le righe e la scadenza di pagamento, che alimenta `/scadenze`.
//
// Perché conta: dalle fatture esce il **costo unitario medio ponderato dei materiali**
// (`lib/materialCosting.ts`), quindi ogni fattura che non entra è un costo che manca al
// break-even dei capi.
//
// Nota di struttura: la lettura dell'XML sta in `fatturapa.ts`, separata e senza database.
// Quando l'integrazione automatica sarà attiva (provider accreditato SDI che consegna le
// fatture via webhook), il file arriverà da un'altra porta ma passerà **da qui**: cambia
// come arriva, non come viene interpretato.
import { Prisma, type CategoriaCosto, type InvoicePaese } from '@prisma/client'
import JSZip from 'jszip'
import { prisma } from '../../core/prisma.js'
import { AppError, badRequest } from '../../core/errors.js'
import { reportError } from '../../core/reportError.js'
import { logActivity } from '../../core/activityLog.js'
import { estraiXml, leggiFatturaPa, contaDocumenti, FatturaNonLeggibile, type FatturaLetta } from './fatturapa.js'

/** Limite del file caricato: uno ZIP di fatture di un anno sta molto sotto. */
const MAX_BYTES = 25 * 1024 * 1024
/** Quante fatture al massimo in un solo caricamento, per non lasciare la richiesta appesa. */
const MAX_FATTURE = 500
/** Limite del contenuto **decompresso**: uno ZIP piccolo può nascondere molto di più. */
const MAX_ESPANSO_BYTES = 200 * 1024 * 1024

export type EsitoRiga =
  | { file: string; esito: 'importata'; invoiceId: string; fornitore: string; numero: string; totale: number }
  | { file: string; esito: 'gia_presente'; fornitore: string; numero: string }
  | { file: string; esito: 'scartata'; motivo: string }

export interface EsitoImport {
  importate: number
  giaPresenti: number
  scartate: number
  fornitoriCreati: string[]
  righe: EsitoRiga[]
}

/** I paesi UE: servono a classificare la fattura come IT / UE / Extra-UE (FR-22). */
const UE = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK',
])

function paeseFattura(paese: string): InvoicePaese {
  const p = paese.toUpperCase()
  if (p === 'IT') return 'IT'
  return UE.has(p) ? 'EU' : 'Extra_EU'
}

/**
 * Categoria di costo proposta dal contenuto della fattura. È solo un **suggerimento**:
 * la classificazione vera la fa la persona dalla schermata Fatture, come già avviene per
 * le fatture inserite a mano (DEC-008, il criterio non è deducibile in modo affidabile).
 * Nel dubbio resta `costi_generali`, che è anche il default del database.
 */
function categoriaProposta(f: FatturaLetta): CategoriaCosto {
  const testo = [f.fornitore.denominazione, ...f.righe.map((r) => r.descrizione)].join(' ').toLowerCase()
  const contiene = (...parole: string[]) => parole.some((p) => testo.includes(p))
  // L'ordine conta, e la lavorazione va per prima: una fattura di servizio nomina quasi
  // sempre il materiale su cui è stato fatto il lavoro ("ricamo logo su felpa"), mentre una
  // fattura di tessuto non nomina il ricamo. Con l'ordine opposto quella riga finiva in
  // "tessuto" — trovato provando dal browser, non leggendo il codice.
  if (contiene('confezion', 'modellist', 'taglio', 'ricamo', 'stampa', 'laborator', 'orlatur', 'stiratur')) return 'manodopera'
  if (contiene('bottoni', 'zip', 'cerniera', 'etichett', 'cartellin', 'passamaneria', 'fodera')) return 'accessori'
  if (contiene('tessut', 'tessitur', 'lana', 'cotone', 'seta', 'jersey', 'felpa', 'maglia')) return 'tessuto'
  if (contiene('imballaggi', 'packaging', 'scatol', 'shopper')) return 'packaging'
  if (contiene('spedizion', 'corriere', 'trasport', 'dhl', 'brt', 'gls')) return 'spedizione'
  if (contiene('pubblicit', 'marketing', 'social', 'campagna', 'fotograf')) return 'marketing'
  if (contiene('commercialist', 'consulen', 'notaio', 'avvocat')) return 'servizi'
  return 'costi_generali'
}

/** Normalizza una partita IVA per il confronto: via spazi, punti e prefisso paese. */
function normalizzaPiva(valore: string | null | undefined): string | null {
  if (!valore) return null
  const pulita = valore.replace(/[\s.\-]/g, '').toUpperCase()
  const senzaPrefisso = /^[A-Z]{2}\d+$/.test(pulita) ? pulita.slice(2) : pulita
  return senzaPrefisso || null
}

/** Confronto fra nomi di fornitore: maiuscole, forme societarie e punteggiatura non contano. */
function normalizzaNome(nome: string): string {
  return nome
    .toLowerCase()
    .replace(/\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|società|societa|ditta)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

interface FileDaLeggere {
  nome: string
  contenuto: Buffer
}

/**
 * Espande il caricamento in singoli file XML. Accetta uno ZIP (com'è scaricato dall'area
 * riservata) oppure un XML singolo, firmato o no.
 */
async function espandi(nomeFile: string, dati: Buffer): Promise<FileDaLeggere[]> {
  const nome = nomeFile.toLowerCase()
  // La firma dello ZIP ("PK") è più affidabile dell'estensione, che a volte è sbagliata.
  const sembraZip = dati.length > 2 && dati[0] === 0x50 && dati[1] === 0x4b
  if (!sembraZip && !nome.endsWith('.zip')) return [{ nome: nomeFile, contenuto: dati }]

  const zip = await JSZip.loadAsync(dati).catch(() => {
    throw badRequest('Lo ZIP non è leggibile. Riprova a scaricarlo dall\'area riservata.')
  })
  const dentro: FileDaLeggere[] = []
  // Il limite di 25 MB vale sul file compresso; quanto diventa una volta aperto è un'altra
  // cosa, e uno ZIP costruito apposta può espandersi in gigabyte e far finire la memoria al
  // server. Qui si somma man mano e ci si ferma: il pacchetto di un anno di fatture sta
  // largamente sotto questa soglia.
  let espansi = 0
  for (const voce of Object.values(zip.files)) {
    if (voce.dir) continue
    const n = voce.name.split('/').pop() ?? voce.name
    // Nel pacchetto dell'Agenzia ci sono anche metadati e ricevute: non sono fatture.
    if (n.startsWith('.') || n.startsWith('__MACOSX')) continue
    if (/_MT_|metadato/i.test(n)) continue
    if (!/\.(xml|p7m)$/i.test(n)) continue
    const contenuto = Buffer.from(await voce.async('nodebuffer'))
    espansi += contenuto.length
    if (espansi > MAX_ESPANSO_BYTES) {
      throw badRequest(
        `Il contenuto dello ZIP supera ${MAX_ESPANSO_BYTES / 1024 / 1024} MB una volta aperto. Dividi il pacchetto per periodo.`,
      )
    }
    dentro.push({ nome: n, contenuto })
  }
  if (dentro.length === 0) {
    throw badRequest('Nello ZIP non ci sono fatture elettroniche (file .xml o .xml.p7m).')
  }
  return dentro
}

export async function importaFattureElettroniche(
  input: { nomeFile: string; contenutoBase64: string; partitaIvaHeemia?: string },
  userId: string,
): Promise<EsitoImport> {
  const dati = Buffer.from(input.contenutoBase64.replace(/^data:[^,]+,/, ''), 'base64')
  if (dati.length === 0) throw badRequest('File vuoto.')
  if (dati.length > MAX_BYTES) {
    throw badRequest(`Il file pesa ${Math.round(dati.length / 1024 / 1024)} MB: il limite è ${MAX_BYTES / 1024 / 1024} MB.`)
  }

  const files = await espandi(input.nomeFile, dati)
  if (files.length > MAX_FATTURE) {
    throw badRequest(`Il file contiene ${files.length} documenti: il limite è ${MAX_FATTURE} per caricamento. Dividi lo ZIP per periodo.`)
  }

  const pivaHeemia = normalizzaPiva(input.partitaIvaHeemia)
  const righe: EsitoRiga[] = []
  const fornitoriCreati: string[] = []

  for (const file of files) {
    try {
      const xml = estraiXml(file.contenuto)
      const multiple = contaDocumenti(xml)
      const fattura = leggiFatturaPa(xml)

      // Fattura emessa DA Heemia (vendita), non ricevuta: qui importiamo gli acquisti.
      const pivaCedente = normalizzaPiva(fattura.fornitore.partitaIva)
      if (pivaHeemia && pivaCedente === pivaHeemia) {
        righe.push({ file: file.nome, esito: 'scartata', motivo: 'È una fattura emessa da Heemia, non ricevuta.' })
        continue
      }
      const pivaDestinatario = normalizzaPiva(fattura.destinatarioPartitaIva)
      if (pivaHeemia && pivaDestinatario && pivaDestinatario !== pivaHeemia) {
        righe.push({ file: file.nome, esito: 'scartata', motivo: `Intestata a un'altra partita IVA (${fattura.destinatarioPartitaIva}).` })
        continue
      }

      const esito = await salvaFattura(fattura, file.nome, userId, fornitoriCreati)
      if (multiple > 1 && esito.esito === 'importata') {
        righe.push({
          ...esito,
          file: `${file.nome} (attenzione: il file contiene ${multiple} documenti, importato solo il primo)`,
        })
      } else {
        righe.push(esito)
      }
    } catch (err) {
      // Due categorie diverse, e vanno tenute separate. «Questa fattura non si legge» è
      // un'informazione per chi importa, e il messaggio va mostrato. Qualunque altro
      // errore è un guasto nostro: il suo testo può contenere dettagli interni (nomi di
      // colonne, vincoli, percorsi) e non deve uscire dall'API — vale la stessa regola
      // dell'handler globale in app.ts, che risponde «Errore interno del server».
      const previsto = err instanceof FatturaNonLeggibile || err instanceof AppError
      if (!previsto) reportError(err)
      const motivo = previsto
        ? (err as Error).message
        : 'Errore interno durante la lettura di questo file: le altre fatture del pacchetto non sono state toccate.'
      righe.push({ file: file.nome, esito: 'scartata', motivo })
    }
  }

  return {
    importate: righe.filter((r) => r.esito === 'importata').length,
    giaPresenti: righe.filter((r) => r.esito === 'gia_presente').length,
    scartate: righe.filter((r) => r.esito === 'scartata').length,
    fornitoriCreati,
    righe,
  }
}

async function salvaFattura(
  fattura: FatturaLetta,
  nomeFile: string,
  userId: string,
  fornitoriCreati: string[],
): Promise<EsitoRiga> {
  const fornitore = await trovaOCreaFornitore(fattura, userId, fornitoriCreati)

  const data = new Date(fattura.data)
  if (Number.isNaN(data.getTime())) throw new FatturaNonLeggibile(`Data non valida: ${fattura.data}`)

  const gia = await prisma.invoice.findFirst({
    where: { fornitoreId: fornitore.id, numero: fattura.numero, data },
    select: { id: true },
  })
  if (gia) {
    return { file: nomeFile, esito: 'gia_presente', fornitore: fornitore.nome, numero: fattura.numero }
  }

  // Nota di credito (TD04/TD08): gli importi vanno in negativo, altrimenti un rimborso
  // verrebbe sommato ai costi invece che sottratto.
  const segno = fattura.tipoDocumento === 'TD04' || fattura.tipoDocumento === 'TD08' ? -1 : 1

  const creata = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        numero: fattura.numero,
        data,
        fornitoreId: fornitore.id,
        paese: paeseFattura(fattura.fornitore.paese),
        valuta: fattura.divisa,
        imponibile: new Prisma.Decimal(segno * fattura.imponibile),
        iva: new Prisma.Decimal(segno * fattura.iva),
        totale: new Prisma.Decimal(segno * fattura.totale),
        categoriaCosto: categoriaProposta(fattura),
        statoPagamento: 'da_pagare',
        dataScadenza: fattura.dataScadenza ? new Date(fattura.dataScadenza) : null,
        reverseCharge: fattura.reverseCharge,
        origineXml: nomeFile,
        noteAmministrative: fattura.righe
          .slice(0, 20)
          .map((r) => `${r.descrizione}${r.quantita ? ` — ${r.quantita}${r.unitaMisura ? ' ' + r.unitaMisura : ''}` : ''}: ${r.importo.toFixed(2)} €`)
          .join('\n'),
      },
    })
    await logActivity(tx, {
      userId,
      azione: 'create',
      entita: 'invoice',
      entitaId: invoice.id,
      valoreNuovo: `Importata da fattura elettronica ${nomeFile} (${fornitore.nome}, ${fattura.numero})`,
    })
    return invoice
  })

  return {
    file: nomeFile,
    esito: 'importata',
    invoiceId: creata.id,
    fornitore: fornitore.nome,
    numero: fattura.numero,
    totale: segno * fattura.totale,
  }
}

/**
 * Riconosce il fornitore, e se non esiste lo crea. L'ordine dei tentativi non è casuale:
 * la **partita IVA** è l'unico dato stabile (il nome nelle fatture è scritto in mille
 * modi), quindi si prova prima quella, poi il nome normalizzato, e solo alla fine si
 * crea un fornitore nuovo — registrando la partita IVA, così la volta dopo si riconosce.
 */
async function trovaOCreaFornitore(fattura: FatturaLetta, userId: string, creati: string[]) {
  const piva = normalizzaPiva(fattura.fornitore.partitaIva);

  if (piva) {
    const perPiva = await prisma.supplier.findFirst({ where: { partitaIva: piva } })
    if (perPiva) return perPiva
  }

  const nomeNorm = normalizzaNome(fattura.fornitore.denominazione)
  const tutti = await prisma.supplier.findMany({ select: { id: true, nome: true, partitaIva: true } })
  const perNome = tutti.find((s) => normalizzaNome(s.nome) === nomeNorm)
  if (perNome) {
    // Occasione utile: il fornitore c'era ma senza partita IVA, e ora ce l'abbiamo.
    if (piva && !perNome.partitaIva) {
      await prisma.supplier.update({ where: { id: perNome.id }, data: { partitaIva: piva } })
    }
    return (await prisma.supplier.findUnique({ where: { id: perNome.id } }))!
  }

  const nuovo = await prisma.$transaction(async (tx) => {
    const s = await tx.supplier.create({
      data: {
        nome: fattura.fornitore.denominazione,
        // La categoria non è deducibile dalla fattura: resta da sistemare a mano in
        // anagrafica, ed è la prima cosa che si nota aprendo l'elenco fornitori.
        categoria: 'Consulenza',
        citta: fattura.fornitore.citta,
        paese: fattura.fornitore.paese,
        email: fattura.fornitore.email,
        partitaIva: piva,
        note: 'Creato automaticamente dall\'import delle fatture elettroniche: categoria da verificare.',
      },
    })
    await logActivity(tx, {
      userId,
      azione: 'create',
      entita: 'supplier',
      entitaId: s.id,
      valoreNuovo: `${s.nome} (creato dall'import fatture)`,
    })
    return s
  })
  creati.push(nuovo.nome)
  return nuovo
}
