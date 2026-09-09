// Abbinamento automatico foto ↔ capi, dal nome del file (FR-16, Fase 21).
//
// Su Drive esiste già una convenzione che non è scritta da nessuna parte ma è rispettata
// da tutte le foto: **il file si chiama con il nome del capo**. `Malta.jpg`,
// `PECHINO + HELSINKI CORDA .jpg`, `brasile formentera .HEIC`. I nomi dei capi sono nomi
// di città e di luoghi (Pechino, Helsinki, Cefalù…), e questo è ciò che rende la cosa
// possibile: sono parole intere e distinguibili, non sigle.
//
// Tre fatti letti dai file veri, che decidono l'algoritmo:
//
//  1. **Una foto può mostrare due capi.** `PECHINO + HELSINKI` è la giacca e il pantalone
//     dello stesso look. La foto va collegata a entrambi i capi, non a uno solo: è la
//     stessa foto che serve a riconoscere l'uno e l'altro.
//  2. **Nel nome ci sono anche i colori** («CORDA», «SALMONE»). Vanno ignorati, e non solo
//     per pulizia: «SALMONE» somiglia al capo «Sal» abbastanza da poterlo agganciare per
//     sbaglio. La lista dei colori è la difesa contro l'abbinamento sbagliato.
//  3. **I nomi sono scritti a mano**, quindi con refusi e accenti incoerenti: `helsinky`,
//     `manatthan`, `cefalu`. Un confronto esatto perderebbe queste foto.
//
// Da qui le due categorie del risultato: `certa` (il nome del capo compare tale e quale,
// a meno di accenti e maiuscole) e `probabile` (ci si arriva correggendo un refuso). La
// distinzione non è cosmetica — l'interfaccia propone le prime già spuntate e chiede
// conferma sulle seconde. Un abbinamento sbagliato mette la foto del pantalone dentro la
// scheda della giacca, ed è un errore che poi si trova solo guardando capo per capo.
//
// Nessuna I/O qui dentro: si entra con l'elenco dei file e quello dei capi, si esce con le
// proposte. È il pezzo che si può provare senza Drive e senza database — test/abbinamento-foto.test.ts.

/** Parole che compaiono nei nomi dei file e non sono mai nomi di capi. */
const PAROLE_IGNORATE = new Set([
  // Colori usati nel campionario: la ragione principale per cui questa lista esiste.
  'bianco', 'bianca', 'nero', 'nera', 'beige', 'panna', 'ecru', 'ecrù', 'avorio', 'crema',
  'corda', 'cammello', 'sabbia', 'fango', 'tortora', 'grigio', 'grigia', 'antracite',
  'blu', 'azzurro', 'celeste', 'navy', 'denim', 'jeans', 'indaco',
  'verde', 'oliva', 'salvia', 'militare', 'rosso', 'rossa', 'bordeaux', 'carminio',
  'rosa', 'cipria', 'salmone', 'arancio', 'arancione', 'giallo', 'senape', 'ocra',
  'marrone', 'moro', 'testa', 'ruggine', 'viola', 'lilla', 'glicine', 'oro', 'argento',
  // Parole di servizio dei nomi file.
  'foto', 'img', 'image', 'dsc', 'photo', 'copia', 'copy', 'def', 'definitivo', 'finale',
  'fronte', 'retro', 'dietro', 'davanti', 'front', 'back', 'dettaglio', 'detail',
  'capo', 'capi', 'look', 'outfit', 'total', 'scatto', 'shooting', 'heemia', 'con', 'per',
  'nuovo', 'nuova', 'nuove', 'nuovi', 'ceo', 'insta', 'instagram', 'post', 'story',
])

/** Il minimo per riconoscere un capo: quello che serve all'abbinamento, non tutta l'anagrafica. */
export interface CapoDaAbbinare {
  id: string
  nome: string
  codiceProdotto: string
}

/** Un file immagine trovato su Drive. */
export interface FileFoto {
  id: string
  nome: string
  url: string
  /** false = non condiviso con «Chiunque abbia il link»: si collega, ma non si vedrebbe. */
  pubblico?: boolean
  /** Percorso della cartella che lo contiene, dalla radice della ricerca. */
  cartella?: string
}

export type Sicurezza = 'certa' | 'probabile'

export interface FotoProposta {
  fileId: string
  nomeFile: string
  url: string
  sicurezza: Sicurezza
  /** true se in questa foto c'è solo questo capo: è la candidata naturale a fare da copertina. */
  esclusiva: boolean
  pubblico: boolean
  /** Riconosciuto dal nome della cartella e non da quello del file: da guardare con più attenzione. */
  daCartella: boolean
}

export interface PropostaCapo {
  capoId: string
  nome: string
  codiceProdotto: string
  foto: FotoProposta[]
  /** Foto trovate oltre il limite e non proposte: si collegano dalla scheda del capo. */
  oltreIlLimite: number
}

/**
 * Quante foto si propongono al massimo per un capo.
 *
 * Serve perché nell'archivio ci sono cartelle di shooting da centinaia di scatti dello
 * stesso capo, e senza limite la scheda di un pantalone si ritroverebbe con 176 immagini:
 * la galleria dell'anagrafica serve a **riconoscere** il capo, non a conservare il rullino.
 * Le altre restano su Drive e si collegano dalla scheda, cartella per cartella, da chi
 * quella selezione la sa fare.
 */
