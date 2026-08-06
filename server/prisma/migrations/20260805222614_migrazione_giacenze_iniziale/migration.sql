-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "motivo" TEXT;

-- AlterTable
ALTER TABLE "inventory_records" ADD COLUMN     "migrazione_completata" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "migrazione_confermata_da" UUID,
ADD COLUMN     "migrazione_confermata_il" TIMESTAMPTZ(6),
ADD COLUMN     "totale_migrazione" INTEGER;

-- Righe già presenti prima di questa migrazione: il totale dichiarato è quello che
-- risulta oggi (magazzino + laboratorio), così la validazione della distribuzione parte
-- da un dato coerente. Restano `migrazione_completata = false`: la conferma è un gesto
-- umano, non qualcosa che si dà per fatto con una UPDATE.
UPDATE "inventory_records"
SET "totale_migrazione" = "qta_magazzino" + "qta_laboratorio"
WHERE "totale_migrazione" IS NULL;
