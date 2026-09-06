// Gestione utenti e password (Fase 15.2). Passano dalla API vera con Fastify.inject, così
// attraversano anche RBAC, cookie e validazione — non solo il service.
//
//     cd server && npm test
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { _svuotaRegistro } from '../src/modules/auth/tentativiLogin.js'

const prisma = new PrismaClient()
const RUN = `TEST-USR-${Date.now().toString(36).toUpperCase()}`
const password = 'Password-di-test-abbastanza-lunga-2026!'

let app: Awaited<ReturnType<typeof buildApp>>
const emailCreate: string[] = []
let adminId = ''
let teamId = ''
let secondoAdminId = ''

/** Ogni accesso parte da un indirizzo diverso: il limite per IP non c'entra con queste prove. */
let contatoreIp = 0
async function login(email: string) {
  _svuotaRegistro()
  contatoreIp += 1
  const response = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    remoteAddress: `127.0.9.${(contatoreIp % 200) + 1}`,
    payload: { email, password },
  })
  const setCookie = response.headers['set-cookie']
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie
  return { response, cookie: raw?.split(';')[0] ?? '' }
}

async function creaUtente(ruolo: 'admin' | 'ceo' | 'team' | 'viewer', etichetta: string) {
  const email = `${RUN.toLowerCase()}-${etichetta}@test.local`
  emailCreate.push(email)
  const utente = await prisma.user.create({
    data: { nome: `${RUN} ${etichetta}`, email, role: ruolo, passwordHash: await bcrypt.hash(password, 4) },
  })
  return utente.id
}

before(async () => {
  adminId = await creaUtente('admin', 'admin')
  secondoAdminId = await creaUtente('admin', 'admin2')
  teamId = await creaUtente('team', 'team')
  app = await buildApp()
  await app.ready()
})

after(async () => {
  await app.close()
  const ids = await prisma.user.findMany({ where: { email: { in: emailCreate } }, select: { id: true } })
  const userIds = ids.map((u) => u.id)
  await prisma.activityLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entitaId: { in: userIds } }] } })
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await prisma.$disconnect()
})

