// Lettura delle cartelle Drive: passa dal server, non dal browser (FR-16).
//
// Il motivo è la credenziale: elencare il contenuto di una cartella richiede un account
// autorizzato, e quell'autorizzazione non deve mai arrivare al browser. Qui c'è solo la
// chiamata; il resto delle immagini (visualizzazione, copertina, anteprime) continua a
// funzionare senza server, con l'anteprima pubblica di Drive — vedi `lib/driveImage.ts`.
import { api } from './api'

export interface ImmagineDrive {
  id: string
  nome: string
  /** Link del file nella forma che l'app già sa mostrare. */
  url: string
  /** false quando il file non è condiviso con "Chiunque abbia il link": l'anteprima resterà vuota. */
  pubblico: boolean
}

export function importaImmaginiDaCartella(cartellaUrl: string) {
  return api.post<{ immagini: ImmagineDrive[]; nonPubbliche: number }>('/drive/folder-images', { cartellaUrl })
}

/** Dice se la lettura delle cartelle è attiva sul server (credenziale presente). */
export function statoDrive() {
  return api.get<{ configurato: boolean }>('/drive/status')
}

// --- Abbinamento automatico foto ↔ capi (Fase 21) ---
//
// Due chiamate distinte, non una: la prima **propone** e non scrive niente, la seconda
// scrive solo ciò che è stato confermato. La separazione esiste perché un abbinamento
// sbagliato mette la foto di un capo nella scheda di un altro, e chi guarda la proposta è
// l'unico in grado di accorgersene prima che succeda.

export type SicurezzaAbbinamento = 'certa' | 'probabile'

export interface FotoProposta {
  fileId: string
  nomeFile: string
  url: string
  /** `certa` = il nome del capo è nel file tale e quale; `probabile` = c'era un refuso. */
  sicurezza: SicurezzaAbbinamento
  /** true se la foto mostra solo questo capo: è la candidata naturale a fare da copertina. */
  esclusiva: boolean
  pubblico: boolean
  /** Riconosciuto dal nome della cartella, non da quello del file. */
  daCartella: boolean
  /** Già presente nella scheda: si mostra, ma non si ricollega. */
  giaCollegata: boolean
}

export interface PropostaCapo {
  capoId: string
  nome: string
  codiceProdotto: string
  foto: FotoProposta[]
  /** Foto trovate oltre il limite di dodici e non proposte qui. */
  oltreIlLimite: number
}

export interface EsitoRicerca {
  /** Quante cartelle sono state percorse sotto quella indicata. */
  cartelle: number
  /** true se l'albero era troppo grande e la ricerca si è fermata. */
  troncato: boolean
  totaleFoto: number
  proposte: PropostaCapo[]
  nonAbbinati: { fileId: string; nomeFile: string; url: string }[]
  /** Capi che restano senza nessuna anteprima: la lista di cosa manca ancora. */
  capiSenzaFoto: { id: string; nome: string; codiceProdotto: string }[]
  nonPubbliche: number
}

export function cercaAbbinamentiFoto(cartellaUrl: string) {
  return api.post<EsitoRicerca>('/drive/abbina-foto', { cartellaUrl })
}

export function collegaFotoAbbinare(abbinamenti: { capoId: string; urls: string[] }[]) {
  return api.post<{ capiAggiornati: number; fotoCollegate: number; capiNonTrovati: string[] }>(
    '/drive/collega-foto',
    { abbinamenti },
  )
}
