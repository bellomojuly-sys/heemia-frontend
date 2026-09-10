// Lo storico delle misure: la parte che non parla né con il database né con OpenAI.
//
// Decisione di Giulia del 2026-09-10 (DEC-069): l'AI non propone più solo QUALI misure
// servono, propone anche QUANTO devono misurare — e i numeri devono venire dallo storico
// Heemia, cioè dalle misure già compilate nelle schede tecniche dei capi della stessa
// categoria. Non esiste una tabella taglie aziendale, e inventarla avrebbe messo in scheda
// numeri con l'aria di essere ufficiali senza che nessuno li avesse decisi.
//
// Qui vivono tre cose, tutte pure e quindi verificabili senza server:
//   1. `riassumiStorico` — dalle righe grezze ai gruppi (una misura, una unità, le taglie).
//   2. `testoStorico`   — come lo storico viene raccontato al modello.
//   3. `filtraValoriInventati` — il guardrail: un valore che lo storico non regge viene
//      tolto, e la misura torna a essere proposta senza numero.
//
// Il punto (3) è la ragione per cui questo file esiste separato dal resto. Il divieto di
// inventare numeri non è sparito con DEC-069: si è spostato. Il prompt lo chiede, ma un
// prompt è una richiesta, non una garanzia — e una misura sbagliata in scheda tecnica
// diventa un capo tagliato male. Il controllo sta nel codice, dove si può provare.

/** Una misura già registrata su una scheda tecnica, così come esce dal database. */
export interface RigaStorica {
  nome: string
  unita: string
  taglia: string | null
  valore: number
  /** Nome del capo da cui viene: serve a rendere la proposta verificabile, non a calcolare. */
  capo: string
}

/** Tutte le rilevazioni della stessa misura, nella stessa unità e taglia. */
export interface GruppoStorico {
  /** Nome normalizzato: è la chiave con cui si riconosce la stessa misura scritta diversa. */
  chiave: string
  /** Il nome come lo scrive chi compila, nella forma più ricorrente. */
  etichetta: string
  unita: string
  /** Una taglia sola: numeri di taglie diverse non devono mai finire nella stessa media. */
  taglia: string | null
  rilevazioni: number
  min: number
  max: number
  media: number
  /** Capi di provenienza, senza ripetizioni. */
  capi: string[]
}

/** Quanto si può sbordare dall'intervallo osservato: arrotondare non è inventare. */
const TOLLERANZA: Record<string, number> = { cm: 0.5, mm: 5, in: 0.25 }
const tolleranzaDi = (unita: string) => TOLLERANZA[unita.toLowerCase()] ?? 0.5

/**
 * Chiave di confronto fra nomi di misura: minuscolo, senza accenti, senza punteggiatura,
 * spazi singoli. «Larghezza spalle», «larghezza  spalle» e «Larghezza Spalle:» sono la
 * stessa misura; chi compila le schede non scrive due volte allo stesso modo.
 */
