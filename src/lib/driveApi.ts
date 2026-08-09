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
