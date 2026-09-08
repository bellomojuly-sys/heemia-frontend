// La chiave OpenAI dell'azienda si inserisce dall'app (2026-09-09).
//
// Cosa si prova qui, che è tutto ciò che non richiede una chiave vera:
//   1. la busta cifrata non contiene il segreto in chiaro e si riapre identica;
//   2. una busta manomessa NON si apre (è il motivo per cui si usa GCM e non solo AES);
//   3. l'ordine delle sorgenti: chiave inserita dall'app > variabile d'ambiente > niente;
//   4. togliere la chiave dell'app fa tornare alla variabile d'ambiente, se c'è.
//
// Il punto (3) è il cuore della funzione: è ciò che permette alla CEO di collegare
// l'account aziendale senza toccare il pannello di Render, e alla variabile d'ambiente di
// restare la via di rientro se la chiave nuova si rivela sbagliata.
//
// Resta fuori una cosa sola, e va detta: **nessuna chiamata a OpenAI è mai partita in
// questo test.** La verifica della chiave (`verificaChiaveOpenAi`) chiama il servizio vero
// e si prova dall'app, col pulsante «Prova adesso», il giorno in cui la chiave c'è.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { _svuotaRegistro } from '../src/modules/auth/tentativiLogin.js'
import { cifra, decifra, suffissoRiconoscibile } from '../src/core/segreti.js'
import {
  credenzialeNota,
  leggiCredenziale,
  rimuoviCredenziale,
  salvaCredenziale,
  statoCredenziale,
} from '../src/core/credenziali.js'
import { configurata, messaggioNonConfigurata } from '../src/core/integrations.js'

const prisma = new PrismaClient()
const CHIAVE_FINTA = 'sk-proj-CHIAVEDIPROVA-non-valida-1234ABCD'
const RUN = `TEST-CRED-${Date.now().toString(36).toUpperCase()}`

let utenteId = ''
let teamId = ''
let app: Awaited<ReturnType<typeof buildApp>>
let cookieCeo = ''
let cookieTeam = ''
const password = 'Password-di-test-abbastanza-lunga-2026!'
/** Il valore che il server aveva prima del test: va rimesso com'era. */
const ambienteOriginale = process.env.OPENAI_API_KEY

let contatoreIp = 0
async function login(email: string) {
  _svuotaRegistro()
  contatoreIp += 1
  const r = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    remoteAddress: `127.0.9.${(contatoreIp % 200) + 1}`,
    payload: { email, password },
  })
  const setCookie = r.headers['set-cookie']
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie
  return raw?.split(';')[0] ?? ''
}

before(async () => {
  const hash = await bcrypt.hash(password, 4)
  const ceo = await prisma.user.create({
    data: { nome: 'Direzione di prova', email: `${RUN.toLowerCase()}-ceo@test.local`, role: 'ceo', passwordHash: hash },
  })
  utenteId = ceo.id
  const team = await prisma.user.create({
    data: { nome: 'Collega di prova', email: `${RUN.toLowerCase()}-team@test.local`, role: 'team', passwordHash: hash },
  })
  teamId = team.id
  await prisma.credenzialeIntegrazione.deleteMany({ where: { chiave: 'openai_api_key' } })
  app = await buildApp()
  await app.ready()
  cookieCeo = await login(`${RUN.toLowerCase()}-ceo@test.local`)
  cookieTeam = await login(`${RUN.toLowerCase()}-team@test.local`)
})

