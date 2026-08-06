import { useState } from 'react'
import { ImagePlaceholder } from '../ui/ImagePlaceholder'
import { imageUrlFrom } from '../../lib/driveImage'

/**
 * Foto di un capo, con ripiego.
 *
 * Un'immagine su Drive può non caricare per un motivo solo, quasi sempre: il file è
 * condiviso in modo ristretto invece che con "Chiunque abbia il link". In quel caso non
 * si lascia un riquadro vuoto — si mostra l'iniziale del capo e, a chi può intervenire,
 * il motivo: senza spiegazione sembrerebbe un difetto dell'app.
 */
export function ProductImage({
  url,
  nome,
  className = '',
  larghezza = 600,
}: {
  url?: string
  nome: string
  className?: string
  larghezza?: number
}) {
  const [fallito, setFallito] = useState(false)
  const src = imageUrlFrom(url, larghezza)

  if (!src || fallito) {
    return (
      <div className={`relative ${className}`}>
        <ImagePlaceholder label={nome} className="h-full w-full text-2xl" />
        {fallito && (
          <span
            className="absolute inset-x-0 bottom-0 bg-heemia-black/70 px-2 py-1 text-center text-[10px] leading-tight text-white"
            title="Su Drive il file deve essere condiviso con «Chiunque abbia il link»"
          >
            Immagine non accessibile
          </span>
        )}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={nome}
      loading="lazy"
      onError={() => setFallito(true)}
      className={`bg-heemia-surface object-cover ${className}`}
    />
  )
}
