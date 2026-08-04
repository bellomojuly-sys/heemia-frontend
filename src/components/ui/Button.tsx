import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

// Fase 14: ogni variante ha il proprio stacco d'ombra al passaggio del mouse
// (il primario di più, è l'azione principale) e tutti i bottoni "si premono"
// al click con una micro-scalatura — è il feedback che fa sembrare reattiva
// un'interfaccia che per il resto non si muove.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-heemia-black text-white border border-heemia-black shadow-heemia-xs hover:bg-heemia-charcoal hover:shadow-heemia-md',
  secondary:
    'bg-white text-heemia-black border border-heemia-border-strong hover:border-heemia-black hover:shadow-heemia-sm',
  ghost: 'bg-transparent text-heemia-grey border border-transparent hover:bg-heemia-surface-muted/60 hover:text-heemia-carmine',
}

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: { variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-heemia-sm px-3.5 py-1.5 text-xs font-medium tracking-wide transition-all duration-200 ease-heemia active:scale-[0.96] active:duration-75 disabled:cursor-not-allowed disabled:border-heemia-border disabled:text-heemia-grey-light disabled:shadow-none disabled:hover:scale-100 disabled:hover:bg-transparent disabled:hover:text-heemia-grey-light disabled:hover:shadow-none disabled:active:scale-100 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  )
}
