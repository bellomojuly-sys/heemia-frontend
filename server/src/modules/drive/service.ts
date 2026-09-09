// Google Drive — FR-16: i file restano su Drive, l'app li collega e non li duplica.
//
// Cosa aggiunge questo modulo a ciò che già esiste: fino a ieri ogni foto andava incollata
// **una per una** con il link del singolo file, e il link di una cartella veniva rifiutato.
// Qui si incolla la cartella del capo e le foto entrano tutte insieme. Con 93 capi da
// caricare in Fase 21, è la differenza fra un pomeriggio e una settimana.
//
// Perché serve una credenziale: elencare il contenuto di una cartella è un'operazione
// che Drive concede solo a chi è autenticato — il link pubblico mostra un file, non
// l'indice della cartella. Si usa un **service account** in sola lettura, lo stesso tipo
// di credenziale già usata per Analytics: si condivide con lui la cartella su Drive (come
// si farebbe con una persona) e da quel momento l'app la sa leggere.
//
// La visualizzazione delle immagini NON passa da qui: resta l'anteprima pubblica di Drive
// (`lib/driveImage.ts` lato client), che funziona senza credenziali. Questo modulo serve a
// **trovare** i file, non a mostrarli.
import { GoogleAuth } from 'google-auth-library'
import { AppError } from '../../core/errors.js'
import { config } from '../../core/config.js'

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

const NON_CONFIGURATO =
  'Lettura di Google Drive non attiva: mancano le credenziali (GOOGLE_DRIVE_CREDENTIALS_JSON, GOOGLE_SERVICE_ACCOUNT_JSON, ' +
  'GA_CREDENTIALS_JSON già usato per Analytics, oppure GOOGLE_DRIVE_CREDENTIALS_FILE in locale). ' +
  'Procedura: Integrazioni_Setup.md §6. ' +
  'Nel frattempo le foto si collegano una per una con il link del singolo file.'

/** Il JSON OAuth o del service account, da qualunque variabile arrivi. */
function credenziali(): string {
  return config.googleDriveCredentialsJson || config.googleServiceAccountJson || config.gaCredentialsJson
}

export function driveConfigurato(): boolean {
  return Boolean(credenziali() || config.driveCredentialsFile || config.gaCredentialsFile)
}

let auth: GoogleAuth | null = null

function getAuth(): GoogleAuth {
  if (!driveConfigurato()) throw new AppError(503, NON_CONFIGURATO, 'DRIVE_NOT_CONFIGURED')
  if (!auth) {
    const json = credenziali()
    if (json) {
      let parsed: {
        type?: string
        client_email?: string
        private_key?: string
        client_id?: string
        client_secret?: string
        refresh_token?: string
      }
      try {
        parsed = JSON.parse(json)
      } catch {
        throw new AppError(
          503,
          'Il JSON delle credenziali Drive non è valido: va incollato su una riga sola.',
          'DRIVE_BAD_CREDENTIALS',
        )
      }

      if (parsed.type === 'authorized_user') {
        if (!parsed.client_id || !parsed.client_secret || !parsed.refresh_token) {
          throw new AppError(
            503,
            'Il JSON OAuth Drive non contiene client_id, client_secret e refresh_token.',
            'DRIVE_BAD_CREDENTIALS',
          )
        }
        // Il tipo è verificato prima di affidarlo alla libreria: da una variabile privata
        // del servizio accettiamo soltanto il formato OAuth creato dalla nostra procedura.
        const caricatore = new GoogleAuth({ scopes: [SCOPE] })
        auth = new GoogleAuth({ authClient: caricatore.fromJSON(parsed) })
      } else if (parsed.type === 'service_account' || !parsed.type) {
        if (!parsed.client_email || !parsed.private_key) {
          throw new AppError(
            503,
            'Il JSON del service account non contiene client_email e private_key.',
            'DRIVE_BAD_CREDENTIALS',
          )
        }
        auth = new GoogleAuth({
          scopes: [SCOPE],
          credentials: {
            client_email: parsed.client_email,
            // Nelle variabili d'ambiente gli a capo della chiave arrivano come "\n" letterali.
            private_key: parsed.private_key.replace(/\\n/g, '\n'),
          },
        })
      } else {
        throw new AppError(
          503,
          `Tipo di credenziale Drive non supportato: ${parsed.type}.`,
          'DRIVE_BAD_CREDENTIALS',
        )
      }
    } else {
      // Il percorso dedicato mantiene separato l'OAuth locale di Drive da Analytics.
      // GOOGLE_APPLICATION_CREDENTIALS resta supportato per i service account condivisi.
      const keyFile = config.driveCredentialsFile || config.gaCredentialsFile
      auth = new GoogleAuth({ scopes: [SCOPE], keyFile })
    }
  }
  return auth
}

