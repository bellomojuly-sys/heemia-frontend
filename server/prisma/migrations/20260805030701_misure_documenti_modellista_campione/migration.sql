-- CreateEnum
CREATE TYPE "PatternDocumentTipo" AS ENUM ('cartamodello', 'scheda_misure', 'revisione_modellista', 'piazzamento', 'documento_taglio', 'altro');

-- CreateEnum
CREATE TYPE "PatternDocumentStato" AS ENUM ('in_attesa', 'approvato', 'rifiutato', 'richiede_revisione');

-- CreateEnum
CREATE TYPE "PatternDocumentNoteTipo" AS ENUM ('commento', 'correzione', 'problema', 'modifica_misure', 'indicazione_taglio', 'approvazione', 'richiesta_nuova_versione');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "campione_approvato_da" UUID,
ADD COLUMN     "campione_approvato_il" TIMESTAMPTZ(6),
ADD COLUMN     "campione_note" TEXT;

-- CreateTable
CREATE TABLE "sheet_measurements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "technical_sheet_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "valore" DECIMAL(8,2),
    "unita" TEXT NOT NULL DEFAULT 'cm',
    "taglia_riferimento" TEXT,
    "tolleranza" TEXT,
    "nota" TEXT,
    "fonte" "CostSource" NOT NULL DEFAULT 'manuale',
    "ordine" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sheet_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "misure" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurement_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "data_url" TEXT NOT NULL,
    "tipologia" "PatternDocumentTipo" NOT NULL,
    "versione" TEXT NOT NULL DEFAULT 'V1',
    "autore" TEXT,
    "stato_approvazione" "PatternDocumentStato" NOT NULL DEFAULT 'in_attesa',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pattern_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_document_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "testo" TEXT NOT NULL,
    "tipo" "PatternDocumentNoteTipo" NOT NULL DEFAULT 'commento',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pattern_document_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sheet_measurements_technical_sheet_id_idx" ON "sheet_measurements"("technical_sheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_templates_nome_categoria_key" ON "measurement_templates"("nome", "categoria");

-- CreateIndex
CREATE INDEX "pattern_documents_product_id_idx" ON "pattern_documents"("product_id");

-- CreateIndex
CREATE INDEX "pattern_document_notes_document_id_idx" ON "pattern_document_notes"("document_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_campione_approvato_da_fkey" FOREIGN KEY ("campione_approvato_da") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_measurements" ADD CONSTRAINT "sheet_measurements_technical_sheet_id_fkey" FOREIGN KEY ("technical_sheet_id") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_templates" ADD CONSTRAINT "measurement_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_documents" ADD CONSTRAINT "pattern_documents_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_documents" ADD CONSTRAINT "pattern_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_document_notes" ADD CONSTRAINT "pattern_document_notes_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "pattern_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_document_notes" ADD CONSTRAINT "pattern_document_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
