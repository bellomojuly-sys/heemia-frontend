-- Bolle / DDT di lavorazione esterna (richiesta di Giulia 2026-08-10).
--
-- Cosa aggiunge: il ciclo completo della merce affidata a un lavorante — documento di
-- uscita, righe dei materiali consegnati, rientri (utilizzato / restituito / scartato),
-- capi finiti ricevuti e il registro dei movimenti che li collega.
--
-- Tre colonne nuove sulle tabelle esistenti reggono la giacenza "presso il lavorante":
--   materials.metri_presso_terzisti, accessories.quantita_presso_terzisti,
--   inventory_records.qta_presso_terzisti
-- Tutte con DEFAULT 0: sui dati esistenti non cambia nulla, e il residuo storico
-- (acquistato - utilizzato) mantiene il significato che aveva prima.
--
-- Migrazione puramente additiva: nessuna colonna o tabella viene rimossa o rinominata.

-- CreateEnum
CREATE TYPE "BollaLavorazioneStato" AS ENUM ('bozza', 'emessa', 'parzialmente_rientrata', 'chiusa', 'annullata');

-- CreateEnum
CREATE TYPE "BollaCausale" AS ENUM ('conto_lavorazione', 'conto_visione', 'riparazione', 'campionatura', 'reso_a_fornitore', 'altro');

-- CreateEnum
CREATE TYPE "MovimentoLavorazioneTipo" AS ENUM ('uscita_materiale', 'rientro_inutilizzato', 'consumo', 'scarto', 'carico_finiti', 'storno_uscita');

-- CreateEnum
CREATE TYPE "LavorazioneUbicazione" AS ENUM ('magazzino', 'produzione_esterna', 'consumato', 'scarto');

-- AlterTable
ALTER TABLE "accessories" ADD COLUMN     "quantita_presso_terzisti" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "inventory_records" ADD COLUMN     "qta_presso_terzisti" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "metri_presso_terzisti" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "bolle_lavorazione" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT,
    "anno" INTEGER,
    "progressivo" INTEGER,
    "data" DATE NOT NULL,
    "causale" "BollaCausale" NOT NULL DEFAULT 'conto_lavorazione',
    "stato" "BollaLavorazioneStato" NOT NULL DEFAULT 'bozza',
    "supplier_id" UUID NOT NULL,
    "lavorante_nome" TEXT,
    "lavorante_partita_iva" TEXT,
    "product_id" UUID,
    "technical_sheet_id" UUID,
    "commessa" TEXT,
    "order_id" UUID,
    "quantita_attesa" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "differenza_note" TEXT,
    "chiusa_con_differenza" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "emessa_da" UUID,
    "emessa_il" TIMESTAMPTZ(6),
    "chiusa_da" UUID,
    "chiusa_il" TIMESTAMPTZ(6),
    "annullata_il" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bolle_lavorazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bolle_lavorazione_righe" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bolla_id" UUID NOT NULL,
    "material_id" UUID,
    "accessory_id" UUID,
    "variant_id" UUID,
    "descrizione" TEXT NOT NULL,
    "sku" TEXT,
    "unita_misura" TEXT NOT NULL,
    "lotto" TEXT,
    "colore" TEXT,
    "variante" TEXT,
    "note" TEXT,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "quantita_inviata" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "quantita_utilizzata" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "quantita_restituita" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "quantita_scartata" DECIMAL(12,4) NOT NULL DEFAULT 0,

    CONSTRAINT "bolle_lavorazione_righe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bolle_lavorazione_rientri" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bolla_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "numero_documento_lavorante" TEXT,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bolle_lavorazione_rientri_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bolle_lavorazione_rientri_righe" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rientro_id" UUID NOT NULL,
    "riga_id" UUID NOT NULL,
    "quantita_utilizzata" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "quantita_restituita" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "quantita_scartata" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "bolle_lavorazione_rientri_righe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bolle_lavorazione_rientri_capi" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rientro_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "taglia" TEXT NOT NULL,
    "colore" TEXT NOT NULL,
    "quantita" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "bolle_lavorazione_rientri_capi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimenti_lavorazione" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bolla_id" UUID NOT NULL,
    "riga_id" UUID,
    "rientro_id" UUID,
    "tipo" "MovimentoLavorazioneTipo" NOT NULL,
    "da" "LavorazioneUbicazione" NOT NULL,
    "a" "LavorazioneUbicazione" NOT NULL,
    "quantita" DECIMAL(12,4) NOT NULL,
    "material_id" UUID,
    "accessory_id" UUID,
    "variant_id" UUID,
    "descrizione" TEXT NOT NULL,
    "unita_misura" TEXT NOT NULL,
    "motivo" TEXT,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimenti_lavorazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bolle_lavorazione_allegati" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bolla_id" UUID NOT NULL,
    "rientro_id" UUID,
    "nome" TEXT NOT NULL,
    "data_url" TEXT NOT NULL,
    "created_by" UUID,
    "caricato_il" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bolle_lavorazione_allegati_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bolle_lavorazione_numero_key" ON "bolle_lavorazione"("numero");

-- CreateIndex
CREATE INDEX "bolle_lavorazione_supplier_id_idx" ON "bolle_lavorazione"("supplier_id");

-- CreateIndex
CREATE INDEX "bolle_lavorazione_stato_idx" ON "bolle_lavorazione"("stato");

