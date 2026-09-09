// Abbinamento foto ↔ capi dal nome del file (Fase 21).
//
// I nomi di file usati qui sono **quelli veri di Drive**, copiati senza ritoccarli: spazi
// prima dell'estensione, maiuscole incoerenti, «+» come separatore, refusi. Sono la
// specifica di fatto di questo modulo, ed è il motivo per cui non basta un `includes()`.
//
// La prova che conta di più non è quella che abbina, è quella che **non** abbina: una foto
// finita nella scheda sbagliata si scopre solo aprendo il capo, mesi dopo.
import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_FOTO_PER_CAPO, abbinaFoto, capiNelNomeFile, type CapoDaAbbinare,
} from '../src/modules/drive/abbinamento.js'

// Estratto del censimento (03_Technical_Specification/Censimento_Dati/products.csv): i capi
// che i nomi file toccano, più quelli che si somigliano abbastanza da poter essere confusi.
const CAPI: CapoDaAbbinare[] = [
  { id: 'id-amsterdam', nome: 'Amsterdam', codiceProdotto: 'HEE-006' },
  { id: 'id-berna', nome: 'Berna', codiceProdotto: 'HEE-013' },
  { id: 'id-brasile', nome: 'Brasile', codiceProdotto: 'HEE-018' },
  { id: 'id-cali', nome: 'Cali', codiceProdotto: 'HEE-020' },
  { id: 'id-canarie', nome: 'Canarie', codiceProdotto: 'HEE-024' },
  { id: 'id-california', nome: 'California', codiceProdotto: 'HEE-021' },
  { id: 'id-cefalu', nome: 'Cefalù', codiceProdotto: 'HEE-026' },
  { id: 'id-cipro', nome: 'Cipro', codiceProdotto: 'HEE-027' },
  { id: 'id-dublino', nome: 'Dublino', codiceProdotto: 'HEE-034' },
  { id: 'id-formentera', nome: 'Formentera', codiceProdotto: 'HEE-036' },
  { id: 'id-helsinki', nome: 'Helsinki', codiceProdotto: 'HEE-040' },
  { id: 'id-ibiza', nome: 'Ibiza', codiceProdotto: 'HEE-041' },
  { id: 'id-losangeles', nome: 'Los Angeles', codiceProdotto: 'HEE-049' },
  { id: 'id-sanfrancisco', nome: 'San Francisco', codiceProdotto: 'HEE-080' },
  { id: 'id-malaga', nome: 'Malaga', codiceProdotto: 'HEE-051' },
  { id: 'id-malta', nome: 'Malta', codiceProdotto: 'HEE-053' },
  { id: 'id-manhattan', nome: 'Manhattan', codiceProdotto: 'HEE-054' },
  { id: 'id-messico', nome: 'Messico', codiceProdotto: 'HEE-056' },
  { id: 'id-moss', nome: 'Moss', codiceProdotto: 'HEE-060' },
  { id: 'id-pechino', nome: 'Pechino', codiceProdotto: 'HEE-073' },
  { id: 'id-sal', nome: 'Sal', codiceProdotto: 'HEE-078' },
]

const capi = (nomeFile: string) =>
  capiNelNomeFile(nomeFile, CAPI)
    .map((c) => `${c.capoId}:${c.sicurezza}`)
    .sort()

