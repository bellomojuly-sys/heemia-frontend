-- Scampoli riutilizzabili e valorizzazione economica delle lavorazioni esterne.
--
-- Gli scarti storici erano sempre trattati come perdite: la colonna fisica
-- quantita_scartata viene quindi mantenuta e ora rappresenta lo scarto perso. La nuova
-- colonna quantita_scarto_recuperato contiene solo ritagli o componenti ancora utilizzabili.

ALTER TYPE "MovimentoLavorazioneTipo" ADD VALUE 'scarto_recuperato' AFTER 'consumo';
ALTER TYPE "LavorazioneUbicazione" ADD VALUE 'scampoli' AFTER 'produzione_esterna';

CREATE TYPE "BollaRigaProvenienza" AS ENUM ('magazzino', 'scampoli');

ALTER TABLE "materials"
  ADD COLUMN "metri_scampoli" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "accessories"
  ADD COLUMN "quantita_scampoli" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "inventory_records"
  ADD COLUMN "qta_scampoli" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "bolle_lavorazione_righe"
  ADD COLUMN "provenienza" "BollaRigaProvenienza" NOT NULL DEFAULT 'magazzino',
  ADD COLUMN "costo_unitario" DECIMAL(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN "fonte_costo" "CostSource" NOT NULL DEFAULT 'materiale',
  ADD COLUMN "quantita_scarto_recuperato" DECIMAL(12,4) NOT NULL DEFAULT 0;

ALTER TABLE "bolle_lavorazione_rientri_righe"
  ADD COLUMN "quantita_scarto_recuperato" DECIMAL(12,4) NOT NULL DEFAULT 0;

ALTER TABLE "movimenti_lavorazione"
  ADD COLUMN "costo_unitario" DECIMAL(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN "valore" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Congela anche il valore delle righe create prima di questa estensione, usando il costo
-- corrente dell'anagrafica. Da questo momento in poi il service lo fotografa alla creazione.
UPDATE "bolle_lavorazione_righe" AS r
SET "costo_unitario" = m."prezzo_al_metro"
FROM "materials" AS m
WHERE m."id" = r."material_id";

UPDATE "bolle_lavorazione_righe" AS r
SET "costo_unitario" = a."costo_unitario"
FROM "accessories" AS a
WHERE a."id" = r."accessory_id";

UPDATE "movimenti_lavorazione" AS mv
SET
  "costo_unitario" = r."costo_unitario",
  "valore" = ROUND(mv."quantita" * r."costo_unitario", 2)
FROM "bolle_lavorazione_righe" AS r
WHERE r."id" = mv."riga_id";