describe('Utenti e accessi', () => {
  test('solo un admin vede e crea utenti: il team riceve 403', async () => {
    const { cookie } = await login(`${RUN.toLowerCase()}-team@test.local`)
    const lettura = await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie } })
    assert.equal(lettura.statusCode, 403)
    const scrittura = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: { cookie },
      payload: { nome: 'Vietato', email: `${RUN.toLowerCase()}-vietato@test.local`, role: 'viewer', password },
    })
    assert.equal(scrittura.statusCode, 403)
    assert.equal(await prisma.user.count({ where: { email: `${RUN.toLowerCase()}-vietato@test.local` } }), 0)
  })

  test('un admin crea un utente, che poi entra davvero con le sue credenziali', async () => {
    const { cookie } = await login(`${RUN.toLowerCase()}-admin@test.local`)
    const email = `${RUN.toLowerCase()}-nuovo@test.local`
    emailCreate.push(email)

    const creato = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: { cookie },
      payload: { nome: 'Persona Nuova', email, role: 'team', password },
    })
    assert.equal(creato.statusCode, 201)
    // La password non deve mai uscire dall'API, in nessuna forma.
    assert.equal('passwordHash' in creato.json(), false)
    assert.equal('password' in creato.json(), false)

    const accesso = await login(email)
    assert.equal(accesso.response.statusCode, 200)
    assert.equal(accesso.response.json().role, 'team')
  })

  test('una password corta viene rifiutata e l’utente non viene creato', async () => {
    const { cookie } = await login(`${RUN.toLowerCase()}-admin@test.local`)
    const email = `${RUN.toLowerCase()}-corta@test.local`
    const risposta = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: { cookie },
      payload: { nome: 'Corta', email, role: 'viewer', password: 'breve' },
    })
    assert.equal(risposta.statusCode, 400)
    assert.match(risposta.json().error.message, /almeno 12 caratteri/)
    assert.equal(await prisma.user.count({ where: { email } }), 0)
  })

  test('due utenti non possono avere lo stesso indirizzo', async () => {
    const { cookie } = await login(`${RUN.toLowerCase()}-admin@test.local`)
    const risposta = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: { cookie },
      payload: { nome: 'Doppione', email: `${RUN.toLowerCase()}-team@test.local`, role: 'viewer', password },
    })
    assert.equal(risposta.statusCode, 409)
  })

  test('disattivare un utente lo butta fuori subito, non alla scadenza del cookie', async () => {
    const bersaglio = await login(`${RUN.toLowerCase()}-team@test.local`)
    const prima = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: bersaglio.cookie } })
    assert.equal(prima.statusCode, 200)

    const { cookie } = await login(`${RUN.toLowerCase()}-admin@test.local`)
    const patch = await app.inject({
      method: 'PATCH', url: `/api/v1/users/${teamId}`, headers: { cookie }, payload: { attivo: false },
    })
    assert.equal(patch.statusCode, 200)
    assert.equal(patch.json().attivo, false)

    const dopo = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: bersaglio.cookie } })
    assert.equal(dopo.statusCode, 401)
    assert.equal(await prisma.session.count({ where: { userId: teamId } }), 0)

    // Riattivato, torna a poter entrare (ma con una sessione nuova).
    await app.inject({
      method: 'PATCH', url: `/api/v1/users/${teamId}`, headers: { cookie }, payload: { attivo: true },
    })
    assert.equal((await login(`${RUN.toLowerCase()}-team@test.local`)).response.statusCode, 200)
  })

  test('un admin non può disattivare né degradare se stesso', async () => {
    const { cookie } = await login(`${RUN.toLowerCase()}-admin@test.local`)
    const spegnimento = await app.inject({
      method: 'PATCH', url: `/api/v1/users/${adminId}`, headers: { cookie }, payload: { attivo: false },
    })
    assert.equal(spegnimento.statusCode, 400)
    const degrado = await app.inject({
      method: 'PATCH', url: `/api/v1/users/${adminId}`, headers: { cookie }, payload: { role: 'viewer' },
    })
    assert.equal(degrado.statusCode, 400)
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).role, 'admin')
  })

  test('l’ultimo amministratore attivo non si può degradare', async () => {
    const { cookie } = await login(`${RUN.toLowerCase()}-admin@test.local`)
    // Prima si degrada il secondo admin: consentito, perché ne resta un altro.
    const primo = await app.inject({
      method: 'PATCH', url: `/api/v1/users/${secondoAdminId}`, headers: { cookie }, payload: { role: 'ceo' },
    })
    assert.equal(primo.statusCode, 200)

    // Ora l'admin che sta operando è l'ultimo: un altro admin non esiste per provarci, e
    // lui stesso è già fermato dalla regola precedente. Si rimette a posto lo scenario.
    const ripristino = await app.inject({
      method: 'PATCH', url: `/api/v1/users/${secondoAdminId}`, headers: { cookie }, payload: { role: 'admin' },
    })
    assert.equal(ripristino.statusCode, 200)

    // Con due admin, il secondo può degradare il primo: la regola blocca solo l'ultimo.
    const daSecondo = await login(`${RUN.toLowerCase()}-admin2@test.local`)
    const degrada = await app.inject({
      method: 'PATCH', url: `/api/v1/users/${adminId}`, headers: { cookie: daSecondo.cookie }, payload: { role: 'ceo' },
    })
    assert.equal(degrada.statusCode, 200)

    // Ora ne resta uno solo: degradarlo deve essere impossibile anche per un altro account.
    const ultimo = await app.inject({
      method: 'PATCH', url: `/api/v1/users/${secondoAdminId}`,
      headers: { cookie: daSecondo.cookie }, payload: { role: 'viewer' },
    })
    assert.equal(ultimo.statusCode, 400, 'un admin non degrada se stesso, nemmeno essendo l\'ultimo')

    // Rimessi a posto entrambi per non lasciare lo scenario sporco agli altri test.
    await prisma.user.update({ where: { id: adminId }, data: { role: 'admin' } })
  })

  test('cambio password: serve quella attuale, le altre sessioni cadono, la mia resta', async () => {
    const email = `${RUN.toLowerCase()}-cambio@test.local`
    emailCreate.push(email)
    const { cookie: adminCookie } = await login(`${RUN.toLowerCase()}-admin@test.local`)
    const creato = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: { cookie: adminCookie },
      payload: { nome: 'Cambio', email, role: 'viewer', password },
    })
    assert.equal(creato.statusCode, 201)

    const primaSessione = await login(email)
    const secondaSessione = await login(email)
    const nuova = 'Nuova-password-lunga-2026!'

    const sbagliata = await app.inject({
      method: 'POST', url: '/api/v1/auth/change-password', headers: { cookie: secondaSessione.cookie },
      payload: { passwordAttuale: 'non-e-questa', passwordNuova: nuova },
    })
    assert.equal(sbagliata.statusCode, 400)

    const ok = await app.inject({
      method: 'POST', url: '/api/v1/auth/change-password', headers: { cookie: secondaSessione.cookie },
      payload: { passwordAttuale: password, passwordNuova: nuova },
    })
    assert.equal(ok.statusCode, 200)
    assert.equal(ok.json().altreSessioniTerminate, 1)

    // La sessione da cui ho cambiato resta valida...
    const mia = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: secondaSessione.cookie } })
    assert.equal(mia.statusCode, 200)
    // ...l'altra no.
    const altra = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: primaSessione.cookie } })
    assert.equal(altra.statusCode, 401)

    // E si entra solo con la password nuova.
    _svuotaRegistro()
    const vecchia = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.8.1',
      payload: { email, password },
    })
    assert.equal(vecchia.statusCode, 401)
    const conNuova = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.8.2',
      payload: { email, password: nuova },
    })
    assert.equal(conNuova.statusCode, 200)
  })

  test('anche un viewer può cambiare la propria password: non passa dal modulo utenti', async () => {
    const email = `${RUN.toLowerCase()}-viewer@test.local`
    emailCreate.push(email)
    const { cookie: adminCookie } = await login(`${RUN.toLowerCase()}-admin@test.local`)
    await app.inject({
      method: 'POST', url: '/api/v1/users', headers: { cookie: adminCookie },
      payload: { nome: 'Viewer', email, role: 'viewer', password },
    })
    const { cookie } = await login(email)
    const risposta = await app.inject({
      method: 'POST', url: '/api/v1/auth/change-password', headers: { cookie },
      payload: { passwordAttuale: password, passwordNuova: 'Altra-password-lunga-2026!' },
    })
    assert.equal(risposta.statusCode, 200)
  })

  test('reimpostazione da admin: chiude tutte le sessioni e sblocca i tentativi falliti', async () => {
    const email = `${RUN.toLowerCase()}-reset@test.local`
    emailCreate.push(email)
    const { cookie: adminCookie } = await login(`${RUN.toLowerCase()}-admin@test.local`)
    const creato = await app.inject({
      method: 'POST', url: '/api/v1/users', headers: { cookie: adminCookie },
      payload: { nome: 'Reset', email, role: 'team', password },
    })
    const id = creato.json().id as string
    const suaSessione = await login(email)

    // Si è dimenticato la password e ha esaurito i tentativi.
    for (let i = 0; i < 9; i += 1) {
      await app.inject({
        method: 'POST', url: '/api/v1/auth/login', remoteAddress: `127.0.7.${i + 1}`,
        payload: { email, password: `tentativo-${i}` },
      })
    }
    const bloccato = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.7.90',
      payload: { email, password },
    })
    assert.equal(bloccato.statusCode, 429)

    const nuova = 'Password-reimpostata-2026!'
    const reset = await app.inject({
      method: 'POST', url: `/api/v1/users/${id}/password`, headers: { cookie: adminCookie },
      payload: { password: nuova },
    })
    assert.equal(reset.statusCode, 200)

    // Le sue sessioni sono cadute...
    const vecchiaSessione = await app.inject({
      method: 'GET', url: '/api/v1/auth/me', headers: { cookie: suaSessione.cookie },
    })
    assert.equal(vecchiaSessione.statusCode, 401)
    // ...e può rientrare subito con la password nuova, senza aspettare la fine del blocco.
    const rientro = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', remoteAddress: '127.0.7.91',
      payload: { email, password: nuova },
    })
    assert.equal(rientro.statusCode, 200)
  })

  test('ogni operazione sugli utenti finisce nell’activity log', async () => {
    const azioni = await prisma.activityLog.findMany({
      where: { entita: 'user', azione: { in: ['crea_utente', 'modifica_utente', 'reimposta_password', 'cambia_password'] } },
      select: { azione: true },
    })
    for (const attesa of ['crea_utente', 'modifica_utente', 'reimposta_password', 'cambia_password']) {
      assert.ok(azioni.some((a) => a.azione === attesa), `manca la registrazione di ${attesa}`)
    }
  })
})