describe('riconoscimento del capo dal nome del file', () => {
  test('un nome file, un capo', () => {
    assert.deepEqual(capi('Malta.jpg'), ['id-malta:certa'])
    assert.deepEqual(capi('Manhattan.jpg'), ['id-manhattan:certa'])
  })

  test('accenti e maiuscole non contano', () => {
    // Su Drive il capo «Cefalù» è scritto «cefalu»: senza normalizzazione andrebbe perso.
    assert.deepEqual(capi('cefalu + dublino.JPG'), ['id-cefalu:certa', 'id-dublino:certa'])
    assert.deepEqual(capi('MESSICO + IBIZA SALMONE .jpg'), ['id-ibiza:certa', 'id-messico:certa'])
  })

  test('una foto con due capi finisce in entrambe le schede', () => {
    // È il look completo: la stessa foto serve a riconoscere la giacca e il pantalone.
    assert.deepEqual(capi('PECHINO + HELSINKI CORDA .jpg'), ['id-helsinki:certa', 'id-pechino:certa'])
    assert.deepEqual(capi('Malta+Cipro.jpg'), ['id-cipro:certa', 'id-malta:certa'])
    assert.deepEqual(capi('brasile formentera .HEIC'), ['id-brasile:certa', 'id-formentera:certa'])
  })

  test('i refusi si recuperano, ma restano segnati come probabili', () => {
    assert.deepEqual(capi('pechino + helsinky.heic'), ['id-helsinki:probabile', 'id-pechino:certa'])
    assert.deepEqual(capi('manatthan+ amsterdam .JPG'), ['id-amsterdam:certa', 'id-manhattan:probabile'])
  })

  test('il colore nel nome non diventa un capo', () => {
    // «SALMONE» dista poco da «Sal»: senza la lista dei colori la foto del Messico finirebbe
    // anche nella scheda di un abito che non c'entra niente.
    assert.equal(
      capi('MESSICO + IBIZA SALMONE .jpg').includes('id-sal:certa'),
      false,
      'il colore salmone non deve agganciare il capo Sal',
    )
    assert.deepEqual(capi('PECHINO + HELSINKI CORDA .jpg').includes('id-cipro:probabile'), false)
  })

  test('nomi che si contengono a vicenda: vince quello intero', () => {
    assert.deepEqual(capi('California.jpg'), ['id-california:certa'])
    assert.deepEqual(capi('cali.jpg'), ['id-cali:certa'])
    assert.deepEqual(capi('LOS ANGELES + CALI.jpg'), ['id-cali:certa', 'id-losangeles:certa'])
  })

  test('nomi corti non tollerano refusi', () => {
    // «Sal», «Cali», «Moss»: a una lettera di distanza sono l'uno l'altro o una parola
    // qualsiasi. Meglio nessun abbinamento che uno sbagliato.
    assert.deepEqual(capi('mass.jpg'), [])
    assert.deepEqual(capi('sol.jpg'), [])
  })

  test('nomi generici restano senza capo', () => {
    // Sono i file dello shooting non ancora rinominati: vanno collegati a mano.
    assert.deepEqual(capi('Heemia-17.jpg'), [])
    assert.deepEqual(capi('DSC03591.ARW'), [])
    assert.deepEqual(capi('Timeline 1_01_03_14_29.jpg'), [])
  })

  test('anche il codice prodotto vale come nome', () => {
    assert.deepEqual(capi('HEE-053 fronte.jpg'), ['id-malta:certa'])
  })
})

describe('distribuzione delle foto fra i capi', () => {
  const file = (nome: string) => ({ id: `f-${nome}`, nome, url: `https://drive.google.com/file/d/f-${nome}/view` })

  test('la copertina proposta è la foto in cui c\'è solo quel capo', () => {
    const { proposte } = abbinaFoto([file('Malta+Cipro.jpg'), file('Malta.jpg')], CAPI)
    const malta = proposte.find((p) => p.capoId === 'id-malta')
    assert.ok(malta)
    assert.equal(malta.foto[0].nomeFile, 'Malta.jpg', 'la foto del solo capo va prima del look completo')
    assert.equal(malta.foto[0].esclusiva, true)
    assert.equal(malta.foto.length, 2)

    // Cipro compare solo nella foto del look: quella diventa comunque la sua copertina,
    // meglio di nessuna anteprima.
    const cipro = proposte.find((p) => p.capoId === 'id-cipro')
    assert.equal(cipro?.foto[0].nomeFile, 'Malta+Cipro.jpg')
    assert.equal(cipro?.foto[0].esclusiva, false)
  })

  test('le certe precedono le probabili', () => {
    const { proposte } = abbinaFoto([file('helsinky.jpg'), file('Helsinki.jpg')], CAPI)
    const helsinki = proposte.find((p) => p.capoId === 'id-helsinki')
    assert.deepEqual(
      helsinki?.foto.map((f) => f.sicurezza),
      ['certa', 'probabile'],
    )
  })

  test('i file senza capo riconosciuto sono elencati a parte', () => {
    const { proposte, nonAbbinati } = abbinaFoto([file('Heemia-17.jpg'), file('Malta.jpg')], CAPI)
    assert.deepEqual(
      nonAbbinati.map((f) => f.nomeFile),
      ['Heemia-17.jpg'],
    )
    assert.deepEqual(
      proposte.map((p) => p.capoId),
      ['id-malta'],
    )
  })

  test('nessun capo compare due volte, nemmeno se il nome è ripetuto nel file', () => {
    const { proposte } = abbinaFoto([file('malta malta.jpg')], CAPI)
    assert.equal(proposte.length, 1)
    assert.equal(proposte[0].foto.length, 1)
  })
})

