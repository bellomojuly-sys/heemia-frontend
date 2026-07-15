import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { SupplierRequest, SupplierRequestStato, ProductionStep } from '../types'
import { supplierRequests as initialSupplierRequests } from '../mock/supplierRequests'
import { productionSteps as initialProductionSteps } from '../mock/production'
import { checkAdvance } from '../lib/production'

// Le uniche entità con stato mutabile a runtime nel prototipo (DEC-015: nessun backend/DB —
// la mutazione vive solo in memoria per la sessione del browser, si resetta al reload).
// Ogni altra entità mock resta un import statico read-only.

interface MockStoreValue {
  supplierRequests: SupplierRequest[]
  productionSteps: ProductionStep[]
  setSupplierRequestStatus: (id: string, stato: SupplierRequestStato, extra?: Partial<SupplierRequest>) => void
  updateSupplierRequestDraft: (id: string, patch: Partial<Pick<SupplierRequest, 'testo' | 'quantitaRichiesta' | 'deadlineIdeale'>>) => void
  advanceProductionStep: (id: string) => { ok: boolean; reason?: string }
}

const MockStoreContext = createContext<MockStoreValue | undefined>(undefined)

export function MockStoreProvider({ children }: { children: ReactNode }) {
  const [supplierRequests, setSupplierRequests] = useState<SupplierRequest[]>(initialSupplierRequests)
  const [productionSteps, setProductionSteps] = useState<ProductionStep[]>(initialProductionSteps)

  const value = useMemo<MockStoreValue>(
    () => ({
      supplierRequests,
      productionSteps,

      setSupplierRequestStatus: (id, stato, extra) => {
        setSupplierRequests((prev) => prev.map((r) => (r.id === id ? { ...r, stato, ...extra } : r)))
      },

      updateSupplierRequestDraft: (id, patch) => {
        setSupplierRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, ...patch, stato: 'modificata' } : r)),
        )
      },

      advanceProductionStep: (id) => {
        let result: { ok: boolean; reason?: string } = { ok: false, reason: 'Step non trovato.' }
        setProductionSteps((prev) =>
          prev.map((step) => {
            if (step.id !== id) return step
            const check = checkAdvance(step)
            if (!check.ok || !check.next) {
              result = { ok: false, reason: check.reason }
              return { ...step, bloccata: true, motivoBlocco: check.reason }
            }
            result = { ok: true }
            return { ...step, fase: check.next, bloccata: false, motivoBlocco: undefined }
          }),
        )
        return result
      },
    }),
    [supplierRequests, productionSteps],
  )

  return <MockStoreContext.Provider value={value}>{children}</MockStoreContext.Provider>
}

export function useMockStore(): MockStoreValue {
  const ctx = useContext(MockStoreContext)
  if (!ctx) throw new Error('useMockStore deve essere usato dentro MockStoreProvider')
  return ctx
}