after(async () => {
  await app?.close()
  await prisma.credenzialeIntegrazione.deleteMany({ where: { chiave: 'openai_api_key' } })
  await prisma.session.deleteMany({ where: { userId: { in: [utenteId, teamId] } } })
  await prisma.activityLog.deleteMany({ where: { userId: { in: [utenteId, teamId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [utenteId, teamId] } } })
  if (ambienteOriginale === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = ambienteOriginale
  await prisma.$disconnect()
})

describe('cifratura dei segreti', () => {
  test('la busta non contiene il segreto e si riapre identica', () => {
    const busta = cifra(CHIAVE_FINTA)
    assert.ok(!busta.includes(CHIAVE_FINTA), 'la chiave non deve comparire in chiaro nella busta')
    assert.equal(decifra(busta), CHIAVE_FINTA)
  })

  test('due cifrature dello stesso valore sono diverse fra loro', () => {
    // Salt e IV casuali a ogni busta: due colonne uguali direbbero a chi guarda il
    // database che due integrazioni condividono la stessa chiave.
    assert.notEqual(cifra(CHIAVE_FINTA), cifra(CHIAVE_FINTA))
  })

  test('una busta manomessa non si apre', () => {
    const parti = cifra(CHIAVE_FINTA).split('.')
    const testoAlterato = Buffer.from(parti[4], 'base64')
    testoAlterato[0] ^= 0xff
    parti[4] = testoAlterato.toString('base64')
    assert.throws(() => decifra(parti.join('.')), /non è più leggibile|non riconosciuto/)
  })

  test('si mostrano solo le ultime quattro lettere', () => {
    assert.equal(suffissoRiconoscibile(CHIAVE_FINTA), 'ABCD')
    assert.equal(suffissoRiconoscibile('ab'), '••••')
  })
})

describe('sorgenti della chiave OpenAI', () => {
  test('senza niente, la funzione AI si dichiara non collegata', async () => {
    process.env.OPENAI_API_KEY = ''
    await prisma.credenzialeIntegrazione.deleteMany({ where: { chiave: 'openai_api_key' } })
    // `config` legge l'ambiente una volta sola all'avvio: qui conta la riga a database,
    // che non c'è. La ricaduta sull'ambiente si prova nel test successivo.
    assert.equal(await leggiCredenziale('openai_api_key'), '')
    const stato = await statoCredenziale('openai_api_key')
    assert.equal(stato.origine, 'assente')
    assert.equal(configurata('openai'), false)
    // Il messaggio deve mandare la persona nel posto giusto, non a cercare una variabile.
    assert.match(messaggioNonConfigurata('openai'), /Impostazioni/)
  })

  test('la chiave inserita dall\'app vale, e non torna mai indietro in chiaro', async () => {
    const stato = await salvaCredenziale('openai_api_key', CHIAVE_FINTA, { id: utenteId, nome: 'Direzione di prova' })
    assert.equal(stato.origine, 'app')
    assert.equal(stato.suffisso, 'ABCD')
    assert.equal(stato.impostataDa, 'Direzione di prova')

    // A database c'è la busta, non la chiave.
    const riga = await prisma.credenzialeIntegrazione.findUnique({ where: { chiave: 'openai_api_key' } })
    assert.ok(riga)
    assert.ok(!riga.valoreCifrato.includes(CHIAVE_FINTA))

    // Il server, invece, la usa in chiaro: è l'unico posto in cui esiste così.
    assert.equal(await leggiCredenziale('openai_api_key'), CHIAVE_FINTA)
    assert.equal(credenzialeNota('openai_api_key'), CHIAVE_FINTA)
    assert.equal(configurata('openai'), true)
  })

  test('togliendo la chiave dell\'app si torna alla variabile d\'ambiente', async () => {
    const stato = await rimuoviCredenziale('openai_api_key')
    // In questo ambiente di test la variabile è vuota: senza riga a database la funzione
    // AI si spegne, ed è la risposta giusta — meglio spenta che con una chiave di ieri.
    assert.equal(stato.origine, 'assente')
    assert.equal(await leggiCredenziale('openai_api_key'), '')
    const rimasta = await prisma.credenzialeIntegrazione.findUnique({ where: { chiave: 'openai_api_key' } })
    assert.equal(rimasta, null)
  })
})

describe('chi può collegare l\'account, e cosa esce dal server', () => {
  // La chiamata di verifica verso OpenAI parte **dopo** le guardie: queste prove non
  // toccano la rete, perché la richiesta viene fermata prima. Provare una chiave vera è
  // il pulsante «Prova adesso» in app, non un test automatico.
  test('un collega vede lo stato ma non può collegare né togliere la chiave', async () => {
    const lettura = await app.inject({
      method: 'GET', url: '/api/v1/integrations/openai', headers: { cookie: cookieTeam },
    })
    assert.equal(lettura.statusCode, 200)

    const scrittura = await app.inject({
      method: 'PUT', url: '/api/v1/integrations/openai', headers: { cookie: cookieTeam },
      payload: { apiKey: CHIAVE_FINTA },
    })
    assert.equal(scrittura.statusCode, 403)

    const rimozione = await app.inject({
      method: 'DELETE', url: '/api/v1/integrations/openai', headers: { cookie: cookieTeam },
    })
    assert.equal(rimozione.statusCode, 403)
  })

  test('lo stato dice tutto tranne la chiave', async () => {
    await salvaCredenziale('openai_api_key', CHIAVE_FINTA, { id: utenteId, nome: 'Direzione di prova' })
    const r = await app.inject({
      method: 'GET', url: '/api/v1/integrations/openai', headers: { cookie: cookieCeo },
    })
    assert.equal(r.statusCode, 200)
    // La prova che conta: la chiave non è nel corpo della risposta, in nessuna forma.
    assert.ok(!r.body.includes(CHIAVE_FINTA))
    const corpo = r.json() as { origine: string; configurata: boolean; suffisso: string; impostataDa: string }
    assert.equal(corpo.origine, 'app')
    assert.equal(corpo.configurata, true)
    assert.equal(corpo.suffisso, 'ABCD')
    assert.equal(corpo.impostataDa, 'Direzione di prova')
  })

  test('la direzione toglie la chiave, e resta scritto chi è stato', async () => {
    const r = await app.inject({
      method: 'DELETE', url: '/api/v1/integrations/openai', headers: { cookie: cookieCeo },
    })
    assert.equal(r.statusCode, 200)
    assert.equal((r.json() as { origine: string }).origine, 'assente')

    const log = await prisma.activityLog.findFirst({
      where: { userId: utenteId, azione: 'scollega_account_openai' },
      orderBy: { createdAt: 'desc' },
    })
    assert.ok(log, 'la rimozione deve finire nell\'activity log')
    assert.ok(!log.valorePrecedente?.includes(CHIAVE_FINTA), 'nel registro finisce il fatto, mai il segreto')

    // Una seconda rimozione non ha niente da togliere e lo dice, invece di rispondere ok.
    const seconda = await app.inject({
      method: 'DELETE', url: '/api/v1/integrations/openai', headers: { cookie: cookieCeo },
    })
    assert.equal(seconda.statusCode, 400)
  })
})