describe('ripiego sul nome della cartella', () => {
  const inCartella = (nome: string, cartella: string) => ({
    id: `f-${nome}-${cartella}`,
    nome,
    url: `https://drive.google.com/file/d/f-${cartella}-${nome}/view`,
    cartella,
  })

  test('gli scatti col nome della macchina prendono il capo dalla cartella che li contiene', () => {
    // «CAPI IN LAVORAZIONE/BERNA» è pieno di IMG_xxxx: senza questo ripiego resterebbero
    // tutti senza capo, ed è la cartella stessa a dire di chi sono.
    const { proposte, nonAbbinati } = abbinaFoto(
      [inCartella('IMG_5205.JPG', 'CAPI IN LAVORAZIONE/BERNA ')],
      CAPI,
    )
    assert.deepEqual(nonAbbinati, [])
    assert.equal(proposte.length, 1)
    assert.equal(proposte[0].capoId, 'id-berna')
    // Mai «certa»: il capo non è scritto sulla foto, è dedotto da dove sta.
    assert.equal(proposte[0].foto[0].sicurezza, 'probabile')
    assert.equal(proposte[0].foto[0].daCartella, true)
  })

  test('il nome del file vince sulla cartella', () => {
    const { proposte } = abbinaFoto([inCartella('Malta.jpg', 'CAPI IN LAVORAZIONE/BERNA ')], CAPI)
    assert.deepEqual(
      proposte.map((p) => p.capoId),
      ['id-malta'],
    )
    assert.equal(proposte[0].foto[0].daCartella, false)
  })

  test('si guarda solo la cartella che contiene il file, non quelle sopra', () => {
    // Se contasse un livello qualsiasi, «CAPI IN LAVORAZIONE/BERNA/scarti» finirebbe
    // comunque su Berna — e con un archivio profondo si etichetterebbe di tutto.
    const { nonAbbinati } = abbinaFoto([inCartella('IMG_1.JPG', 'BERNA/dettagli tessuto')], CAPI)
    assert.equal(nonAbbinati.length, 1)
  })

  test('una cartella che nomina due capi li propone entrambi, da confermare', () => {
    const { proposte } = abbinaFoto(
      [inCartella('IMG_1.JPG', 'Abito Simil Canarie-Sal con Scollatura')],
      CAPI,
    )
    assert.deepEqual(
      proposte.map((p) => `${p.capoId}:${p.foto[0].sicurezza}`).sort(),
      ['id-canarie:probabile', 'id-sal:probabile'],
    )
  })
})

describe('limiti', () => {
  const file = (nome: string) => ({ id: `f-${nome}`, nome, url: `https://drive.google.com/file/d/f-${nome}/view` })

  test('un capo non riceve più di dodici foto', () => {
    // In archivio ci sono cartelle di shooting con centinaia di scatti dello stesso capo:
    // senza limite la scheda diventa un rullino invece di un'anagrafica.
    const molte = Array.from({ length: 30 }, (_, i) => file(`Malta ${String(i).padStart(2, '0')}.jpg`))
    const { proposte } = abbinaFoto(molte, CAPI)
    assert.equal(proposte[0].foto.length, MAX_FOTO_PER_CAPO)
    assert.equal(proposte[0].oltreIlLimite, 30 - MAX_FOTO_PER_CAPO)
  })

  test('i nomi di più parole si riconoscono per intero', () => {
    assert.deepEqual(capi('SAN FRANCISCO + LOS ANGELES.jpg'), ['id-losangeles:certa', 'id-sanfrancisco:certa'])
  })
})
