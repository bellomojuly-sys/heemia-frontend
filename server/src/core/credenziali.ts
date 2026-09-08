// Credenziali dei servizi esterni inserite dall'app (2026-09-09).
//
// Il problema che risolve, detto con le parole di chi lo vive: la chiave OpenAI è legata
// a un account personale di chi ha sviluppato l'app. Quando il gestionale passa
// all'azienda, quell'account non c'entra più niente — l'abbonamento, il credito e la
// responsabilità sono della CEO. Ma finora la chiave si poteva mettere solo nelle
// variabili d'ambiente di Render, cioè in un posto dove entra chi fa i deploy.
//
// Da qui in avanti valgono due sorgenti, in quest'ordine:
//
//   1. la chiave salvata DALL'APP (tabella `credenziali_integrazioni`, cifrata) —
//      la inserisce la CEO o un amministratore da Impostazioni → Integrazioni;
//   2. la variabile d'ambiente, che resta valida e continua a funzionare come prima.
//
// L'ordine è deliberato: chi ha in mano l'azienda deve poter cambiare la chiave senza
// chiedere niente a nessuno, e la variabile d'ambiente resta la rete di sicurezza (un
// server che parte anche a database vuoto, e il modo di ripartire se qualcuno cancella la
// credenziale per sbaglio).
//
// **Il valore non esce mai da qui**: le rotte restituiscono se c'è, chi l'ha messa e le
// ultime quattro lettere. Il team usa le funzioni AI attraverso i propri permessi Heemia,
// senza vedere la chiave e senza avere un account OpenAI proprio — che è esattamente il
// modello «service account» consigliato: l'app ha una sua identità tecnica verso OpenAI,
// le persone hanno la loro verso l'app.
import { config } from './config.js'
import { prisma } from './prisma.js'
import { cifra, decifra, suffissoRiconoscibile } from './segreti.js'

export type CredenzialeKey = 'openai_api_key'

/** Ricaduta sulla variabile d'ambiente, per ogni credenziale gestibile dall'app. */
const DA_AMBIENTE: Record<CredenzialeKey, () => string> = {
  openai_api_key: () => config.openaiApiKey,
}

export type OrigineCredenziale = 'app' | 'ambiente' | 'assente'

export interface StatoCredenziale {
  origine: OrigineCredenziale
  /** Ultime quattro lettere: servono a riconoscere la chiave, non a ricostruirla. */
  suffisso: string | null
  aggiornataIl: Date | null
  impostataDa: string | null
}

/**
 * Ultimo valore conosciuto, tenuto in memoria per le funzioni che devono rispondere
 * **senza** poter aspettare una lettura a database — `configurata()` in core/integrations
 * è sincrona ed è usata da una decina di punti.
 *
 * È una fotografia, non la verità: la verità la legge `leggiCredenziale()`, che va a
 * database ogni volta che una funzione AI parte davvero. Così una chiave appena cambiata
 * vale subito, senza riavviare il server, e la fotografia serve solo a decidere se un
 * pulsante è acceso.
 */
const fotografia = new Map<CredenzialeKey, string>()

/** Valore da usare per la chiamata vera: database prima, variabile d'ambiente poi. */
export async function leggiCredenziale(chiave: CredenzialeKey): Promise<string> {
  const riga = await prisma.credenzialeIntegrazione.findUnique({ where: { chiave } })
  const valore = riga ? decifra(riga.valoreCifrato) : DA_AMBIENTE[chiave]().trim()
  fotografia.set(chiave, valore)
  return valore
}

/** Fotografia sincrona. Vuota finché nessuno ha letto: vale la variabile d'ambiente. */
export function credenzialeNota(chiave: CredenzialeKey): string {
  return fotografia.get(chiave) ?? DA_AMBIENTE[chiave]().trim()
}

/** Riallinea la fotografia. All'avvio e prima di mostrare il quadro delle integrazioni. */
export async function ricaricaCredenziali(): Promise<void> {
  for (const chiave of Object.keys(DA_AMBIENTE) as CredenzialeKey[]) {
    await leggiCredenziale(chiave)
  }
}

export async function statoCredenziale(chiave: CredenzialeKey): Promise<StatoCredenziale> {
  const riga = await prisma.credenzialeIntegrazione.findUnique({ where: { chiave } })
  if (riga) {
    fotografia.set(chiave, decifra(riga.valoreCifrato))
    return {
      origine: 'app',
      suffisso: riga.suffisso,
      aggiornataIl: riga.updatedAt,
      impostataDa: riga.impostataDaNome,
    }
  }
  const daAmbiente = DA_AMBIENTE[chiave]().trim()
  fotografia.set(chiave, daAmbiente)
  return {
    origine: daAmbiente ? 'ambiente' : 'assente',
    suffisso: daAmbiente ? suffissoRiconoscibile(daAmbiente) : null,
    aggiornataIl: null,
    impostataDa: null,
  }
}

export async function salvaCredenziale(
  chiave: CredenzialeKey,
  valore: string,
  chi: { id: string; nome: string },
): Promise<StatoCredenziale> {
  const pulito = valore.trim()
  const dati = {
    valoreCifrato: cifra(pulito),
    suffisso: suffissoRiconoscibile(pulito),
    impostataDaId: chi.id,
    impostataDaNome: chi.nome,
  }
  const riga = await prisma.credenzialeIntegrazione.upsert({
    where: { chiave },
    create: { chiave, ...dati },
    update: dati,
  })
  fotografia.set(chiave, pulito)
  return { origine: 'app', suffisso: riga.suffisso, aggiornataIl: riga.updatedAt, impostataDa: riga.impostataDaNome }
}

/**
 * Toglie la credenziale inserita dall'app. Non spegne per forza la funzione: se esiste
 * ancora la variabile d'ambiente, si torna a quella — ed è giusto che sia così, perché è
 * il modo di rientrare quando la chiave nuova si rivela sbagliata.
 */
export async function rimuoviCredenziale(chiave: CredenzialeKey): Promise<StatoCredenziale> {
  await prisma.credenzialeIntegrazione.deleteMany({ where: { chiave } })
  fotografia.delete(chiave)
  return statoCredenziale(chiave)
}