/** Identificativo della cartella dai formati di link che Drive produce. */
export function cartellaId(url: string): string | null {
  const u = url.trim()
  if (!u) return null
  const percorso = u.match(/\/folders\/([a-zA-Z0-9_-]{10,})/)
  if (percorso) return percorso[1]
  const parametro = u.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)
  if (parametro) return parametro[1]
  // Un identificativo incollato da solo, senza indirizzo attorno.
  if (/^[a-zA-Z0-9_-]{10,}$/.test(u)) return u
  return null
}

export interface ImmagineDrive {
  id: string
  nome: string
  /** Link del file, nella forma che il resto dell'app già sa mostrare. */
  url: string
  /** true se il file è visibile a chiunque abbia il link: se no, l'anteprima resterà vuota. */
  pubblico: boolean
}

interface FileDrive {
  id: string
  name: string
  mimeType: string
  permissions?: { type: string; role: string }[]
}

/**
 * Elenco delle immagini dentro una cartella Drive, in ordine di nome.
 *
 * Ordine per nome e non per data: le foto di un capo si chiamano quasi sempre
 * `capo-01`, `capo-02`… e quell'ordine è la sequenza voluta da chi le ha caricate,
 * mentre la data di caricamento è l'ordine in cui sono state trascinate nel browser.
 */
export async function elencaImmagini(folderUrl: string): Promise<ImmagineDrive[]> {
  const id = cartellaId(folderUrl)
  if (!id) {
    throw new AppError(400, 'Questo non è il link di una cartella Drive.', 'BAD_REQUEST')
  }

  const client = await getAuth().getClient()
  const query = encodeURIComponent(`'${id}' in parents and mimeType contains 'image/' and trashed = false`)
  const campi = encodeURIComponent('files(id,name,mimeType,permissions(type,role)),nextPageToken')
  const files: FileDrive[] = []
  let pageToken: string | undefined

  do {
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${campi}` +
      `&orderBy=name_natural&pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`
    const risposta = await client.request<{ files?: FileDrive[]; nextPageToken?: string }>({ url }).catch((err) => {
      throw traduciErrore(err)
    })
    files.push(...(risposta.data.files ?? []))
    pageToken = risposta.data.nextPageToken
  } while (pageToken)

  return files.map((f) => ({
    id: f.id,
    nome: f.name,
    url: `https://drive.google.com/file/d/${f.id}/view`,
    // `permissions` arriva solo se il service account può vederli; l'assenza non prova
    // che il file sia privato, per questo il messaggio in interfaccia resta un avviso.
    pubblico: (f.permissions ?? []).some((p) => p.type === 'anyone'),
  }))
}

function traduciErrore(err: unknown): AppError {
  const status = (err as { response?: { status?: number } })?.response?.status
  if (status === 404) {
    return new AppError(
      404,
      "Cartella non trovata, oppure l'account Google configurato non può vederla. Controlla la condivisione della cartella su Drive.",
      'DRIVE_NOT_FOUND',
    )
  }
  if (status === 403) {
    return new AppError(
      403,
      "Google ha rifiutato la lettura della cartella: controlla che l'account configurato possa vederla e che le API di Drive siano abilitate nel progetto Google Cloud.",
      'DRIVE_FORBIDDEN',
    )
  }
  const messaggio = err instanceof Error ? err.message : 'errore sconosciuto'
  return new AppError(502, `Non riesco a leggere la cartella su Drive: ${messaggio}`, 'DRIVE_ERROR')
}

// --- Lettura ricorsiva: tutte le foto di una collezione in un colpo solo ---
//
// L'import per cartella singola (sopra) presuppone che le foto di un capo stiano in una
// cartella dedicata. Su Drive non è così: le foto stanno in cartelle per shooting o per
// stagione, mescolate, e il capo si riconosce dal **nome del file**. Per abbinarle serve
// quindi l'elenco completo del sotto-albero, non di una cartella sola.
//
// Il limite di cartelle non è una precauzione teorica: puntare questa funzione alla radice
// del Drive vorrebbe dire percorrere tutto l'archivio dell'azienda a ogni tentativo. Meglio
// fermarsi e dirlo, che restare venti minuti in attesa.

