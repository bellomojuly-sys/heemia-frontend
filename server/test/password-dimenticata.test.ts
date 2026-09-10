// «Password dimenticata» — DEC-071.
//
// Cosa si può provare senza le credenziali Gmail, che è tutto ciò che decide la sicurezza
// di questa funzione:
//   1. che senza Gmail la richiesta venga **rifiutata**, e che non lasci dietro di sé un
//      token vivo — una richiesta che non parte non deve creare un link valido;
//   2. che un link scaduto, già usato o inventato non cambi niente;
//   3. che il link buono cambi la password, faccia cadere tutte le sessioni, si consuma e
//      porti via con sé le altre richieste in sospeso;
//   4. che una password troppo debole venga rifiutata **senza** bruciare il link.
//
// Resta fuori una cosa sola, e va detta: **nessuna email è mai stata spedita davvero.**
// Serve il refresh token dell'account Heemia (Integrazioni_Setup §2). Le prove qui sotto
// scrivono la richiesta a database come farebbe l'invio, e verificano tutto il resto.
import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import {
  improntaToken,
  reimpostaConToken,
  richiediReimpostazione,
  statoToken,
} from '../src/modules/auth/reimpostaPassword.js'
import { verifyPassword } from '../src/modules/auth/password.js'

const prisma = new PrismaClient()
const RUN = `TEST-PWD-${Date.now().toString(36).toUpperCase()}`
const EMAIL = `${RUN.toLowerCase()}@test.local`

let utenteId = ''

/** Scrive una richiesta in sospeso come farebbe l'invio dell'email, e restituisce il token. */
async function creaLink(opts: { scadutoDa?: number; giaUsato?: boolean } = {}) {
  const token = randomBytes(32).toString('base64url')
  const adesso = Date.now()
  await prisma.passwordResetToken.create({
    data: {
      userId: utenteId,
      tokenHash: improntaToken(token),
      scadeIl: new Date(adesso + (opts.scadutoDa ? -opts.scadutoDa : 60 * 60_000)),
      usatoIl: opts.giaUsato ? new Date() : null,
    },
  })
  return token
}

before(async () => {
  const utente = await prisma.user.create({
    data: {
      nome: 'Tester password',
      email: EMAIL,
      role: 'team',
      // Hash di "PasswordVecchia1": non serve conoscerlo, serve che cambi.
      passwordHash: '$2a$12$3Qw8Zx1Yc9r0dQ0mJ1QqAO2m4c7l0m0YyF0mQ7l1m2n3o4p5q6r7s',
    },
  })
  utenteId = utente.id
})

after(async () => {
  await prisma.activityLog.deleteMany({ where: { userId: utenteId } })
  await prisma.passwordResetToken.deleteMany({ where: { userId: utenteId } })
  await prisma.session.deleteMany({ where: { userId: utenteId } })
  await prisma.user.deleteMany({ where: { id: utenteId } })
  await prisma.$disconnect()
})

describe('Password dimenticata', () => {
  test('senza Gmail la richiesta viene rifiutata e non lascia nessun link valido', async () => {
    const prima = await prisma.passwordResetToken.count({ where: { userId: utenteId } })

    await assert.rejects(
      () => richiediReimpostazione(EMAIL),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 409)
        // Il messaggio deve dire cosa manca E cosa fare intanto: senza la seconda metà,
        // chi resta fuori non sa come rientrare.
        assert.match(err.message, /Gmail/)
        assert.match(err.message, /amministratore/i)
        return true
      },
    )

    const dopo = await prisma.passwordResetToken.count({ where: { userId: utenteId } })
    assert.equal(dopo, prima, 'una richiesta rifiutata non deve creare un token')
  })

  test('un token inventato, scaduto o già usato non vale', async () => {
    assert.deepEqual(await statoToken('token-che-non-esiste'), { valido: false })

    const scaduto = await creaLink({ scadutoDa: 60_000 })
    assert.deepEqual(await statoToken(scaduto), { valido: false })

    const usato = await creaLink({ giaUsato: true })
    assert.deepEqual(await statoToken(usato), { valido: false })

    await assert.rejects(
      () => reimpostaConToken(scaduto, 'PasswordNuova1'),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 400)
        assert.match(err.message, /non è più valido/i)
        return true
      },
    )
  })

  test('una password troppo debole non passa e il link resta spendibile', async () => {
    const token = await creaLink()

    await assert.rejects(() => reimpostaConToken(token, 'corta'))

    // Il punto: rifiutare la password non deve consumare il link, altrimenti un errore di
    // battitura obbligherebbe a ricominciare da capo dalla casella di posta.
    assert.deepEqual(await statoToken(token), { valido: true })
  })

  test('il link buono cambia la password, chiude le sessioni e si consuma', async () => {
    const token = await creaLink()
    // Una sessione aperta altrove, e un secondo link ancora in sospeso.
    await prisma.session.create({
      data: { userId: utenteId, role: 'team', expiresAt: new Date(Date.now() + 3_600_000) },
    })
    const altroLink = await creaLink()

    const esito = await reimpostaConToken(token, 'PasswordNuova1')
    assert.equal(esito.ok, true)

    const utente = await prisma.user.findUniqueOrThrow({ where: { id: utenteId } })
    assert.ok(await verifyPassword('PasswordNuova1', utente.passwordHash!))

    assert.equal(
      await prisma.session.count({ where: { userId: utenteId } }),
      0,
      'reimpostare la password deve buttare fuori chiunque fosse entrato',
    )

    assert.deepEqual(await statoToken(token), { valido: false }, 'il link si usa una volta sola')
    assert.deepEqual(
      await statoToken(altroLink),
      { valido: false },
      'anche le altre richieste in sospeso muoiono: nessun link precedente può ricambiare la password',
    )

    const log = await prisma.activityLog.findFirst({
      where: { userId: utenteId, azione: 'reimposta_password' },
      orderBy: { createdAt: 'desc' },
    })
    assert.ok(log, 'la reimpostazione deve restare scritta nell’activity log')
    assert.match(log.valoreNuovo ?? '', /link via email/)
  })
})
