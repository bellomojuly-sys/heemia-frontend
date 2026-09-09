// Estrae le copertine e le foto già collegate ai capi, in un CSV del censimento.
//
//     npm run foto:export        # scrive Censimento_Dati/foto_capi.csv
//
// **Perché un file e non rilanciare l'abbinamento sull'ambiente di destinazione.**
//
// L'abbinamento automatico (`modules/drive/abbinamento.ts`) produce una *proposta*: certi e
// probabili, con i probabili da guardare uno per uno. Quella proposta è già stata guardata,
// e il risultato di quella revisione sta nel database di sviluppo. Rilanciare la ricerca su
// staging e in produzione non ripeterebbe la revisione — la ri-deriverebbe, e una
// ri-derivazione non è una revisione: basta una foto nuova su Drive, o un file rinominato,
// perché i tre ambienti finiscano con copertine diverse senza che nessuno l'abbia deciso.
//
// Da qui la scelta: la scelta delle foto diventa **dato**, come il censimento. Si esporta
// una volta, si legge in git, si applica dove serve. Tre conseguenze pratiche:
//
//  - non serve la credenziale Drive nell'ambiente di destinazione (su staging, per policy,
//    non c'è e non deve esserci);
//  - l'applicazione dura un istante invece di 87 cartelle da percorrere;
//  - la chiave è il **codice prodotto**, non l'identificativo interno: gli id sono generati
//    dal database e sono diversi in ogni ambiente, il codice no.
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const censusDir = process.env.CENSIMENTO_DIR
  ? process.env.CENSIMENTO_DIR.replace(/\/?$/, '')
  : fileURLToPath(new URL('../../../03_Technical_Specification/Censimento_Dati', import.meta.url))

const prisma = new PrismaClient()

const capi = await prisma.product.findMany({
  select: { codiceProdotto: true, nome: true, immaginiUrl: true },
  orderBy: { codiceProdotto: 'asc' },
})

const virgolette = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

const righe: string[] = ['codice_prodotto,nome_capo,ordine,immagine_url']
let capiEsportati = 0
let scartati: string[] = []

for (const capo of capi) {
  const foto = capo.immaginiUrl ?? []
  if (foto.length === 0) continue
  // I capi del censimento hanno tutti un codice HEE-xxx. Quello che non ce l'ha è un
  // residuo di prova dell'ambiente di sviluppo e non deve viaggiare verso la produzione.
  if (!/^HEE-\d+$/i.test(capo.codiceProdotto)) {
    scartati.push(`${capo.codiceProdotto} (${capo.nome})`)
    continue
  }
  capiEsportati += 1
  foto.forEach((url, i) => {
    righe.push([capo.codiceProdotto, virgolette(capo.nome), String(i + 1), url].join(','))
  })
}

const percorso = `${censusDir}/foto_capi.csv`
await writeFile(percorso, `${righe.join('\n')}\n`, 'utf8')

console.log(`scritto ${percorso}`)
console.log(`capi con foto: ${capiEsportati} su ${capi.length} · righe foto: ${righe.length - 1}`)
console.log('la riga con ordine 1 è la copertina: è quella che compare nella galleria del catalogo')
if (scartati.length > 0) {
  console.log(`esclusi (codice non del censimento): ${scartati.join(', ')}`)
}

await prisma.$disconnect()