export function chiaveMisura(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const arrotonda = (n: number) => Math.round(n * 100) / 100

/** Dal più frequente al meno, a parità di frequenza in ordine di prima comparsa. */
function perFrequenza(valori: string[]): string[] {
  const conteggio = new Map<string, number>()
  for (const v of valori) conteggio.set(v, (conteggio.get(v) ?? 0) + 1)
  return [...conteggio.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v)
}

/**
 * Raggruppa le rilevazioni per misura, unità e taglia. Unità e taglie diverse restano
 * gruppi diversi: 48 cm in S e 54 cm in L non possono diventare una media 51 attribuita a
 * una taglia scelta per maggioranza. Convertire o sviluppare una taglia non è il mestiere
 * di questo modulo.
 */
export function riassumiStorico(righe: RigaStorica[]): GruppoStorico[] {
  const gruppi = new Map<string, {
    nomi: string[]
    unita: string
    taglie: string[]
    valori: number[]
    capi: string[]
  }>()

  for (const riga of righe) {
    const nome = riga.nome.trim()
    const chiave = chiaveMisura(nome)
    if (!chiave || !Number.isFinite(riga.valore)) continue
    const unita = riga.unita.trim().toLowerCase() || 'cm'
    const taglia = riga.taglia?.trim() ?? ''
    const id = `${chiave}|${unita}|${taglia.toLocaleLowerCase('it')}`
    const gruppo = gruppi.get(id) ?? { nomi: [], unita, taglie: [], valori: [], capi: [] }
    gruppo.nomi.push(nome)
    gruppo.valori.push(riga.valore)
    if (taglia) gruppo.taglie.push(taglia)
    if (riga.capo?.trim()) gruppo.capi.push(riga.capo.trim())
    gruppi.set(id, gruppo)
  }

  return [...gruppi.entries()]
    .map(([id, g]) => {
      const somma = g.valori.reduce((t, v) => t + v, 0)
      return {
        chiave: id.split('|')[0],
        etichetta: perFrequenza(g.nomi)[0],
        unita: g.unita,
        taglia: perFrequenza(g.taglie)[0] ?? null,
        rilevazioni: g.valori.length,
        min: arrotonda(Math.min(...g.valori)),
        max: arrotonda(Math.max(...g.valori)),
        media: arrotonda(somma / g.valori.length),
        capi: [...new Set(g.capi)],
      }
    })
    .sort((a, b) =>
      b.rilevazioni - a.rilevazioni ||
      a.etichetta.localeCompare(b.etichetta, 'it') ||
      (a.taglia ?? '').localeCompare(b.taglia ?? '', 'it'),
    )
}

/** Quanti capi diversi hanno contribuito, in tutto. */
export function capiCoinvolti(gruppi: GruppoStorico[]): number {
  return new Set(gruppi.flatMap((g) => g.capi)).size
}

/**
 * Lo storico raccontato al modello. Se non c'è, lo dice: è il caso normale finché le schede
 * tecniche non si riempiono, e il modello deve saperlo per non riempire i vuoti da sé.
 */
export function testoStorico(gruppi: GruppoStorico[], categoria: string, maxMisure = 25): string {
  if (gruppi.length === 0) {
    return (
      `MISURE GIÀ REGISTRATE SU CAPI DELLA CATEGORIA «${categoria}»: nessuna.\n` +
      'Non c\'è storico da cui ricavare i valori: proponi solo l\'elenco delle misure e lascia ' +
      'ogni valore a null.'
    )
  }

  const righe = gruppi.slice(0, maxMisure).map((g) => {
    const intervallo = g.min === g.max ? `${g.min}` : `da ${g.min} a ${g.max}, media ${g.media}`
    const taglia = g.taglia ? ` · taglia ${g.taglia}` : ' · taglia non indicata'
    const capi = g.capi.slice(0, 3).join(', ')
    const altri = g.capi.length > 3 ? ` e altri ${g.capi.length - 3}` : ''
    return `- ${g.etichetta} (${g.unita})${taglia}: ${g.rilevazioni} rilevazioni, ${intervallo} — ${capi}${altri}`
  })

  return (
    `MISURE GIÀ REGISTRATE SU CAPI DELLA CATEGORIA «${categoria}» (schede tecniche Heemia):\n` +
    righe.join('\n')
  )
}

/** La misura come esce dal modello, prima del controllo. */
export interface MisuraProposta {
  nome: string
  unita: 'cm' | 'mm' | 'in'
  valore: number | null
  tagliaRiferimento: string | null
  tolleranza: string | null
  nota: string | null
}

/** La misura dopo il controllo: `fonteValore` dice da dove viene il numero, se c'è. */
export interface MisuraControllata extends MisuraProposta {
  fonteValore: 'storico' | null
}

/**
 * Il guardrail. Un valore sopravvive solo se lo storico lo regge:
 *
   *   - la misura deve esistere nello storico, con la stessa unità;
   *   - il numero deve stare nell'intervallo osservato per quella taglia, con la tolleranza
   *     di un arrotondamento.
 *
 * Tutto il resto torna a `null`. Non è pessimismo verso il modello: è che la scheda tecnica
 * deve poter dire «non lo so», come già fa il costo diretto (DEC-066). Una misura vuota si
 * compila; una misura sbagliata si scopre sul capo tagliato.
 *
 * La taglia di riferimento segue lo stesso principio: se il modello ne indica una, il
 * valore deve essere sostenuto proprio dallo storico di quella taglia. Se non la indica,
 * si sceglie il gruppo compatibile col valore con più rilevazioni. Senza valore non ha
 * senso e viene tolta.
 */
export function filtraValoriInventati(
  misure: MisuraProposta[],
  gruppi: GruppoStorico[],
): MisuraControllata[] {
  const perChiave = new Map<string, GruppoStorico[]>()
  for (const gruppo of gruppi) {
    const id = `${gruppo.chiave}|${gruppo.unita}`
    perChiave.set(id, [...(perChiave.get(id) ?? []), gruppo])
  }
  const viste = new Set<string>()
  const controllate: MisuraControllata[] = []

  for (const misura of misure) {
    const nome = misura.nome?.trim()
    if (!nome) continue
    const chiave = chiaveMisura(nome)
    if (!chiave || viste.has(chiave)) continue
    viste.add(chiave)

    const candidati = perChiave.get(`${chiave}|${misura.unita}`) ?? []
    const valore = typeof misura.valore === 'number' && Number.isFinite(misura.valore) ? misura.valore : null

    const sostiene = (gruppo: GruppoStorico) => {
      if (valore === null) return false
      const margine = tolleranzaDi(gruppo.unita)
      return valore >= gruppo.min - margine && valore <= gruppo.max + margine
    }

    const tagliaProposta = misura.tagliaRiferimento?.trim() ?? ''
    const gruppoDellaTaglia = tagliaProposta
      ? candidati.find((g) => (g.taglia ?? '').localeCompare(tagliaProposta, 'it', { sensitivity: 'accent' }) === 0)
      : undefined
    // Se il modello ha indicato una taglia, non si ripiega silenziosamente su un'altra:
    // sarebbe proprio l'errore che il raggruppamento per taglia deve impedire.
    const gruppo = tagliaProposta
      ? (gruppoDellaTaglia && sostiene(gruppoDellaTaglia) ? gruppoDellaTaglia : undefined)
      : candidati.filter(sostiene).sort((a, b) => b.rilevazioni - a.rilevazioni)[0]

    const valoreAmmesso = gruppo && valore !== null ? arrotonda(valore) : null

    let taglia: string | null = null
    if (valoreAmmesso !== null && gruppo) taglia = gruppo.taglia

    controllate.push({
      nome,
      unita: misura.unita,
      valore: valoreAmmesso,
      tagliaRiferimento: taglia,
      tolleranza: misura.tolleranza?.trim() || null,
      nota: misura.nota?.trim() || null,
      fonteValore: valoreAmmesso !== null ? 'storico' : null,
    })
  }

  return controllate
}
