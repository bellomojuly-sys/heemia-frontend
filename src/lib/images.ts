/**
 * Lettura di immagini dal dispositivo, condivisa fra scheda tecnica e richieste showroom.
 * Le foto a piena risoluzione (5-10 MB) sfonderebbero il limite del payload JSON e
 * riempirebbero il database di dati inutili: si ridimensionano prima di inviarle.
 * Lato lungo max 1000px, JPEG 0.8 — abbastanza per un riferimento visivo.
 */
export function fileToDownscaledDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('lettura fallita'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('immagine non valida'))
      img.onload = () => {
        const max = 1000
        const scala = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scala)
        const h = Math.round(img.height * scala)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas non disponibile'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = String(reader.result ?? '')
    }
    reader.readAsDataURL(file)
  })
}
