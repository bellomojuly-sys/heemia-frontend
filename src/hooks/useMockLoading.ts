import { useEffect, useState } from 'react'

// Simula una latenza di rete per rappresentare lo stato di caricamento richiesto da UI_Design_System.md,
// anche in assenza di un backend reale (DEC-015).
export function useMockLoading(ms = 600): boolean {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms)
    return () => clearTimeout(t)
  }, [ms])

  return loading
}
