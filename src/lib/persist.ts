// Persistenza leggera su localStorage per i dati compilati dall'utente nel prototipo.
// Deviazione concordata da DEC-015 (che vuole tutto in memoria): le schede tecniche
// contengono data-entry reale + foto e devono sopravvivere al reload. Il resto dei mock
// resta in memoria. Tutto è best-effort: se localStorage non è disponibile o la quota è
// superata (le foto base64 pesano), si degrada senza rompere l'app.

export const STORAGE_KEYS = {
  technicalSheets: 'heemia:techsheets:v1',
} as const

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

/** Legge e deserializza un valore persistito; ritorna `fallback` se assente o corrotto. */
export function loadPersisted<T>(key: string, fallback: T): T {
  if (!hasStorage()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * Serializza e salva un valore. Ritorna un esito così che il chiamante possa avvisare
 * l'utente quando il salvataggio fallisce (tipicamente quota superata da troppe foto).
 */
export function savePersisted<T>(key: string, value: T): { ok: boolean; reason?: 'unavailable' | 'quota' | 'error' } {
  if (!hasStorage()) return { ok: false, reason: 'unavailable' }
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return { ok: true }
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return { ok: false, reason: isQuota ? 'quota' : 'error' }
  }
}
