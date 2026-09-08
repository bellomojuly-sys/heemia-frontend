-- Credenziali dei servizi esterni inserite dall'app, cifrate (2026-09-09).
--
-- Perche' adesso: la chiave OpenAI del gestionale e' legata a un account personale di chi
-- ha sviluppato l'app, mentre l'abbonamento e il credito sono dell'azienda. Alla consegna
-- la CEO deve poter collegare l'account aziendale da sola, da Impostazioni, senza entrare
-- nel pannello di Render e senza chiedere niente a nessuno. Il team continua a usare le
-- funzioni AI con i permessi Heemia che ha gia': nessuno vede la chiave, nessuno ha
-- bisogno di un account OpenAI proprio.
--
-- Il valore scende cifrato (AES-256-GCM, server/src/core/segreti.ts): la chiave di
-- cifratura non e' in questa tabella e non e' nel database, si deriva da un segreto
-- dell'ambiente. Un backup di questa tabella, da solo, non contiene nessun segreto usabile.
--
-- La variabile d'ambiente OPENAI_API_KEY continua a funzionare: se qui non c'e' una riga,
-- vale quella. E' la via di rientro se la chiave nuova si rivela sbagliata.
CREATE TABLE IF NOT EXISTS "credenziali_integrazioni" (
  "chiave"            TEXT PRIMARY KEY,
  "valore_cifrato"    TEXT NOT NULL,
  "suffisso"          TEXT NOT NULL,
  "impostata_da_id"   UUID,
  "impostata_da_nome" TEXT,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
