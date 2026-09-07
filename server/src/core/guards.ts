import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Role } from '@prisma/client'
import { SESSION_COOKIE, findValidSession } from '../modules/auth/session.js'
import { MODULE_LABELS, puo, type Azione, type ModuleKey } from './permissions.js'
import { forbidden, unauthorized } from './errors.js'

// Popola request.user dalla sessione cookie. Da usare come preHandler sugli endpoint protetti.
export async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
  const sid = req.cookies?.[SESSION_COOKIE]
  if (!sid) throw unauthorized()
  const unsigned = req.unsignCookie(sid)
  if (!unsigned.valid || !unsigned.value) throw unauthorized()
  const session = await findValidSession(unsigned.value)
  if (!session || !session.user) throw unauthorized('Sessione scaduta o non valida')
  req.user = {
    id: session.user.id,
    nome: session.user.nome,
    email: session.user.email,
    role: session.user.role,
    scope: session.scope,
    sessionId: session.id,
  }
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest) => {
    if (!req.user) throw unauthorized()
    if (!roles.includes(req.user.role)) throw forbidden()
  }
}

/**
 * Modulo a cui appartiene la rotta in corso. Lo scrive `requireModule` e lo legge
 * `requireEdit`, che così sa **su quale modulo** deve controllare il permesso di scrittura
 * senza che ogni rotta debba ripetere la propria chiave. È il motivo per cui le due
 * guardie vanno sempre in quest'ordine nel `preHandler`.
 */
declare module 'fastify' {
  interface FastifyRequest {
    moduloCorrente?: ModuleKey
  }
}

export function requireModule(moduleKey: ModuleKey) {
  return async (req: FastifyRequest) => {
    if (!req.user) throw unauthorized()
    req.moduloCorrente = moduleKey
    if (!(await puo(req.user.role, moduleKey, 'vedere'))) throw forbidden()
  }
}

/**
 * Dal metodo HTTP all'azione della matrice.
 *
 * GET e HEAD sono letture; PATCH e PUT sono modifiche; DELETE è un'eliminazione. POST è
 * ambiguo — «crea una fattura» e «invia questa richiesta al fornitore» sono lo stesso
 * verbo HTTP ma due cose diverse — quindi per POST si accetta **creare oppure modificare**:
 * chi può fare una delle due può eseguire l'azione. Una rotta che voglia essere più
 * severa lo dichiara con `requirePermesso('creare')`.
 */
function azioneDalMetodo(metodo: string): Azione[] {
  switch (metodo.toUpperCase()) {
    case 'GET':
    case 'HEAD':
      return ['vedere']
    case 'DELETE':
      return ['eliminare']
    case 'PATCH':
    case 'PUT':
      return ['modificare']
    default:
      return ['creare', 'modificare']
  }
}

const ETICHETTA_AZIONE: Record<Azione, string> = {
  vedere: 'consultare',
  creare: 'creare voci in',
  modificare: 'modificare',
  eliminare: 'eliminare da',
}

async function verifica(req: FastifyRequest, azioni: Azione[]) {
  if (!req.user) throw unauthorized()
  const moduleKey = req.moduloCorrente
  if (!moduleKey) {
    // Difesa contro un errore di scrittura delle rotte: senza modulo non si sa su cosa
    // controllare, e la risposta prudente è «no», non «sì».
    throw forbidden('Permesso non verificabile: la rotta non dichiara il modulo di appartenenza.')
  }
  for (const azione of azioni) {
    if (await puo(req.user.role, moduleKey, azione)) return
  }
  const azione = azioni[0]
  throw forbidden(
    `Il tuo ruolo non può ${ETICHETTA_AZIONE[azione]} «${MODULE_LABELS[moduleKey]}». ` +
      'Un amministratore può cambiarlo da Impostazioni → Preferenze e permessi.',
  )
}

/**
 * Guardia di scrittura. Il nome resta quello storico perché è usata in una quarantina di
 * rotte, ma il significato è cambiato: non chiede più «il ruolo è admin/ceo/team?» —
 * domanda che ignorava sia il modulo sia il tipo di operazione — bensì «questo ruolo può
 * fare *questa* cosa su *questo* modulo?», leggendo la matrice modificabile.
 *
 * Deve restare `async`: Fastify considera un hook concluso solo se restituisce una promise
 * o chiama done(). Una versione sincrona con arity 1 lascia la richiesta appesa per sempre.
 */
export async function requireEdit(req: FastifyRequest) {
  await verifica(req, azioneDalMetodo(req.method))
}

/** Controllo esplicito, per le rotte in cui il metodo HTTP non basta a dire cosa succede. */
export function requirePermesso(...azioni: Azione[]) {
  return async (req: FastifyRequest) => {
    await verifica(req, azioni)
  }
}
