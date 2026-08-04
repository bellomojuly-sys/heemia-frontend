import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useMockStore } from '../../context/MockStore'

export function AppLayout() {
  // Sotto il breakpoint lg la sidebar diventa un drawer aperto dall'hamburger nell'header;
  // si chiude a ogni navigazione o toccando lo sfondo.
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setMenuOpen(false), [location.pathname])

  // Fase 14 — il caricamento fallito non deve più passare inosservato.
  // Lo store intercettava già l'errore in `erroreCaricamento`, ma non lo leggeva
  // nessuno: col backend spento ogni pagina mostrava il proprio empty state
  // ("Nessun prodotto trovato"), indistinguibile da un archivio davvero vuoto.
  const { erroreCaricamento } = useMockStore()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-heemia-surface">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Chiudi menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 w-full animate-fade-in bg-heemia-black/50 backdrop-blur-[2px]"
          />
          {/* Fase 14: il drawer entra scorrendo da sinistra invece di apparire di scatto. */}
          <div className="absolute inset-y-0 left-0 animate-slide-in-left shadow-heemia-lg">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMenuOpen(true)} />
        <main className="scroll-smooth-y flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {/* La `key` sul pathname rimonta il contenitore a ogni cambio pagina: è quello
              che fa ripartire l'animazione d'ingresso, altrimenti React riuserebbe il nodo
              e la nuova pagina comparirebbe di colpo. */}
          <div key={location.pathname} className="mx-auto max-w-[1400px] animate-rise">
            {erroreCaricamento && (
              <div
                role="alert"
                className="mb-6 flex flex-wrap items-center gap-3 rounded-heemia-lg border border-heemia-carmine/30 bg-heemia-carmine-light px-4 py-3 shadow-heemia-sm"
              >
                <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-heemia-carmine" />
                <p className="min-w-0 flex-1 text-sm text-heemia-black">
                  <span className="font-medium">Dati non caricati.</span> {erroreCaricamento} Quello che vedi
                  potrebbe essere incompleto: non inserire nulla finché non si risolve.
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1.5 rounded-heemia-sm border border-heemia-carmine/40 bg-white px-2.5 py-1.5 text-xs text-heemia-carmine transition-all duration-200 ease-heemia hover:bg-heemia-carmine hover:text-white active:scale-95"
                >
                  <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Riprova
                </button>
              </div>
            )}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