export const MAX_FOTO_PER_CAPO = 12

export interface RisultatoAbbinamento {
  proposte: PropostaCapo[]
  /** File in cui non si è riconosciuto nessun capo: restano da collegare a mano. */
  nonAbbinati: { fileId: string; nomeFile: string; url: string }[]
}

/** Minuscolo, senza accenti, senza punteggiatura: «Cefalù» e «cefalu» devono coincidere. */
export function normalizza(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Nome del file ridotto alle parole utili: via estensione, contatori e duplicati. */
export function paroleDelFile(nomeFile: string): string[] {
  const senzaEstensione = nomeFile.replace(/\.[a-z0-9]{1,5}$/i, '')
  return normalizza(senzaEstensione)
    .split(' ')
    .filter((p) => p.length > 0)
}

/**
 * Distanza di edit fra due parole, con abbandono appena supera `massimo`.
 *
 * Serve solo per i refusi, quindi il massimo è sempre 1 o 2: calcolare la distanza esatta
 * quando è già chiaro che è troppo grande sarebbe lavoro sprecato su centinaia di file.
 */
export function distanza(a: string, b: string, massimo: number): number {
  if (Math.abs(a.length - b.length) > massimo) return massimo + 1
  let precedente = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const corrente = [i]
    let minimoRiga = i
    for (let j = 1; j <= b.length; j += 1) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      const valore = Math.min(precedente[j] + 1, corrente[j - 1] + 1, precedente[j - 1] + costo)
      corrente.push(valore)
      if (valore < minimoRiga) minimoRiga = valore
    }
    if (minimoRiga > massimo) return massimo + 1
    precedente = corrente
  }
  return precedente[b.length]
}

/**
 * Quanto ci si può sbagliare a scrivere un nome prima che non sia più lo stesso nome.
 *
 * Sotto le 5 lettere nessuna tolleranza: fra i capi ci sono «Sal», «Rio», «Cali», «Moss»,
 * e con una lettera di scarto si trasformerebbero l'uno nell'altro o in una parola qualsiasi.
 */
function tolleranza(parola: string): number {
  if (parola.length < 5) return 0
  return parola.length >= 8 ? 2 : 1
}

interface VoceIndice {
  chiave: string
  /** Quante parole del nome file consuma: «los angeles» ne consuma due. */
  parole: number
  capoId: string
}

/** Indice dei capi per nome e per codice, pronto per il confronto parola per parola. */
function indicizza(capi: CapoDaAbbinare[]): Map<string, VoceIndice[]> {
  const indice = new Map<string, VoceIndice[]>()
  const aggiungi = (chiave: string, parole: number, capoId: string) => {
    if (!chiave) return
    const esistenti = indice.get(chiave) ?? []
    if (!esistenti.some((v) => v.capoId === capoId)) esistenti.push({ chiave, parole, capoId })
    indice.set(chiave, esistenti)
  }

  for (const capo of capi) {
    const nome = normalizza(capo.nome)
    if (nome) aggiungi(nome, nome.split(' ').length, capo.id)
    // Il codice compare in qualche nome file come «HEE-050»: normalizzato diventa «hee 050»,
    // quindi va indicizzato attaccato e come coppia di parole.
    const codice = normalizza(capo.codiceProdotto)
    if (codice) {
      aggiungi(codice, codice.split(' ').length, capo.id)
      aggiungi(codice.replace(/ /g, ''), 1, capo.id)
    }
  }
  return indice
}

/** I capi riconosciuti dentro un nome di file, con quanto si è sicuri di ciascuno. */
export function capiNelNomeFile(
  nomeFile: string,
  capi: CapoDaAbbinare[],
  indice = indicizza(capi),
): { capoId: string; sicurezza: Sicurezza }[] {
  const parole = paroleDelFile(nomeFile)
  const trovati = new Map<string, Sicurezza>()
  const daControllare: string[] = []

  // Primo passaggio: corrispondenze esatte, preferendo il nome più lungo. Così «los angeles»
  // vince su un eventuale «los», e «california» non viene letto come «cali».
  for (let i = 0; i < parole.length; ) {
    // Si prova prima la sequenza più lunga: «los angeles» deve battere «los», e un nome di
    // tre parole non deve restare invisibile solo perché se ne guardavano due.
    let voci: VoceIndice[] | undefined
    for (let lunghezza = 3; lunghezza >= 1 && !voci; lunghezza -= 1) {
      if (i + lunghezza > parole.length) continue
      voci = indice.get(parole.slice(i, i + lunghezza).join(' '))
    }
    if (voci && voci.length > 0) {
      // Un nome che appartiene a due capi (non dovrebbe succedere: il nome è la chiave del
      // capo) resta ambiguo e si lascia decidere a chi guarda.
      if (voci.length === 1) trovati.set(voci[0].capoId, 'certa')
      i += voci[0].parole
      continue
    }
    daControllare.push(parole[i])
    i += 1
  }

  // Secondo passaggio: i refusi. Solo sulle parole rimaste, e solo se il candidato è uno.
  // Due capi ugualmente vicini a una parola storpiata vogliono dire che non lo sappiamo:
  // meglio lasciare la foto fra le non abbinate che metterla nella scheda sbagliata.
  for (const parola of daControllare) {
    if (PAROLE_IGNORATE.has(parola)) continue
    const massimo = tolleranza(parola)
    if (massimo === 0) continue
    let migliore: { capoId: string; d: number } | null = null
    let ambigua = false
    for (const [chiave, voci] of indice) {
      const d = distanza(parola, chiave.replace(/ /g, ''), massimo)
      if (d > massimo) continue
      if (!migliore || d < migliore.d) {
        migliore = { capoId: voci[0].capoId, d }
        ambigua = voci.length > 1
      } else if (d === migliore.d && voci[0].capoId !== migliore.capoId) {
        ambigua = true
      }
    }
    if (migliore && !ambigua && !trovati.has(migliore.capoId)) trovati.set(migliore.capoId, 'probabile')
  }

  return [...trovati].map(([capoId, sicurezza]) => ({ capoId, sicurezza }))
}

