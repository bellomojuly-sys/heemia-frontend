// Serializzazione delle operazioni che leggono una quantità, decidono se è sufficiente e
// poi la scrivono.
//
// Il problema che risolve. Postgres lavora in Read Committed: due transazioni simultanee
// che leggono la stessa riga vedono entrambe il valore *prima* delle rispettive scritture.
// Un controllo del tipo "ci sono ancora 12 metri, quindi ne posso registrare 12" passa
// quindi in tutt'e due, e la seconda scrittura non trova nessuno che la fermi: la giacenza
// finisce sotto zero, o un capo entra in inventario due volte. Mettere la lettura dentro
// la transazione NON basta — il punto non è dove sta la lettura, è che nulla impedisce a
// due transazioni di leggere lo stesso valore.
//
// Il lock consultivo di Postgres risolve esattamente questo: la seconda transazione aspetta
// che la prima abbia finito e *poi* legge, quindi vede le quantità già aggiornate e viene
// respinta dal normale controllo di merito, con il messaggio giusto ("presso il lavorante
// ce ne sono ancora N") invece di un errore tecnico. Si rilascia da sé alla fine della
// transazione, che sia commit o rollback: non esiste il caso del lock dimenticato.
//
// È la stessa tecnica già usata per il progressivo delle bolle (lavorazioni/service.ts),
// qui generalizzata alle risorse con una quantità.
import type { Prisma } from '@prisma/client'

/**
 * Blocca una risorsa per il resto della transazione. Da chiamare come **prima** istruzione,
 * prima di qualunque lettura di cui poi ci si fida per decidere una scrittura.
 *
 * `spazio` separa gli ambiti (due operazioni diverse sulla stessa risorsa non si bloccano
 * a vicenda per sbaglio); `id` è la risorsa concreta, tipicamente un UUID.
 */
export async function bloccaRisorsa(tx: Prisma.TransactionClient, spazio: string, id: string) {
  // La versione a due argomenti di pg_advisory_xact_lock esiste solo per (int, int), e
  // hashtext restituisce esattamente un int: il cast non serve, il tipo combacia già.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${spazio}), hashtext(${id}))`
}
