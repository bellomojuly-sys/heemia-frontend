/**
 * Testi della capretta — l'unico file da toccare per cambiare le frasi.
 *
 * Il tono: la capretta scherza, non fa la scema. Chi legge sta lavorando e ha
 * appena sbattuto contro un blocco: la frase deve strappare un mezzo sorriso e
 * poi dire cosa fare. Per questo ogni voce ha un titolo (la battuta) e un testo
 * (l'istruzione). Quando il server dà una ragione precisa — "codice già
 * esistente", "materiale esaurito" — quella prende il posto del testo generico:
 * la simpatia non deve costare l'informazione.
 *
 * Le lingue stanno affiancate fin d'ora così aggiungerne una non richiede di
 * toccare i componenti: basta un'altra chiave qui dentro.
 */

export type LivelloAlert = 'error' | 'warning' | 'info'

export type TipoAlert =
  | 'scheda-tecnica'
  | 'dati-incompleti'
  | 'campi-obbligatori'
  | 'kanban-bloccato'
  | 'salvataggio'
  | 'upload'
  | 'connessione'
  | 'esportazione'
  | 'permesso'
  | 'generico'

export type Lingua = 'it' | 'en'

export interface TestoAlert {
  titolo: string
  testo: string
  livello: LivelloAlert
}

const IT: Record<TipoAlert, TestoAlert> = {
  'scheda-tecnica': {
    titolo: 'Beeeh!',
    testo: 'Prima completa la scheda tecnica, poi possiamo andare avanti.',
    livello: 'warning',
  },
  'dati-incompleti': {
    titolo: 'La capretta ha controllato…',
    testo: 'Manca ancora qualche dato.',
    livello: 'warning',
  },
  'campi-obbligatori': {
    titolo: 'Aspetta!',
    testo: "C'è ancora qualche campo vuoto.",
    livello: 'warning',
  },
  'kanban-bloccato': {
    titolo: 'Questa tappa non è ancora pronta.',
    testo: 'Completa i passaggi precedenti.',
    livello: 'warning',
  },
  salvataggio: {
    titolo: 'Ops! La capretta ha inciampato.',
    testo: 'Riproviamo.',
    livello: 'error',
  },
  upload: {
    titolo: 'Il file non è arrivato al pascolo.',
    testo: 'Prova a caricarlo di nuovo.',
    livello: 'error',
  },
  connessione: {
    titolo: 'La capretta non trova la strada verso il server.',
    testo: 'Controlla la connessione e riprova tra un momento.',
    livello: 'error',
  },
  esportazione: {
    titolo: "Niente da portare al pascolo.",
    testo: "Non c'è ancora nulla da esportare.",
    livello: 'info',
  },
  permesso: {
    titolo: 'Questo recinto è chiuso.',
    testo: 'Il tuo ruolo non può fare questa azione.',
    livello: 'info',
  },
  generico: {
    titolo: 'Qualcosa è andato storto…',
    testo: 'Ma la capretta sta già cercando di sistemare tutto.',
    livello: 'error',
  },
}

const EN: Record<TipoAlert, TestoAlert> = {
  'scheda-tecnica': {
    titolo: 'Baaah!',
    testo: 'Finish the tech pack first, then we can move on.',
    livello: 'warning',
  },
  'dati-incompleti': {
    titolo: 'The goat had a look…',
    testo: 'Some details are still missing.',
    livello: 'warning',
  },
  'campi-obbligatori': {
    titolo: 'Hold on!',
    testo: 'A few fields are still empty.',
    livello: 'warning',
  },
  'kanban-bloccato': {
    titolo: 'This stage is not ready yet.',
    testo: 'Complete the previous steps first.',
    livello: 'warning',
  },
  salvataggio: {
    titolo: 'Oops! The goat tripped.',
    testo: "Let's try again.",
    livello: 'error',
  },
  upload: {
    titolo: 'The file never made it to the pasture.',
    testo: 'Try uploading it again.',
    livello: 'error',
  },
  connessione: {
    titolo: "The goat can't find the way to the server.",
    testo: 'Check your connection and try again in a moment.',
    livello: 'error',
  },
  esportazione: {
    titolo: 'Nothing to take to the pasture.',
    testo: 'There is nothing to export yet.',
    livello: 'info',
  },
  permesso: {
    titolo: 'This pen is closed.',
    testo: 'Your role cannot perform this action.',
    livello: 'info',
  },
  generico: {
    titolo: 'Something went wrong…',
    testo: 'But the goat is already trying to fix it.',
    livello: 'error',
  },
}

export const MESSAGGI: Record<Lingua, Record<TipoAlert, TestoAlert>> = { it: IT, en: EN }

/** Unica lingua attiva oggi. Quando servirà l'inglese, questo diventa una preferenza utente. */
export const LINGUA_ATTIVA: Lingua = 'it'

export function testoAlert(tipo: TipoAlert, lingua: Lingua = LINGUA_ATTIVA): TestoAlert {
  return MESSAGGI[lingua][tipo] ?? MESSAGGI[lingua].generico
}

/** Durata di lettura per livello, dentro i 4-6 secondi richiesti. */
export const DURATA_PREDEFINITA: Record<LivelloAlert, number> = {
  info: 4000,
  warning: 5000,
  error: 6000,
}
