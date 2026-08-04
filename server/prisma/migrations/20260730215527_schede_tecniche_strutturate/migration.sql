-- CreateEnum
CREATE TYPE "StatoScheda" AS ENUM ('bozza', 'in_revisione', 'approvata', 'archiviata');

-- CreateEnum
CREATE TYPE "Affidabilita" AS ENUM ('alta', 'media', 'bassa');

-- CreateEnum
CREATE TYPE "SheetCostVoce" AS ENUM ('accessori', 'lavorazioni', 'taglio', 'confezione', 'ricamo_stampa', 'sviluppo_modello', 'disegno', 'scheda_tecnica', 'prototipazione', 'logistica', 'altro');

-- CreateEnum
CREATE TYPE "CostKind" AS ENUM ('diretto', 'sviluppo_ammortizzato');

-- CreateEnum
CREATE TYPE "CostSource" AS ENUM ('fattura', 'materiale', 'fornitore', 'manuale', 'stimato', 'ai');

-- AlterTable
ALTER TABLE "technical_sheets" ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "codice_prodotto" TEXT,
ADD COLUMN     "collezione" TEXT,
ADD COLUMN     "descrizione_tecnica" TEXT,
ADD COLUMN     "fornitore_laboratorio_id" UUID,
ADD COLUMN     "istruzioni_confezione" TEXT,
ADD COLUMN     "misure_vestibilita" TEXT,
ADD COLUMN     "nome_prodotto" TEXT,
ADD COLUMN     "note_tecniche" TEXT,
ADD COLUMN     "note_versione" TEXT,
ADD COLUMN     "pdf_file_caricato_il" TIMESTAMPTZ(6),
ADD COLUMN     "pdf_file_data_url" TEXT,
ADD COLUMN     "pdf_file_nome" TEXT,
ADD COLUMN     "quantita_prevista_produzione" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "scan_ai_affidabilita" "Affidabilita",
ADD COLUMN     "scan_ai_analizzato_il" TIMESTAMPTZ(6),
ADD COLUMN     "scan_ai_nome_file" TEXT,
ADD COLUMN     "scan_ai_note" TEXT,
ADD COLUMN     "scan_ai_voci_estratte" INTEGER,
ADD COLUMN     "stato_scheda" "StatoScheda" NOT NULL DEFAULT 'bozza',
ADD COLUMN     "taglie_disponibili" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "sheet_material_usages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "technical_sheet_id" UUID NOT NULL,
    "material_id" UUID,
    "accessory_id" UUID,
    "descrizione" TEXT NOT NULL,
    "unita_misura" TEXT NOT NULL,
    "quantita_suggerita" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "quantita_confermata" DECIMAL(12,4),
    "percentuale_scarto" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "supplier_id" UUID,
    "fatture_collegate_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "costo_unitario" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "fonte_costo" "CostSource" NOT NULL DEFAULT 'manuale',
    "fattura_costo_id" UUID,
    "costo_unitario_aggiornato_il" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ordine" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sheet_material_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_cost_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "technical_sheet_id" UUID NOT NULL,
    "voce" "SheetCostVoce" NOT NULL,
    "label" TEXT NOT NULL,
    "importo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "kind" "CostKind" NOT NULL DEFAULT 'diretto',
    "fonte" "CostSource" NOT NULL DEFAULT 'manuale',
    "fattura_id" UUID,
    "ammortizzabile" BOOLEAN NOT NULL DEFAULT false,
    "quantita_prevista" INTEGER,
    "ordine" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sheet_cost_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_sheet_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "technical_sheet_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "data_url" TEXT NOT NULL,
    "caricata_il" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technical_sheet_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_cost_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "technical_sheet_id" UUID NOT NULL,
    "registrato_il" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT NOT NULL,
    "costo_materiali_unitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costo_totale_unitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prezzo_break_even" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sheet_cost_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sheet_material_usages_technical_sheet_id_idx" ON "sheet_material_usages"("technical_sheet_id");

-- CreateIndex
CREATE INDEX "sheet_cost_lines_technical_sheet_id_idx" ON "sheet_cost_lines"("technical_sheet_id");

-- CreateIndex
CREATE INDEX "technical_sheet_photos_technical_sheet_id_idx" ON "technical_sheet_photos"("technical_sheet_id");

-- CreateIndex
CREATE INDEX "sheet_cost_snapshots_technical_sheet_id_idx" ON "sheet_cost_snapshots"("technical_sheet_id");

-- AddForeignKey
ALTER TABLE "technical_sheets" ADD CONSTRAINT "technical_sheets_fornitore_laboratorio_id_fkey" FOREIGN KEY ("fornitore_laboratorio_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_material_usages" ADD CONSTRAINT "sheet_material_usages_technical_sheet_id_fkey" FOREIGN KEY ("technical_sheet_id") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_material_usages" ADD CONSTRAINT "sheet_material_usages_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_material_usages" ADD CONSTRAINT "sheet_material_usages_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_material_usages" ADD CONSTRAINT "sheet_material_usages_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_cost_lines" ADD CONSTRAINT "sheet_cost_lines_technical_sheet_id_fkey" FOREIGN KEY ("technical_sheet_id") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_photos" ADD CONSTRAINT "technical_sheet_photos_technical_sheet_id_fkey" FOREIGN KEY ("technical_sheet_id") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_cost_snapshots" ADD CONSTRAINT "sheet_cost_snapshots_technical_sheet_id_fkey" FOREIGN KEY ("technical_sheet_id") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
