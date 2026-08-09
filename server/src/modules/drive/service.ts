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
  'Lettura di Google Drive non attiva: manca il service account (GOOGLE_SERVICE_ACCOUNT_JSON, ' +
  'oppure GA_CREDENTIALS_JSON già usato per Analytics). Procedura: Integrazioni_Setup.md §6. ' +
  'Nel frattempo le foto si collegano una per una con il link del singolo file.'

/** Il JSON del service account, da qualunque variabile arrivi. */
function credenziali(): string {
  return config.googleServiceAccountJson || config.gaCredentialsJson
}

export function driveConfigurato(): boolean {
  return Boolean(credenziali() || config.gaCredentialsFile)
}

let auth: GoogleAuth | null = null

function getAuth(): GoogleAuth {
  if (!driveConfigurato()) throw new AppError(503, NON_CONFIGURATO, 'DRIVE_NOT_CONFIGURED')
  if (!auth) {
    const json = credenziali()
    if (json) {
      let parsed: { client_email?: string; private_key?: string }
      try {
        parsed = JSON.parse(json)
      } catch {
        throw new AppError(
          503,
          'Il JSON del service account non è valido: va incollato su una riga sola.',
          'DRIVE_BAD_CREDENTIALS',
        )
      }
      if (!parsed.client_email || !parsed.private_key) {
        throw new AppError(
          503,
          'Il JSON del service account non contiene client_email e private_key: non è il file giusto.',
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
      // GOOGLE_APPLICATION_CREDENTIALS: il percorso lo legge la libreria da sé.
      auth = new GoogleAuth({ scopes: [SCOPE] })
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
      "Cartella non trovata, oppure non è condivisa con il service account. Su Drive: Condividi → incolla l'indirizzo del service account → Visualizzatore.",
      'DRIVE_NOT_FOUND',
    )
  }
  if (status === 403) {
    return new AppError(
      403,
      'Google ha rifiutato la lettura della cartella: controlla che sia condivisa con il service account e che le API di Drive siano abilitate nel progetto Google Cloud.',
      'DRIVE_FORBIDDEN',
    )
  }
  const messaggio = err instanceof Error ? err.message : 'errore sconosciuto'
  return new AppError(502, `Non riesco a leggere la cartella su Drive: ${messaggio}`, 'DRIVE_ERROR')
}
