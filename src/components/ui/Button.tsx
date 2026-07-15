import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-heemia-black text-white border border-heemia-black hover:bg-heemia-charcoal',
  secondary: 'bg-white text-heemia-black border border-heemia-border-strong hover:border-heemia-black',
  ghost: 'bg-transparent text-heemia-grey border border-transparent hover:text-heemia-carmine',
}

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: { variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-[3px] px-3.5 py-1.5 text-xs font-medium tracking-wide transition-colors disabled:cursor-not-allowed disabled:border-heemia-border disabled:text-heemia-grey-light disabled:hover:bg-transparent disabled:hover:text-heemia-grey-light ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  )
}
