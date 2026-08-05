// Il verso della capretta: sintetizzato con la Web Audio API, non un file audio.
// Niente asset da scaricare o licenziare, pesa zero sul bundle e non ha da caricare
// nulla prima di suonare — importante perché deve partire nello stesso istante in cui
// compare l'avviso, non un attimo dopo.

import { loadPersisted, savePersisted } from './persist'

const STORAGE_KEY = 'heemia:goat-sound-muto:v1'

let contestoAudio: AudioContext | null = null

function contesto(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Costruttore = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Costruttore) return null
  // Un solo AudioContext per tutta la sessione: crearne uno per ogni verso esaurisce
  // rapidamente i contesti che Chrome concede prima di un'interazione dell'utente.
  if (!contestoAudio) contestoAudio = new Costruttore()
  return contestoAudio
}

export function isGoatSoundMuto(): boolean {
  return loadPersisted(STORAGE_KEY, false)
}

export function setGoatSoundMuto(muto: boolean): void {
  savePersisted(STORAGE_KEY, muto)
}

/**
 * Fase 14 (secondo giro) — verso rifatto da capo.
 *
 * La prima versione era un tono unico tenuto un secondo, con vibrato: al
 * riascolto suonava come un "muuu" cantato, non un belato. Il problema non
 * era il timbro ma la **struttura**: un vero "beeeh" di capra non è un tono
 * continuo, è **spezzato in 3-4 impulsi brevi** ("meh-eh-eh-eh"), ciascuno
 * con un attacco secco e un timbro ruvido — quasi un ronzio di kazoo più che
 * una voce cantata. Qui sotto ogni impulso è un evento a sé (oscillatore
 * proprio, inviluppo proprio), non un'unica nota modulata.
 *
 * Cose che restano dalla prima versione perché funzionavano: i due formanti
 * in bandpass che danno la vocale "e" (senza sarebbe un ronzio qualunque),
 * l'inviluppo a curva morbida invece che lineare, e un solo AudioContext per
 * sessione.
 *
 * Non potendo ascoltare l'output in questa sessione, il criterio guida è
 * strutturale: impulsi brevi e separati, non un tono lungo. Se il risultato
 * ancora non convince, il primo posto da guardare è `IMPULSI` qui sotto —
 * numero, durata e passo di intonazione dei colpi sono tutti isolati lì.
 */
const IMPULSI = [
  { inizio: 0, durata: 0.16, fondamentale: 410 },
  { inizio: 0.15, durata: 0.13, fondamentale: 370 },
  { inizio: 0.28, durata: 0.13, fondamentale: 340 },
  { inizio: 0.41, durata: 0.16, fondamentale: 300 },
]

const VOLUME = 0.05
// Le due risonanze che danno la vocale "e": la prima bassa e larga, la
// seconda alta e stretta. Senza queste il suono resta un ronzio qualunque.
const FORMANTE_1 = 550
const FORMANTE_2 = 2300

/** Un singolo impulso "eh": dente di sega ruvido, vibrato veloce, attacco
 * secco e rilascio morbido. `t0` è l'istante assoluto di AudioContext in cui
 * parte, non un tempo relativo — così gli impulsi si susseguono sulla stessa
 * timeline senza bisogno di setTimeout separati (che deriverebbero rispetto
 * all'audio clock). */
function impulso(ctx: AudioContext, uscita: AudioNode, t0: number, durata: number, fondamentale: number): void {
  const fine = t0 + durata

  const voce = ctx.createOscillator()
  voce.type = 'sawtooth'
  voce.frequency.setValueAtTime(fondamentale, t0)
  // Piccola discesa dentro l'impulso stesso: anche un singolo "eh" di capra
  // non è a tono fisso, scivola leggermente in giù mentre il fiato cala.
  voce.frequency.linearRampToValueAtTime(fondamentale * 0.92, fine)

  // Vibrato rapido sulla frequenza — è il tremolio, non il timbro, a rendere
  // riconoscibile un belato. Sotto i ~18 Hz suona come una voce cantata,
  // sopra i ~35 come un ronzio elettronico: si resta nel mezzo.
  const vibrato = ctx.createOscillator()
  vibrato.type = 'sine'
  vibrato.frequency.value = 26
  const profonditaVibrato = ctx.createGain()
  profonditaVibrato.gain.value = 22
  vibrato.connect(profonditaVibrato)
  profonditaVibrato.connect(voce.frequency)

  const f1 = ctx.createBiquadFilter()
  f1.type = 'bandpass'
  f1.frequency.value = FORMANTE_1
  f1.Q.value = 5
  const f2 = ctx.createBiquadFilter()
  f2.type = 'bandpass'
  f2.frequency.value = FORMANTE_2
  f2.Q.value = 8
  const pesoF2 = ctx.createGain()
  pesoF2.gain.value = 0.65

  // Inviluppo: attacco secco (5ms, quasi percussivo — è quello che distingue
  // un "eh" da un fischio) e rilascio morbido (`setTargetAtTime`, non una
  // rampa lineare: niente spigolo udibile a fine impulso).
  const inviluppo = ctx.createGain()
  inviluppo.gain.setValueAtTime(0.0001, t0)
  inviluppo.gain.linearRampToValueAtTime(VOLUME, t0 + 0.015)
  inviluppo.gain.setTargetAtTime(0.0001, t0 + durata * 0.55, durata * 0.22)

  voce.connect(f1)
  voce.connect(f2)
  f1.connect(inviluppo)
  f2.connect(pesoF2)
  pesoF2.connect(inviluppo)
  inviluppo.connect(uscita)

  voce.start(t0)
  voce.stop(fine + 0.05)
  vibrato.start(t0)
  vibrato.stop(fine + 0.05)
}

/**
 * Il belato: una sequenza di 3-4 "eh" brevi e ravvicinati — non un tono
 * tenuto. Resta volutamente sotto tono, accompagna l'avviso senza far girare
 * le teste in ufficio. Chi non lo vuole lo spegne da Impostazioni.
 */
export function playGoatBleat(): void {
  if (isGoatSoundMuto()) return
  const ctx = contesto()
  if (!ctx) return

  // I browser sospendono l'AudioContext finché non arriva un'interazione
  // dell'utente. L'avviso può comparire dopo un click (va bene) o dopo un
  // evento asincrono come un 409 dal server: in quel caso `resume()` lo
  // riattiva, se è già stato sbloccato almeno una volta nella sessione.
  if (ctx.state === 'suspended') void ctx.resume()

  const uscita = ctx.createGain()
  uscita.gain.value = 1
  uscita.connect(ctx.destination)

  const t0 = ctx.currentTime
  for (const { inizio, durata, fondamentale } of IMPULSI) {
    impulso(ctx, uscita, t0 + inizio, durata, fondamentale)
  }
}
