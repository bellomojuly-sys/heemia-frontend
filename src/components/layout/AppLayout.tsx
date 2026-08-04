import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function AppLayout() {
  // Sotto il breakpoint lg la sidebar diventa un drawer aperto dall'hamburger nell'header;
  // si chiude a ogni navigazione o toccando lo sfondo.
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setMenuOpen(false), [location.pathname])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-heemia-cream">
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
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
