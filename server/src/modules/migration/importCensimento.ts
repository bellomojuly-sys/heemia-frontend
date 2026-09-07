// Import del censimento nel database — Fase 21.
//
// Porta dentro i tre CSV di `03_Technical_Specification/Censimento_Dati/`: prodotti,
// varianti e fornitori. È l'ultimo pezzo di codice del progetto, ed è scritto per essere
// eseguito **più di una volta senza fare danni**, perché è così che si scopre se ha
// funzionato: si rilancia e i numeri non cambiano.
//
// Le cinque regole di Data_Migration §"Regole di migrazione già fissate":
//
//   1. **Idempotente, su codici stabili.** Un prodotto si riconosce dal `codice_prodotto`,
//      una variante dallo `sku`, un fornitore dal nome normalizzato. Rilanciare aggiorna,
//      non duplica.
//   2. **Lo stock entra tutto in laboratorio**, magazzino a zero (DEC-045, confermata da
//      Giulia il 2026-08-13). La divisione la fanno le persone dall'app con la
//      distribuzione iniziale guidata: per questo le giacenze nascono NON confermate.
//   3-4. Backup e staging sono procedura, non codice: stanno nel runbook.
//   5. **O tutto o niente.** L'intero import è una sola transazione: se una riga qualsiasi
//      fallisce, il database resta esattamente com'era. Niente correzioni parziali a mano
//      su un import andato a metà, che è il modo tipico in cui un database diventa
//      inattendibile senza che nessuno se ne accorga.
//
// Cosa NON fa, di proposito: non tocca ciò che non è nel censimento. I capi inseriti a mano
// dal team restano dove sono, e nessuna riga viene mai cancellata.
import { Prisma, SupplierCategoria, type ProductStage, type PubblicazioneShopify } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { badRequest } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import { derivatoDaTabella, tessutoConosciuto } from '../../core/tessuti.js'

/** Annulla la transazione di simulazione senza farla passare per un guasto. */
class AnnullaSimulazione extends Error {
  constructor(readonly esito: EsitoImport) {
    super('simulazione: nessuna scrittura mantenuta')
  }
}

export interface RigaProdotto {
  codice_prodotto: string
  nome: string
  categoria: string
  tessuto?: string
  taglie_disponibili: string
  colori_disponibili: string
  prezzo_vendita: string
  prezzo_showroom: string
  su_shopify: string
  costo_diretto: string
  vestibilita: string
  stock_totale: string
  /** Testi scritti dall'azienda su Notion (2026-09-07): qui si trasportano, non si riscrivono. */
  descrizione_breve?: string
  descrizione_tecnica?: string
}

export interface RigaVariante {
  sku: string
  codice_prodotto: string
  taglia: string
  colore: string
  stock_disponibile: string
}

export interface RigaFornitore {
  nome: string
  categoria: string
  piva: string
  citta: string
  telefono: string
  email: string
}

export interface Censimento {
  prodotti: RigaProdotto[]
  varianti: RigaVariante[]
  fornitori: RigaFornitore[]
  /** Capi esclusi dall'inventario iniziale per decisione (Denver e Moss, DEC-061 §12). */
  esclusiDallInventario: string[]
  /** Fase in cui entrano i capi importati (DEC-061 §10, dal 2026-09-07: `completato`). */
  faseIniziale: ProductStage
}

export interface EsitoImport {
  fornitori: { creati: number; aggiornati: number }
  prodotti: { creati: number; aggiornati: number }
  varianti: { create: number; aggiornate: number }
  giacenze: { create: number; aggiornate: number; pezzi: number }
  descrizioni: { inserite: number; riscritte: number; invariate: number }
  /** Capi a cui la tabella dei tessuti ha compilato composizione e consigli di cura. */
  curaCompilata: number
  /** Capi a cui è stato **tolto** un valore derivato da una regola non più valida. */
  curaRimossa: number
  /** Capi il cui tessuto non è nella tabella: restano senza composizione né consigli. */
  tessutoSconosciuto: { nome: string; tessuto: string }[]
  /** Capi senza costo diretto: entrano lo stesso, ma per loro il margine non si calcola. */
  senzaCostoDiretto: string[]
  /** Righe non scritte e perché: nessuna riga sparisce in silenzio. */
  saltate: { riga: string; motivo: string }[]
  simulazione: boolean
}