-- CreateIndex
CREATE INDEX "bolle_lavorazione_data_idx" ON "bolle_lavorazione"("data");

-- CreateIndex
CREATE INDEX "bolle_lavorazione_righe_bolla_id_idx" ON "bolle_lavorazione_righe"("bolla_id");

-- CreateIndex
CREATE INDEX "bolle_lavorazione_rientri_bolla_id_idx" ON "bolle_lavorazione_rientri"("bolla_id");

-- CreateIndex
CREATE INDEX "bolle_lavorazione_rientri_righe_riga_id_idx" ON "bolle_lavorazione_rientri_righe"("riga_id");

-- CreateIndex
CREATE UNIQUE INDEX "bolle_lavorazione_rientri_righe_rientro_id_riga_id_key" ON "bolle_lavorazione_rientri_righe"("rientro_id", "riga_id");

-- CreateIndex
CREATE INDEX "bolle_lavorazione_rientri_capi_rientro_id_idx" ON "bolle_lavorazione_rientri_capi"("rientro_id");

-- CreateIndex
CREATE INDEX "bolle_lavorazione_rientri_capi_variant_id_idx" ON "bolle_lavorazione_rientri_capi"("variant_id");

-- CreateIndex
CREATE INDEX "movimenti_lavorazione_bolla_id_idx" ON "movimenti_lavorazione"("bolla_id");

-- CreateIndex
CREATE INDEX "movimenti_lavorazione_riga_id_idx" ON "movimenti_lavorazione"("riga_id");

-- CreateIndex
CREATE INDEX "movimenti_lavorazione_created_at_idx" ON "movimenti_lavorazione"("created_at");

-- CreateIndex
CREATE INDEX "bolle_lavorazione_allegati_bolla_id_idx" ON "bolle_lavorazione_allegati"("bolla_id");

-- CreateIndex
CREATE INDEX "bolle_lavorazione_allegati_rientro_id_idx" ON "bolle_lavorazione_allegati"("rientro_id");

-- AddForeignKey
ALTER TABLE "bolle_lavorazione" ADD CONSTRAINT "bolle_lavorazione_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione" ADD CONSTRAINT "bolle_lavorazione_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione" ADD CONSTRAINT "bolle_lavorazione_technical_sheet_id_fkey" FOREIGN KEY ("technical_sheet_id") REFERENCES "technical_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione" ADD CONSTRAINT "bolle_lavorazione_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione" ADD CONSTRAINT "bolle_lavorazione_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione" ADD CONSTRAINT "bolle_lavorazione_emessa_da_fkey" FOREIGN KEY ("emessa_da") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione" ADD CONSTRAINT "bolle_lavorazione_chiusa_da_fkey" FOREIGN KEY ("chiusa_da") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_righe" ADD CONSTRAINT "bolle_lavorazione_righe_bolla_id_fkey" FOREIGN KEY ("bolla_id") REFERENCES "bolle_lavorazione"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_righe" ADD CONSTRAINT "bolle_lavorazione_righe_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_righe" ADD CONSTRAINT "bolle_lavorazione_righe_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_righe" ADD CONSTRAINT "bolle_lavorazione_righe_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_rientri" ADD CONSTRAINT "bolle_lavorazione_rientri_bolla_id_fkey" FOREIGN KEY ("bolla_id") REFERENCES "bolle_lavorazione"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_rientri" ADD CONSTRAINT "bolle_lavorazione_rientri_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_rientri_righe" ADD CONSTRAINT "bolle_lavorazione_rientri_righe_rientro_id_fkey" FOREIGN KEY ("rientro_id") REFERENCES "bolle_lavorazione_rientri"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_rientri_righe" ADD CONSTRAINT "bolle_lavorazione_rientri_righe_riga_id_fkey" FOREIGN KEY ("riga_id") REFERENCES "bolle_lavorazione_righe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_rientri_capi" ADD CONSTRAINT "bolle_lavorazione_rientri_capi_rientro_id_fkey" FOREIGN KEY ("rientro_id") REFERENCES "bolle_lavorazione_rientri"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_rientri_capi" ADD CONSTRAINT "bolle_lavorazione_rientri_capi_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimenti_lavorazione" ADD CONSTRAINT "movimenti_lavorazione_bolla_id_fkey" FOREIGN KEY ("bolla_id") REFERENCES "bolle_lavorazione"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimenti_lavorazione" ADD CONSTRAINT "movimenti_lavorazione_riga_id_fkey" FOREIGN KEY ("riga_id") REFERENCES "bolle_lavorazione_righe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimenti_lavorazione" ADD CONSTRAINT "movimenti_lavorazione_rientro_id_fkey" FOREIGN KEY ("rientro_id") REFERENCES "bolle_lavorazione_rientri"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimenti_lavorazione" ADD CONSTRAINT "movimenti_lavorazione_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_allegati" ADD CONSTRAINT "bolle_lavorazione_allegati_bolla_id_fkey" FOREIGN KEY ("bolla_id") REFERENCES "bolle_lavorazione"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_allegati" ADD CONSTRAINT "bolle_lavorazione_allegati_rientro_id_fkey" FOREIGN KEY ("rientro_id") REFERENCES "bolle_lavorazione_rientri"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bolle_lavorazione_allegati" ADD CONSTRAINT "bolle_lavorazione_allegati_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