/** Ordine naturale dei nomi file: «capo-2» prima di «capo-10», come li ordina Drive. */
const perNome = (a: string, b: string) => a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' })

/**
 * Le foto trovate su Drive, distribuite fra i capi.
 *
 * L'ordine dentro ogni capo non è casuale: **la prima foto diventa la copertina** (è la
 * regola già in vigore in ProductMedia), e la copertina migliore è la foto in cui c'è solo
 * quel capo. Uno scatto del look intero mostra due capi e come miniatura del pantalone
 * confonde; la foto singola no. A parità, prima le certe, poi in ordine di nome.
 */
export function abbinaFoto(files: FileFoto[], capi: CapoDaAbbinare[]): RisultatoAbbinamento {
  const indice = indicizza(capi)
  const perCapo = new Map<string, FotoProposta[]>()
  const nonAbbinati: RisultatoAbbinamento['nonAbbinati'] = []

  for (const file of files) {
    let daCartella = false
    let riconosciuti = capiNelNomeFile(file.nome, capi, indice)

    // Ripiego sulla cartella: in archivio ci sono cartelle intitolate al capo
    // («CAPI IN LAVORAZIONE/BERNA») piene di scatti con il nome della macchina
    // fotografica, che altrimenti resterebbero tutti senza capo. Si guarda solo la
    // cartella che li contiene davvero, non i livelli sopra: una cartella lontana
    // («HEEMIA») etichetterebbe mezzo archivio.
    //
    // Sempre `probabile`, mai `certa`, anche quando il nome è esatto: qui il capo non
    // è scritto sulla foto, è dedotto da dove sta. Una cartella «Abito Simil Canarie-Sal»
    // contiene un capo *somigliante* a Canarie, non Canarie.
    if (riconosciuti.length === 0 && file.cartella) {
      const ultima = file.cartella.split('/').filter(Boolean).pop() ?? ''
      const dallaCartella = capiNelNomeFile(ultima, capi, indice)
      if (dallaCartella.length > 0) {
        riconosciuti = dallaCartella.map((c) => ({ ...c, sicurezza: 'probabile' as Sicurezza }))
        daCartella = true
      }
    }

    if (riconosciuti.length === 0) {
      nonAbbinati.push({ fileId: file.id, nomeFile: file.nome, url: file.url })
      continue
    }
    for (const { capoId, sicurezza } of riconosciuti) {
      const elenco = perCapo.get(capoId) ?? []
      elenco.push({
        fileId: file.id,
        nomeFile: file.nome,
        url: file.url,
        sicurezza,
        esclusiva: riconosciuti.length === 1,
        pubblico: file.pubblico ?? true,
        daCartella,
      })
      perCapo.set(capoId, elenco)
    }
  }

  const proposte: PropostaCapo[] = []
  for (const capo of capi) {
    const foto = perCapo.get(capo.id)
    if (!foto || foto.length === 0) continue
    foto.sort((a, b) => {
      // Prima quanto si è sicuri che sia il capo giusto, poi se la foto mostra solo lui:
      // una copertina sbagliata è un danno peggiore di una copertina con due capi dentro.
      if (a.sicurezza !== b.sicurezza) return a.sicurezza === 'certa' ? -1 : 1
      if (a.esclusiva !== b.esclusiva) return a.esclusiva ? -1 : 1
      return perNome(a.nomeFile, b.nomeFile)
    })
    proposte.push({
      capoId: capo.id,
      nome: capo.nome,
      codiceProdotto: capo.codiceProdotto,
      foto: foto.slice(0, MAX_FOTO_PER_CAPO),
      oltreIlLimite: Math.max(0, foto.length - MAX_FOTO_PER_CAPO),
    })
  }
  proposte.sort((a, b) => perNome(a.codiceProdotto, b.codiceProdotto))
  nonAbbinati.sort((a, b) => perNome(a.nomeFile, b.nomeFile))

  return { proposte, nonAbbinati }
}
