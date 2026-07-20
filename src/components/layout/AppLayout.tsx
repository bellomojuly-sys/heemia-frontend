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
            className="absolute inset-0 w-full bg-heemia-black/50"
          />
          <div className="absolute inset-y-0 left-0 shadow-xl">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
