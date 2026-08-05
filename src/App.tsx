import { AppRouter } from './AppRouter'
import { GoatAlertProvider } from './context/GoatAlertContext'

function App() {
  // In cima a tutto, showroom incluso: un cliente che sbaglia un campo nel form
  // "su misura" merita lo stesso avviso di chi lavora nel gestionale.
  return (
    <GoatAlertProvider>
      <AppRouter />
    </GoatAlertProvider>
  )
}

export default App
