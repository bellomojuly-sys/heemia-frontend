/**
 * Pubblicare un capo su Shopify **dall'app**, invece di ricrearlo a mano nel negozio.
 *
 * Il capo qui dentro ha già tutto: nome, descrizione, foto, taglie, colori, composizione,
 * prezzo e giacenze. Fino a ieri chi voleva metterlo online riscriveva quelle stesse cose
 * nel pannello di Shopify — e da quel momento esistevano due versioni dello stesso capo,
 * destinate a divergere alla prima correzione fatta da una parte sola.
 *
 * ## Come è costruita l'operazione
 *
 * **Una mutation sola: `productSet`.** Non `productCreate` seguito da N `productVariantsBulkCreate`.
 * `productSet` dichiara lo stato finale del prodotto — opzioni, varianti, prezzi, foto — e
 * Shopify lo raggiunge: crea ciò che manca, aggiorna ciò che c'è, toglie le varianti che
 * non ci sono più. È quindi **ripetibile**: pubblicare due volte lo stesso capo non produce
 * due prodotti né varianti doppie, che è la cosa che va storta in ogni integrazione scritta
 * a colpi di `create`.
 *
 * **L'abbinamento è lo SKU, come nel resto del modulo.** Nessun identificativo Shopify
 * finisce a database: il prodotto si ritrova a ogni pubblicazione cercando gli SKU delle
 * sue varianti. Un prodotto ricreato a mano su Shopify non lascia dietro un riferimento
 * morto (stessa scelta di `service.ts`).
 *
 * **Le giacenze non passano da qui.** `productSet` saprebbe impostarle, ma solo alla
 * creazione delle varianti, e con una semantica diversa da quella che il modulo usa già.
 * La scrittura dello stock resta `pubblicaGiacenze()`, che scrive quantità **assolute** ed
 * è idempotente: una strada sola per le giacenze, invece di due che possono discordare.
 *
 * **Il capo nasce in bozza.** `status: DRAFT`: l'app prepara la scheda, la vetrina la apre
 * una persona. Un capo che compare in vendita perché qualcuno ha premuto «pubblica» nel
 * gestionale è un incidente, non una funzione. Chi ha già pubblicato il capo se lo ritrova
 * com'era: lo stato di un prodotto esistente non viene riportato indietro.
 */
