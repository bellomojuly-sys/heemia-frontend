// Cifratura dei segreti che l'azienda inserisce dall'app (2026-09-09).
//
// Perché esiste: fino a ieri le chiavi dei servizi esterni potevano arrivare solo da
// variabili d'ambiente, cioè dal pannello di Render, cioè da chi ha fatto il deploy. Per
// OpenAI questo è un problema concreto: l'abbonamento e la fatturazione appartengono
// all'azienda, non a chi ha scritto il software, e quando l'app passa alla CEO deve poter
// essere lei — dalla schermata Impostazioni — a collegare l'account aziendale, senza
// toccare né il codice né la piattaforma.
//
// Una chiave API in chiaro in una colonna del database è però un segreto in più posti
// (backup, esportazioni, log di query). Qui viene cifrata prima di scendere a database:
// chi legge la tabella trova una busta illeggibile, e il valore torna in chiaro solo
// dentro il processo del server, un istante prima della chiamata a OpenAI.
//
// AES-256-GCM: cifra e autentica insieme, quindi una busta modificata a mano non viene
// decifrata (fallisce sul tag), invece di produrre silenziosamente una chiave storta.
//
// La chiave di cifratura NON sta a database — altrimenti sarebbe come lasciare la chiave
// nella toppa: si deriva da `CREDENTIALS_SECRET` (o, se assente, da `SESSION_SECRET`) con
// HKDF e un salt casuale per ogni busta. HKDF e non scrypt perché il segreto di partenza
// è già lungo e casuale: non è una password da rendere costosa da indovinare.
//
// ⚠️ Conseguenza da conoscere: se quel segreto cambia, le buste già salvate non si
// decifrano più. Non è una perdita di dati — la chiave OpenAI si reinserisce dalla stessa
// schermata in dieci secondi — ma il messaggio d'errore lo dice esplicitamente, invece di
// far sembrare la chiave "sbagliata".
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { config } from './config.js'
import { AppError } from './errors.js'

/** Marca la forma della busta: se un domani cambia algoritmo, le vecchie restano leggibili. */
const VERSIONE = 'v1'
const INFO = Buffer.from('heemia-credenziali-integrazioni')
const LUNGHEZZA_SALT = 16
const LUNGHEZZA_IV = 12 // 96 bit: la dimensione raccomandata per GCM

function chiaveDerivata(salt: Buffer): Buffer {
  const master = Buffer.from(config.credentialsSecret, 'utf8')
  return Buffer.from(hkdfSync('sha256', master, salt, INFO, 32))
}

/** Cifra un valore. Il risultato è una stringa sola, adatta a una colonna di testo. */
export function cifra(valore: string): string {
  const salt = randomBytes(LUNGHEZZA_SALT)
  const iv = randomBytes(LUNGHEZZA_IV)
  const cipher = createCipheriv('aes-256-gcm', chiaveDerivata(salt), iv)
  const testo = Buffer.concat([cipher.update(valore, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSIONE, salt.toString('base64'), iv.toString('base64'), tag.toString('base64'), testo.toString('base64')].join('.')
}

/**
 * Riporta in chiaro una busta prodotta da `cifra`.
 *
 * Fallisce in modo esplicito, e la distinzione conta: qui «non si apre» significa quasi
 * sempre che il segreto del server è cambiato, non che la chiave OpenAI sia sbagliata.
 * Dirlo evita che qualcuno vada a cercare il problema su platform.openai.com.
 */
export function decifra(busta: string): string {
  const parti = busta.split('.')
  if (parti.length !== 5 || parti[0] !== VERSIONE) {
    throw new AppError(500, 'Credenziale salvata in un formato non riconosciuto: reinseriscila da Impostazioni.', 'SEGRETO_ILLEGGIBILE')
  }
  try {
    const [, salt, iv, tag, testo] = parti
    const decipher = createDecipheriv('aes-256-gcm', chiaveDerivata(Buffer.from(salt, 'base64')), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(testo, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw new AppError(
      500,
      'La credenziale salvata non è più leggibile da questo server: succede quando cambia il segreto di firma ' +
        '(SESSION_SECRET / CREDENTIALS_SECRET). Reinseriscila da Impostazioni → Integrazioni: bastano dieci secondi.',
      'SEGRETO_ILLEGGIBILE',
    )
  }
}

/**
 * Le ultime quattro lettere della chiave, le uniche che si mostrano in app.
 * Servono a una domanda sola e reale: «quella che c'è dentro è la chiave che ho creato io?».
 */
export function suffissoRiconoscibile(valore: string): string {
  const pulito = valore.trim()
  return pulito.length <= 4 ? '••••' : pulito.slice(-4)
}
