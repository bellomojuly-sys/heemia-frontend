// Immagini dei capi ospitate su Google Drive (FR-16: i file restano su Drive, l'app li
// collega, non li duplica).
//
// Il punto: **il link che Drive dà con "Condividi" non è l'indirizzo di un'immagine**.
// È la pagina del visualizzatore, e un `<img src="…/view">` resta vuoto. Per mostrare la
// foto serve l'endpoint delle anteprime, costruito con l'identificativo del file.
//
// Vincolo da tenere presente: funziona solo se il file è condiviso con **"Chiunque abbia
// il link"**. Su un file ristretto Drive risponde con una pagina di login, l'immagine non
// carica e si vede il riquadro di ripiego.

/** Estrae l'identificativo del file dai formati di link che Drive produce. */
export function driveFileId(url: string): string | null {
  const u = url.trim()
  if (!u) return null

  // https://drive.google.com/file/d/<ID>/view?usp=sharing
  const percorso = u.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/)
  if (percorso) return percorso[1]

  // https://drive.google.com/open?id=<ID> · .../uc?id=<ID> · .../thumbnail?id=<ID>
  const parametro = u.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)
  if (parametro) return parametro[1]

  // https://drive.google.com/drive/folders/<ID> → è una cartella, non un file: niente anteprima.
  // https://lh3.googleusercontent.com/d/<ID> → già un indirizzo di immagine.
  const google = u.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/)
  if (google) return google[1]

  return null
}

/**
 * Indirizzo mostrabile in un `<img>` a partire da un collegamento qualsiasi.
 *
 * - link Drive → endpoint delle anteprime, alla larghezza richiesta;
 * - qualunque altro indirizzo http(s) → lasciato com'è (può essere già un'immagine);
 * - tutto il resto → `null`, e chi chiama mostra il riquadro di ripiego.
 *
 * `larghezza` chiede a Drive un'anteprima già ridimensionata: una card di catalogo non ha
 * bisogno della foto a piena risoluzione, e scaricarla intera rallenterebbe la pagina.
 */
export function imageUrlFrom(url: string | undefined, larghezza = 600): string | null {
  if (!url) return null
  const u = url.trim()
  if (!u) return null

  const id = driveFileId(u)
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w${larghezza}`

  return /^https?:\/\//i.test(u) ? u : null
}

/** true se il collegamento punta a una cartella Drive: non ha un'anteprima singola. */
export function isDriveFolder(url: string | undefined): boolean {
  return Boolean(url && /drive\.google\.com\/drive\/folders\//.test(url))
}

/**
 * Immagine di copertina di un capo: la **prima** dei suoi collegamenti.
 * Non serve un campo dedicato nel database — per cambiare copertina si sposta un'immagine
 * in cima all'elenco, che è anche il modo in cui si riordina il resto della galleria.
 */
export function coverImageUrl(immaginiUrl: string[] | undefined, larghezza = 600): string | null {
  const primo = (immaginiUrl ?? []).find((u) => imageUrlFrom(u) !== null)
  return imageUrlFrom(primo, larghezza)
}