/**
 * Una richiesta a Drive, ritentata quando il problema è passeggero.
 *
 * Percorrere un archivio vero vuol dire un centinaio di richieste di fila, e su quel numero
 * un timeout ogni tanto càpita: senza ritentata **una** connessione andata storta butta via
 * la scansione intera e l'utente vede solo «non riesco a leggere la cartella». Si ritenta
 * solo ciò che ha senso ritentare — errori di rete, limiti di frequenza, guasti temporanei
 * di Google. Un 403 o un 404 sono risposte definitive e passano subito.
 */
async function conRitentata<T>(
  client: { request<R>(opzioni: { url: string }): Promise<{ data: R }> },
  url: string,
  tentativi = 3,
): Promise<{ data: T }> {
  let ultimo: unknown
  for (let i = 0; i < tentativi; i += 1) {
    try {
      return await client.request<T>({ url })
    } catch (err) {
      ultimo = err
      const status = (err as { response?: { status?: number } })?.response?.status
      const passeggero = status === undefined || status === 429 || status >= 500
      if (!passeggero) break
      // Attesa crescente: se Google sta rifiutando per frequenza, riprovare subito peggiora.
      await new Promise((r) => setTimeout(r, 400 * 2 ** i))
    }
  }
  throw traduciErrore(ultimo)
}

/** Un'immagine trovata nel sotto-albero, con la cartella in cui sta (serve solo a spiegarlo). */
export interface ImmagineTrovata extends ImmagineDrive {
  cartella: string
}

interface ElementoDrive extends FileDrive {
  parents?: string[]
}

const MAX_CARTELLE = 300

// Formati che il browser sa mostrare tramite l'anteprima di Drive. Il filtro serve contro i
// **raw di macchina fotografica** (CR3, ARW, NEF), che su Drive sono `image/…` come le altre
// ma pesano trenta megabyte l'uno e stanno a centinaia nelle cartelle di shooting: collegarli
// riempirebbe le schede di file che nessuno userebbe come foto del capo.
const FORMATI_MOSTRABILI = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'image/heic', 'image/heif',
])

export async function elencaImmaginiRicorsivo(
  folderUrl: string,
): Promise<{ immagini: ImmagineTrovata[]; cartelle: number; troncato: boolean }> {
  const radice = cartellaId(folderUrl)
  if (!radice) {
    throw new AppError(400, 'Questo non è il link di una cartella Drive.', 'BAD_REQUEST')
  }

  const client = await getAuth().getClient()
  const campi = encodeURIComponent('files(id,name,mimeType,permissions(type,role)),nextPageToken')
  const immagini: ImmagineTrovata[] = []
  const daVisitare: { id: string; nome: string }[] = [{ id: radice, nome: '' }]
  const viste = new Set<string>([radice])
  let cartelle = 0
  let troncato = false

  while (daVisitare.length > 0) {
    const cartella = daVisitare.shift()!
    cartelle += 1
    const query = encodeURIComponent(
      `'${cartella.id}' in parents and trashed = false and ` +
        `(mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.folder')`,
    )
    let pageToken: string | undefined
    do {
      const url =
        `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${campi}` +
        `&orderBy=name_natural&pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`
      const risposta = await conRitentata<{ files?: ElementoDrive[]; nextPageToken?: string }>(client, url)
      for (const f of risposta.data.files ?? []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (viste.has(f.id)) continue
          viste.add(f.id)
          if (viste.size > MAX_CARTELLE) {
            troncato = true
            continue
          }
          daVisitare.push({ id: f.id, nome: cartella.nome ? `${cartella.nome}/${f.name}` : f.name })
          continue
        }
        if (!FORMATI_MOSTRABILI.has(f.mimeType.toLowerCase())) continue
        immagini.push({
          id: f.id,
          nome: f.name,
          url: `https://drive.google.com/file/d/${f.id}/view`,
          pubblico: (f.permissions ?? []).some((p) => p.type === 'anyone'),
          cartella: cartella.nome,
        })
      }
      pageToken = risposta.data.nextPageToken
    } while (pageToken)
  }

  return { immagini, cartelle, troncato }
}
