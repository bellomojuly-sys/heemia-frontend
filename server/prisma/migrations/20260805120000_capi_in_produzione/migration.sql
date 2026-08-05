-- Rinomina lo stato dei capi mandati in lavorazione: "impegnato" era gergo interno,
-- "in_produzione" dice cosa sono davvero (richiesta di Giulia, 2026-08-05).
-- RENAME VALUE conserva le righe esistenti, a differenza della ricreazione del tipo.
ALTER TYPE "CommitmentStato" RENAME VALUE 'impegnato' TO 'in_produzione';

-- Il default della colonna cita il vecchio nome: va riscritto sul nuovo.
ALTER TABLE "stock_commitments" ALTER COLUMN "stato" SET DEFAULT 'in_produzione';
