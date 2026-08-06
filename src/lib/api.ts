// Fase 13 — client HTTP verso il backend. Unico punto da cui il frontend parla con l'API:
// nessuna pagina fa fetch da sé.
//
// Tre cose che questo modulo risolve una volta per tutte:
//  1. la sessione è un cookie httpOnly → serve sempre `credentials: 'include'`;
//  2. gli errori arrivano come { error: { code, message } } (DEC-036) → diventano ApiError;
//  3. Prisma serializza i Decimal come stringhe ("120") mentre i tipi del frontend
//     vogliono numeri → `num()` e gli adapter in api/adapters.ts convertono.

// Render inietta l'host senza schema (es. "heemia-api.onrender.com"): senza https://
// fetch lo interpreterebbe come percorso relativo. Qui lo normalizziamo una volta sola.
function normalizzaBaseUrl(raw: string): string {
  const v = raw.trim().replace(/\/$/, '')
  if (!v) return ''
  return /^https?:\/\//.test(v) ? v : `https://${v}`
}

const BASE_URL = normalizzaBaseUrl(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001')
const API_PREFIX = '/api/v1'
const SHOWROOM_PREFIX = '/api/showroom'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, message: string, code = 'ERROR') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
  /** Sessione assente o scaduta: chi chiama deve rimandare al login. */
  get isAuthError() {
    return this.status === 401
  }
  /** Il ruolo non ha accesso: da mostrare come messaggio, non come errore tecnico. */
  get isForbidden() {
    return this.status === 403
  }
}

// Un 401 su una chiamata qualsiasi vuol dire che la sessione non è più valida (scaduta o
// revocata dal server). Senza un punto unico ogni pagina mostrerebbe il proprio errore
// tecnico ("Non autenticato") restando dentro l'app: qui avvisiamo una volta sola chi
// gestisce la sessione (AuthContext), che riporta alla schermata di accesso.
let onSessioneScaduta: (() => void) | null = null

export function setSessioneScadutaHandler(fn: (() => void) | null) {
  onSessioneScaduta = fn
}

async function request<T>(method: string, path: string, body?: unknown, prefix = API_PREFIX): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${prefix}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // Rete assente o backend spento: messaggio comprensibile invece di "Failed to fetch".
    throw new ApiError(0, 'Impossibile contattare il server. Verifica che il backend sia avviato.', 'NETWORK')
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const payload = text ? safeJson(text) : null

  if (!res.ok) {
    // Le rotte /auth/* sono escluse: il 401 di /auth/me al primo caricamento e quello di
    // /auth/login con password sbagliata non sono sessioni scadute. Lo showroom non ha
    // sessione interna, quindi non deve toccare l'accesso al gestionale.
    if (res.status === 401 && prefix === API_PREFIX && !path.startsWith('/auth/')) onSessioneScaduta?.()
    const err = (payload as { error?: { code?: string; message?: string } })?.error
    throw new ApiError(res.status, err?.message ?? `Errore ${res.status}`, err?.code ?? 'ERROR')
  }
  return payload as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  /** Sub-app showroom: prefisso separato, nessuna sessione interna (System_Architecture A5). */
  showroom: {
    get: <T>(path: string) => request<T>('GET', path, undefined, SHOWROOM_PREFIX),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body, SHOWROOM_PREFIX),
    del: <T>(path: string) => request<T>('DELETE', path, undefined, SHOWROOM_PREFIX),
  },
}

/** Decimal Prisma ("98.36") o null → number. */
export function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Timestamp ISO → "YYYY-MM-DD", il formato che usano i tipi del frontend. */
export function isoDate(v: unknown): string {
  if (!v) return ''
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}