const num = (v: string | undefined): number | null => {
  const t = (v ?? '').trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const intero = (v: string | undefined): number | null => {
  const n = num(v)
  return n === null ? null : Math.round(n)
}

/** "S;M;L" oppure "S, M, L" → ["S","M","L"]: il censimento usa entrambe le forme. */
const lista = (v: string | undefined): string[] =>
  (v ?? '').split(/[;,|]/).map((x) => x.trim()).filter(Boolean)

/** Confronto fra nomi di fornitore: maiuscole, forme societarie e punteggiatura non contano. */
function normalizzaNome(nome: string): string {
  return nome
    .toLowerCase()
    .replace(/\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Prezzo al netto dell'IVA: si calcola, non si censisce. Aliquota 22%, la stessa che usa
 * il form di modifica del capo — il numero non deve dipendere da dove è stato inserito.
 */
const nettoIva = (lordo: number): number => Math.round((lordo / 1.22) * 100) / 100

const dec = (n: number) => new Prisma.Decimal(n)

/**
 * Traduce la categoria com'è scritta nel censimento — che usa il valore vero della tabella,
 * "Asole/Bottoni" — nel nome che si aspetta il client Prisma, "Asole_Bottoni". È la stessa
 * distinzione già segnalata per i paesi delle fatture ("Extra-EU" a database, `Extra_EU` nel
 * client): Prisma tiene i due mondi separati con `@map`, e chi legge un CSV sta nel primo.
 *
 * Una categoria sconosciuta **ferma l'import** invece di essere avvicinata a occhio: un
 * fornitore messo nella categoria sbagliata non se ne accorge nessuno per mesi.
 */
function categoriaFornitore(valore: string): SupplierCategoria {
  const nome = valore.trim().replace(/[/\s]+/g, '_')
  if (nome in SupplierCategoria) return nome as SupplierCategoria
  throw badRequest(
    `Categoria fornitore non riconosciuta: "${valore.trim()}". ` +
      `Quelle valide sono: ${Object.values(SupplierCategoria).join(', ')}.`,
  )
}

/** "true"/"si"/"sì"/"1" → pubblicato. Qualunque altra cosa, compreso il vuoto, → no. */
function statoShopify(v: string | undefined): PubblicazioneShopify {
  return ['true', 'si', 'sì', '1', 'x'].includes((v ?? '').trim().toLowerCase())
    ? 'pubblicato'
    : 'non_pubblicato'
}

/**
 * Esegue l'import. Con `simulazione: true` fa esattamente lo stesso lavoro e poi **annulla
 * tutto**: restituisce i numeri veri — quanti creati, quanti aggiornati, quali conflitti —
 * senza lasciare una riga a database. È il passaggio da fare per primo, sempre.
 */
export async function importaCensimento(
  censimento: Censimento,
  userId: string,
  opzioni: { simulazione?: boolean } = {},
): Promise<EsitoImport> {
  const simulazione = opzioni.simulazione ?? false

  if (censimento.prodotti.length === 0) throw badRequest('Il censimento non contiene prodotti.')

  // Controlli che devono fallire PRIMA di scrivere: una variante senza il suo capo non si
  // corregge a metà import.
  const codiciNoti = new Set(censimento.prodotti.map((p) => p.codice_prodotto.trim()))
  for (const v of censimento.varianti) {
    if (!codiciNoti.has(v.codice_prodotto.trim())) {
      throw badRequest(`La variante ${v.sku} fa riferimento al capo ${v.codice_prodotto}, che non è nel censimento.`)
    }
  }

  const esclusi = new Set(censimento.esclusiDallInventario.map((n) => n.trim()))
  const varPerCodice = new Map<string, RigaVariante[]>()
  for (const v of censimento.varianti) {
    const k = v.codice_prodotto.trim()
    varPerCodice.set(k, [...(varPerCodice.get(k) ?? []), v])
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const esito: EsitoImport = {
          fornitori: { creati: 0, aggiornati: 0 },
          prodotti: { creati: 0, aggiornati: 0 },
          varianti: { create: 0, aggiornate: 0 },
          giacenze: { create: 0, aggiornate: 0, pezzi: 0 },
          descrizioni: { inserite: 0, riscritte: 0, invariate: 0 },
          curaCompilata: 0,
          curaRimossa: 0,
          tessutoSconosciuto: [],
          senzaCostoDiretto: [],
          saltate: [],
          simulazione,
        }

        // ------------------------------------------------------------------ fornitori
        const esistenti = await tx.supplier.findMany({ select: { id: true, nome: true } })
        const perNome = new Map(esistenti.map((f) => [normalizzaNome(f.nome), f.id]))

        for (const f of censimento.fornitori) {
          const nome = f.nome.trim()
          if (!nome) continue
          if (!f.categoria.trim()) {
            esito.saltate.push({ riga: `fornitore ${nome}`, motivo: 'categoria mancante' })
            continue
          }
          // I campi vuoti restano `undefined`: significa «non lo so», e non deve cancellare
          // un dato che qualcuno ha già inserito a mano dall'app.
          const dati = {
            categoria: categoriaFornitore(f.categoria),
            partitaIva: f.piva.trim() || undefined,
            citta: f.citta.trim() || undefined,
            telefono: f.telefono.trim() || undefined,
            email: f.email.trim() || undefined,
          }
          const gia = perNome.get(normalizzaNome(nome))
          if (gia) {
            await tx.supplier.update({ where: { id: gia }, data: dati })
            esito.fornitori.aggiornati += 1
          } else {
            const creato = await tx.supplier.create({ data: { nome, ...dati }, select: { id: true } })
            perNome.set(normalizzaNome(nome), creato.id)
            esito.fornitori.creati += 1
          }
        }

        // ------------------------------------------------------------------ prodotti
        for (const p of censimento.prodotti) {
          const codice = p.codice_prodotto.trim()
          const prezzo = num(p.prezzo_vendita) ?? 0
          if (num(p.costo_diretto) === null) esito.senzaCostoDiretto.push(p.nome.trim())

          const dati = {
            nome: p.nome.trim(),
            categoria: p.categoria.trim() || undefined,
            taglieDisponibili: lista(p.taglie_disponibili),
            coloriDisponibili: lista(p.colori_disponibili),
            prezzoVendita: dec(prezzo),
            prezzoNettoIva: dec(prezzo > 0 ? nettoIva(prezzo) : 0),
            prezzoShowroom: dec(num(p.prezzo_showroom) ?? 0),
            vestibilita: p.vestibilita.trim() || undefined,
            tessuto: (p.tessuto ?? '').trim() || undefined,
            // I capi del censimento sono già prodotti e pronti alla vendita (DEC-061 §10):
            // entrano in Vendita senza passare dalle fasi produttive.
            stato: censimento.faseIniziale,
            statoPubblicazioneShopify: statoShopify(p.su_shopify),
          }

          const gia = await tx.product.findUnique({
            where: { codiceProdotto: codice },
            select: { id: true, descrizioneBreve: true, descrizioneTecnica: true, composizione: true, consigliCura: true },
          })

          // Le descrizioni si scrivono solo se il censimento ne ha una: un campo vuoto nel
          // CSV significa «non lo so», e non deve cancellare un testo scritto dall'app.
          // Lo **stato** di approvazione non si tocca mai: se una persona ha approvato un
          // testo, non è questo file a poterlo decidere.
          // Composizione e consigli di cura si ricavano dal tessuto (core/tessuti.ts, dalla
          // pagina Notion «CONSIGLI DEL TEAM»). Un tessuto che la tabella non conosce — le
          // combinazioni con fodera — resta senza: un'etichetta di lavaggio inventata e'
          // peggio di un campo vuoto.
          const tessuto = tessutoConosciuto(p.tessuto)
          if (tessuto) {
            Object.assign(dati, { composizione: tessuto.composizione, consigliCura: tessuto.consigliCura })
            esito.curaCompilata += 1
          } else if ((p.tessuto ?? '').trim()) {
            esito.tessutoSconosciuto.push({ nome: p.nome.trim(), tessuto: (p.tessuto ?? '').trim() })
            // Un tessuto può **uscire** dalla tabella, come è successo alla viscosa il
            // 2026-09-07: la regola era sbagliata. In quel caso i valori che avevamo
            // derivato restano a database e diventano un'etichetta di lavaggio falsa, che è
            // peggio di un campo vuoto. Si tolgono — ma **solo** se combaciano esattamente
            // con una riga della tabella, cioè solo se li avevamo messi noi: un testo
            // scritto a mano da una persona non si tocca.
            if (gia && derivatoDaTabella(gia.composizione, gia.consigliCura)) {
              Object.assign(dati, { composizione: null, consigliCura: null, consigliCuraStato: 'bozza' as const })
              esito.curaRimossa += 1
            }
          }

          const breve = (p.descrizione_breve ?? '').trim()
          const tecnica = (p.descrizione_tecnica ?? '').trim()
          if (breve || tecnica) {
            if (!gia || (!gia.descrizioneBreve && !gia.descrizioneTecnica)) esito.descrizioni.inserite += 1
            else if (breve !== (gia.descrizioneBreve ?? '') || tecnica !== (gia.descrizioneTecnica ?? '')) {
              // Un testo che cambia va detto: chi rilancia l'import deve sapere che una
              // descrizione già a database è stata sostituita da quella di Notion.
              esito.descrizioni.riscritte += 1
            } else {
              esito.descrizioni.invariate += 1
            }
          }
          // I testi di Notion sono gia' stati controllati dall'azienda (Giulia, 2026-09-07):
          // entrano come **approvati**, non come bozza. Vale solo per i testi che arrivano
          // dal censimento: un campo vuoto non tocca nulla, stato compreso.
          Object.assign(dati, {
            descrizioneBreve: breve || undefined,
            descrizioneTecnica: tecnica || undefined,
            ...(breve ? { descrizioneBreveStato: 'approvata' as const } : {}),
            ...(tessuto ? { consigliCuraStato: 'approvata' as const } : {}),
          })

          let productId: string
          if (gia) {
            await tx.product.update({ where: { id: gia.id }, data: dati })
            productId = gia.id
            esito.prodotti.aggiornati += 1
          } else {
            const creato = await tx.product.create({
              data: { codiceProdotto: codice, linea: 'tessile', ...dati },
              select: { id: true },
            })
            productId = creato.id
            esito.prodotti.creati += 1
          }

          // Denver e Moss entrano in catalogo ma non in inventario (DEC-061 §12).
          if (esclusi.has(p.nome.trim())) continue

          // ------------------------------------------------------------------ varianti
          for (const v of varPerCodice.get(codice) ?? []) {
            const sku = v.sku.trim()
            const stock = intero(v.stock_disponibile) ?? 0

            const variante = await tx.productVariant.findUnique({ where: { sku }, select: { id: true } })
            let variantId: string
            if (variante) {
              await tx.productVariant.update({
                where: { id: variante.id },
                data: { productId, taglia: v.taglia.trim(), colore: v.colore.trim(), stockDisponibile: stock },
              })
              variantId = variante.id
              esito.varianti.aggiornate += 1
            } else {
              const creata = await tx.productVariant.create({
                data: { productId, sku, taglia: v.taglia.trim(), colore: v.colore.trim(), stockDisponibile: stock },
                select: { id: true },
              })
              variantId = creata.id
              esito.varianti.create += 1
            }

            // ---------------------------------------------------------------- giacenze
            // Regola 2: tutto in laboratorio, magazzino a zero, distribuzione **non
            // confermata** — è la fase guidata in cui le persone dicono dove sono davvero
            // i pezzi. `totaleMigrazione` è il totale dichiarato: serve a quel controllo.
            const record = await tx.inventoryRecord.findUnique({
              where: { variantId },
              select: { id: true, migrazioneCompletata: true },
            })
            if (!record) {
              await tx.inventoryRecord.create({
                data: { variantId, qtaLaboratorio: stock, qtaMagazzino: 0, totaleMigrazione: stock, migrazioneCompletata: false },
              })
              esito.giacenze.create += 1
              esito.giacenze.pezzi += stock
            } else if (record.migrazioneCompletata) {
              // Una distribuzione già confermata non si sovrascrive: quel numero l'ha
              // verificato una persona guardando gli scaffali, questo file no.
              esito.saltate.push({ riga: `giacenza ${sku}`, motivo: 'distribuzione già confermata dall\'app' })
            } else {
              await tx.inventoryRecord.update({
                where: { id: record.id },
                data: { qtaLaboratorio: stock, qtaMagazzino: 0, totaleMigrazione: stock },
              })
              esito.giacenze.aggiornate += 1
              esito.giacenze.pezzi += stock
            }
          }
        }

        if (simulazione) throw new AnnullaSimulazione(esito)

        await logActivity(tx, {
          userId,
          azione: 'import_censimento',
          entita: 'migrazione',
          valoreNuovo:
            `${esito.prodotti.creati} capi creati e ${esito.prodotti.aggiornati} aggiornati · ` +
            `${esito.varianti.create} varianti create e ${esito.varianti.aggiornate} aggiornate · ` +
            `${esito.giacenze.pezzi} pezzi in laboratorio · ` +
            `${esito.descrizioni.inserite + esito.descrizioni.riscritte} descrizioni scritte · ` +
            `${esito.curaCompilata} composizioni e consigli di cura · ` +
            `${esito.fornitori.creati} fornitori creati e ${esito.fornitori.aggiornati} aggiornati`,
        })
        return esito
      },
      { timeout: 180_000, maxWait: 30_000 },
    )
  } catch (e) {
    if (e instanceof AnnullaSimulazione) return e.esito
    throw e
  }
}
