/**
 * Gli indirizzi delle foto dei capi, resi utilizzabili da Shopify.
 *
 * Le foto stanno su Google Drive e l'app le collega invece di duplicarle (FR-16). Il
 * problema è che **il link che Drive dà con «Condividi» non è l'indirizzo di un'immagine**:
 * è la pagina del visualizzatore. Il browser lo risolve perché `src/lib/driveImage.ts` lo
 * riscrive prima di metterlo in un `<img>`; Shopify no — scarica quello che gli si dà, e
 * su un link `/view` scaricherebbe una pagina HTML.
 *
 * ⚠️ Vale solo per i file condivisi con **«Chiunque abbia il link»**. Su un file ristretto
 * Drive risponde con una pagina di accesso: Shopify rifiuta il file e la pubblicazione lo
 * dice, invece di lasciare un capo con una foto rotta.
 */

/** Identificativo del file dai formati di link che Drive produce. Gemello di `src/lib/driveImage.ts`. */
export function driveFileId(url: string): string | null {
  const u = url.trim()
  if (!u) return null
  const percorso = u.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/)
  if (percorso) return percorso[1]
  const parametro = u.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)
  if (parametro) return parametro[1]
  const google = u.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/)
  if (google) return google[1]
  return null
}

/**
 * Indirizzo che Shopify può scaricare, o `null` se non c'è.
 *
 * Le foto caricate nell'app come `data:` non sono un indirizzo: Shopify non può andarle a
 * prendere da nessuna parte. Restano fuori, e chi pubblica lo legge nel rapporto.
 */
export function urlPerShopify(url: string): string | null {
  const u = url.trim()
  if (!u || u.startsWith('data:')) return null

  const id = driveFileId(u)
  // `=w2400` chiede a Drive il file già grande: le schede prodotto di Shopify mostrano le
  // foto a piena larghezza, e un'anteprima da 400px si vedrebbe sgranata.
  if (id) return `https://lh3.googleusercontent.com/d/${id}=w2400`

  return /^https?:\/\//i.test(u) ? u : null
}

export interface ImmaginiPerShopify {
  utilizzabili: string[]
  /** Quelle che Shopify non potrebbe scaricare, con il motivo: da riportare a chi pubblica. */
  scartate: { url: string; motivo: string }[]
}

export function preparaImmagini(immaginiUrl: string[]): ImmaginiPerShopify {
  const utilizzabili: string[] = []
  const scartate: ImmaginiPerShopify['scartate'] = []
  for (const url of immaginiUrl) {
    const pronta = urlPerShopify(url)
    if (pronta) utilizzabili.push(pronta)
    else {
      scartate.push({
        url: url.slice(0, 80),
        motivo: url.trim().startsWith('data:')
          ? 'immagine caricata nell’app, senza un indirizzo che Shopify possa scaricare'
          : 'non è un indirizzo http(s)',
      })
    }
  }
  return { utilizzabili, scartate }
}