import { prisma } from '../../core/prisma.js'
import { badRequest, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import { richiediConfigurata } from '../../core/integrations.js'
import { shopifyGraphQL, verificaUserErrors } from './client.js'
import { preparaImmagini } from './immagini.js'

const NOME_OPZIONE_TAGLIA = 'Taglia'
const NOME_OPZIONE_COLORE = 'Colore'

const QUERY_PRODOTTO_PER_SKU = `
  query prodottoPerSku($filtro: String!) {
    productVariants(first: 1, query: $filtro) {
      nodes { id sku product { id title status } }
    }
  }
`

const MUTATION_PRODUCT_SET = `
  mutation pubblicaCapo($input: ProductSetInput!) {
    productSet(input: $input, synchronous: true) {
      product {
        id
        title
        handle
        status
        variants(first: 100) { nodes { id sku } }
      }
      userErrors { field message code }
    }
  }
`

/** Il prodotto Shopify che ospita già una delle varianti del capo, se esiste. */
async function prodottoEsistente(skus: string[]): Promise<{ id: string; status: string } | null> {
  for (const sku of skus) {
    // Le virgolette servono: uno SKU con un trattino, senza, verrebbe spezzato in due termini.
    const filtro = `sku:"${sku.replace(/"/g, '\\"')}"`
    const data: { productVariants: { nodes: { product: { id: string; status: string } }[] } } =
      await shopifyGraphQL(QUERY_PRODOTTO_PER_SKU, { filtro })
    const trovato = data.productVariants.nodes[0]
    if (trovato) return { id: trovato.product.id, status: trovato.product.status }
  }
  return null
}

/**
 * La descrizione della scheda Shopify, in HTML.
 *
 * Si mette insieme da quello che il capo ha già: la descrizione e-commerce (o quella breve,
 * se la prima non è ancora stata scritta), la composizione e i consigli di cura. Sono le tre
 * cose che il cliente cerca sulla pagina di un capo, e sono le tre che l'app conosce.
 */
export function descrizioneHtml(p: {
  descrizioneEcommerce: string | null
  descrizioneBreve: string | null
  composizione: string | null
  consigliCura: string | null
  vestibilita: string | null
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const parti: string[] = []
  const testo = (p.descrizioneEcommerce ?? p.descrizioneBreve ?? '').trim()
  if (testo) parti.push(`<p>${esc(testo).replace(/\n+/g, '</p><p>')}</p>`)
  if (p.vestibilita?.trim()) parti.push(`<p><strong>Vestibilità:</strong> ${esc(p.vestibilita.trim())}</p>`)
  if (p.composizione?.trim()) parti.push(`<p><strong>Composizione:</strong> ${esc(p.composizione.trim())}</p>`)
  if (p.consigliCura?.trim()) {
    const righe = p.consigliCura.split('\n').map((r) => r.trim()).filter(Boolean)
    parti.push(
      `<p><strong>Consigli di cura</strong></p><ul>${righe.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`,
    )
  }
  return parti.join('\n')
}

export interface EsitoPubblicazione {
  productId: string
  shopifyProductId: string
  titolo: string
  handle: string
  /** ACTIVE | DRAFT | ARCHIVED, come l'ha lasciato Shopify. */
  stato: string
  creato: boolean
  varianti: number
  immaginiInviate: number
  /** Cose andate diversamente da come ci si aspetta, in italiano, da mostrare a chi pubblica. */
  avvisi: string[]
}

/**
 * Manda il capo su Shopify. Fallisce — e non scrive niente a database — se Shopify non
 * conferma: un'azione esterna non è completata finché il servizio esterno non lo dice.
 */
export async function pubblicaProdottoSuShopify(
  productId: string,
  userId: string,
): Promise<EsitoPubblicazione> {
  richiediConfigurata('shopify')

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: [{ colore: 'asc' }, { taglia: 'asc' }] } },
  })
  if (!product) throw notFound('Prodotto non trovato')

  // Senza varianti non c'è niente da vendere: Shopify creerebbe un prodotto con una
  // variante finta senza taglia né colore, che poi non si abbina più a nessuno SKU.
  if (product.variants.length === 0) {
    throw badRequest(
      'Il capo non ha varianti: aggiungi almeno una combinazione taglia/colore prima di pubblicarlo. ' +
        'È lo SKU della variante a tenere insieme il capo qui e su Shopify.',
    )
  }

  const prezzo = Number(product.prezzoVendita)
  if (!(prezzo > 0)) {
    throw badRequest(
      'Il capo non ha ancora un prezzo. Il prezzo si calcola dai costi della scheda tecnica: ' +
        'aprilo dalla scheda prodotto e applica il prezzo calcolato prima di pubblicare.',
    )
  }

  const avvisi: string[] = []
  const { utilizzabili, scartate } = preparaImmagini(product.immaginiUrl)
  for (const s of scartate) avvisi.push(`Foto non inviata (${s.motivo}): ${s.url}`)
  if (utilizzabili.length === 0 && product.immaginiUrl.length > 0) {
    avvisi.push('Nessuna foto è arrivata a Shopify: controlla che i file su Drive siano condivisi con «Chiunque abbia il link».')
  }

  const esistente = await prodottoEsistente(product.variants.map((v) => v.sku))

  const taglie = [...new Set(product.variants.map((v) => v.taglia.trim()).filter(Boolean))]
  const colori = [...new Set(product.variants.map((v) => v.colore.trim()).filter(Boolean))]

  // Un'opzione senza valori Shopify la rifiuta: se un capo non ha colori dichiarati resta
  // la sola taglia, e viceversa. Almeno una delle due c'è sempre — lo garantisce lo schema
  // delle varianti, dove taglia e colore sono obbligatori.
  const opzioni: { name: string; values: { name: string }[]; position: number }[] = []
  if (taglie.length > 0) opzioni.push({ name: NOME_OPZIONE_TAGLIA, values: taglie.map((name) => ({ name })), position: opzioni.length + 1 })
  if (colori.length > 0) opzioni.push({ name: NOME_OPZIONE_COLORE, values: colori.map((name) => ({ name })), position: opzioni.length + 1 })

  const varianti = product.variants.map((v) => {
    const optionValues: { optionName: string; name: string }[] = []
    if (taglie.length > 0) optionValues.push({ optionName: NOME_OPZIONE_TAGLIA, name: v.taglia.trim() })
    if (colori.length > 0) optionValues.push({ optionName: NOME_OPZIONE_COLORE, name: v.colore.trim() })
    return {
      sku: v.sku,
      price: prezzo.toFixed(2),
      optionValues,
      inventoryItem: { tracked: true },
    }
  })

  const input: Record<string, unknown> = {
    title: product.nome,
    descriptionHtml: descrizioneHtml(product),
    productType: product.categoria ?? '',
    vendor: 'Heemia',
    tags: [product.collezione, product.linea, product.categoria].filter((t): t is string => !!t?.trim()),
    productOptions: opzioni,
    variants: varianti,
  }
  if (utilizzabili.length > 0) {
    input.files = utilizzabili.map((originalSource) => ({
      originalSource,
      contentType: 'IMAGE',
      alt: product.nome,
    }))
  }
  if (esistente) {
    input.id = esistente.id
    // Lo stato di un capo già online non si tocca: riportarlo in bozza lo toglierebbe
    // dalla vetrina come effetto collaterale di un aggiornamento.
  } else {
    input.status = 'DRAFT'
  }

  const data: {
    productSet: {
      product: {
        id: string
        title: string
        handle: string
        status: string
        variants: { nodes: { id: string; sku: string }[] }
      } | null
      userErrors: { field?: string[] | null; message: string }[]
    }
  } = await shopifyGraphQL(MUTATION_PRODUCT_SET, { input })

  verificaUserErrors('la pubblicazione del capo', data.productSet.userErrors)
  const creato = data.productSet.product
  if (!creato) throw badRequest('Shopify non ha restituito il prodotto pubblicato.')

  const inviate = new Set(creato.variants.nodes.map((n) => n.sku))
  const mancanti = product.variants.filter((v) => !inviate.has(v.sku)).map((v) => v.sku)
  if (mancanti.length > 0) avvisi.push(`Varianti non create su Shopify: ${mancanti.join(', ')}`)

  // Solo ora, a conferma ricevuta, l'app registra che il capo è su Shopify.
  const statoApp = creato.status === 'ACTIVE' ? 'pubblicato' : 'bozza'
  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: { statoPubblicazioneShopify: statoApp },
    })
    await logActivity(tx, {
      userId,
      azione: esistente ? 'aggiorna_shopify' : 'pubblica_shopify',
      entita: 'product',
      entitaId: productId,
      valoreNuovo: `${creato.title} (${creato.status})`,
    })
  })

  return {
    productId,
    shopifyProductId: creato.id,
    titolo: creato.title,
    handle: creato.handle,
    stato: creato.status,
    creato: !esistente,
    varianti: creato.variants.nodes.length,
    immaginiInviate: utilizzabili.length,
    avvisi,
  }
}
