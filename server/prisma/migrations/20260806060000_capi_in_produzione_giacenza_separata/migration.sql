-- Capi in produzione: da "impegno dentro il laboratorio" a giacenza separata (DEC-047).
--
-- Cambia il significato dei due esiti di chiusura, quindi cambiano anche i nomi:
--   consumato  → terminato  (il capo è finito e rientra in laboratorio)
--   rilasciato → annullato  (la lavorazione decade, i capi rientrano com'erano)
--
-- Nessun ricalcolo delle giacenze: alla data di questa migrazione non esistono
-- lavorazioni chiuse né aperte sui database reali (produzione creata il 2026-08-04 e
-- ancora senza dati, sviluppo ripulito). Se ne esistessero, andrebbero riportate a mano:
-- con il modello precedente i capi in lavorazione erano ancora contati in laboratorio.
ALTER TYPE "CommitmentStato" RENAME VALUE 'consumato' TO 'terminato';
ALTER TYPE "CommitmentStato" RENAME VALUE 'rilasciato' TO 'annullato';
