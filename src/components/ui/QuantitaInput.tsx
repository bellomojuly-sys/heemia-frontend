import { useState } from 'react'

/**
 * Campo numerico che salva **alla conferma** (uscita dal campo o Invio), non a ogni tasto.
 *
 * Nato per la distribuzione iniziale delle giacenze (FR-49), dove scrivere a ogni battuta
 * apriva la domanda della capretta dopo la prima cifra — "1" mentre si stava digitando "12".
 * Il problema però non era solo della migrazione: **ogni** campo quantità collegato a una
 * scrittura sul server aveva lo stesso difetto. Digitando "150" partivano tre salvataggi
 * (1, 15, 150), ognuno dei quali lascia una rettifica in `inventory_movements` e una riga
 * di log: lo storico si riempiva di movimenti mai avvenuti davvero. E svuotare il campo
 * per riscriverlo salvava uno zero.
 *
 * Perciò questo componente è l'unico modo in cui si modifica una quantità nell'app.
 */
export function QuantitaInput({
  valore,
  etichetta,
  className,
  onConferma,
  disabled = false,
  title,
  step,
  decimali = false,
}: {
  valore: number
  etichetta: string
  className: string
  onConferma: (quantita: number) => void
  disabled?: boolean
  title?: string
  step?: string
  /** Importi in euro: accetta i decimali invece di arrotondare a numero intero. */
  decimali?: boolean
}) {
  const [testo, setTesto] = useState(String(valore))

  // Se il valore arriva dal server (dopo un salvataggio, o dopo un rifiuto che lascia il
  // dato com'era) il campo lo segue: quello che si vede è sempre ciò che è salvato.
  const [valorePrec, setValorePrec] = useState(valore)
  if (valore !== valorePrec) {
    setValorePrec(valore)
    setTesto(String(valore))
  }

  const consegna = () => {
    const grezzo = Math.max(0, Number(testo) || 0)
    const quantita = decimali ? grezzo : Math.round(grezzo)
    // Niente scrittura se il numero non è cambiato: entrare e uscire da un campo non è
    // una modifica, e non deve comparire nello storico dei movimenti.
    if (quantita === valore) {
      setTesto(String(valore))
      return
    }
    onConferma(quantita)
  }

  return (
    <input
      type="number"
      min="0"
      step={step ?? (decimali ? '0.01' : '1')}
      value={testo}
      aria-label={etichetta}
      title={title}
      disabled={disabled}
      className={className}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setTesto(e.target.value)}
      onBlur={consegna}
      onKeyDown={(e) => {
        // `keyCode` come rete di sicurezza: alcuni ambienti (e gli strumenti di
        // automazione) recapitano l'evento senza `key` valorizzato, e il campo
        // resterebbe lì senza confermare niente.
        if (e.key === 'Enter' || e.keyCode === 13) e.currentTarget.blur()
        if (e.key === 'Escape' || e.keyCode === 27) setTesto(String(valore))
      }}
    />
  )
}
