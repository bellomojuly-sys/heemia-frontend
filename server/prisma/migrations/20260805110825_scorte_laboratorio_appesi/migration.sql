-- CreateEnum
CREATE TYPE "CommitmentStato" AS ENUM ('impegnato', 'consumato', 'rilasciato');

-- AlterTable
ALTER TABLE "inventory_records" ADD COLUMN     "soglia_minima_laboratorio" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "stock_commitments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variant_id" UUID NOT NULL,
    "product_id" UUID,
    "step_id" UUID,
    "quantita" INTEGER NOT NULL,
    "stato" "CommitmentStato" NOT NULL DEFAULT 'impegnato',
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chiuso_il" TIMESTAMPTZ(6),

    CONSTRAINT "stock_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_commitments_variant_id_idx" ON "stock_commitments"("variant_id");

-- CreateIndex
CREATE INDEX "stock_commitments_stato_idx" ON "stock_commitments"("stato");

-- AddForeignKey
ALTER TABLE "stock_commitments" ADD CONSTRAINT "stock_commitments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_commitments" ADD CONSTRAINT "stock_commitments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_commitments" ADD CONSTRAINT "stock_commitments_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "production_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_commitments" ADD CONSTRAINT "stock_commitments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
