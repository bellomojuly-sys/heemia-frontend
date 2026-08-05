-- CreateEnum
CREATE TYPE "InventoryLocationType" AS ENUM ('magazzino', 'laboratorio', 'showroom', 'resi', 'produzione_esterna');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('carico', 'scarico', 'trasferimento', 'rettifica');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('in_corso', 'completato', 'completato_con_errori', 'fallito');

-- CreateTable
CREATE TABLE "inventory_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codice" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "InventoryLocationType" NOT NULL,
    "indirizzo" TEXT,
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantita_disponibile" INTEGER NOT NULL DEFAULT 0,
    "quantita_riservata" INTEGER NOT NULL DEFAULT 0,
    "quantita_in_lavorazione" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variant_id" UUID NOT NULL,
    "location_from_id" UUID,
    "location_to_id" UUID,
    "created_by" UUID,
    "tipo" "InventoryMovementType" NOT NULL,
    "quantita" INTEGER NOT NULL,
    "riferimento_tipo" TEXT,
    "riferimento_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "import_batch_id" UUID,
    "data_snapshot" DATE NOT NULL,
    "fonte" TEXT,
    "chiuso" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_snapshot_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "snapshot_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantita" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_snapshot_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "codice_fornitore" TEXT,
    "prezzo_unitario" DECIMAL(10,2) NOT NULL,
    "unita_misura" "MaterialUnita" NOT NULL,
    "quantita_minima" DECIMAL(10,2),
    "lead_time_giorni" INTEGER,
    "valido_dal" DATE NOT NULL,
    "valido_al" DATE,
    "preferito" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "supplier_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_accessories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID NOT NULL,
    "accessory_id" UUID NOT NULL,
    "codice_fornitore" TEXT,
    "prezzo_unitario" DECIMAL(10,2) NOT NULL,
    "unita_misura" "AccessoryUnita" NOT NULL,
    "quantita_minima" DECIMAL(10,2),
    "lead_time_giorni" INTEGER,
    "valido_dal" DATE NOT NULL,
    "valido_al" DATE,
    "preferito" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "supplier_accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_service_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID NOT NULL,
    "categoria_servizio" TEXT NOT NULL,
    "nome_servizio" TEXT NOT NULL,
    "prezzo_minimo" DECIMAL(10,2),
    "prezzo_massimo" DECIMAL(10,2),
    "unita_misura" TEXT,
    "valido_dal" DATE NOT NULL,
    "valido_al" DATE,
    "note" TEXT,

    CONSTRAINT "supplier_service_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "nome_file" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "tipo_importazione" TEXT NOT NULL,
    "stato" "ImportStatus" NOT NULL DEFAULT 'in_corso',
    "righe_totali" INTEGER NOT NULL DEFAULT 0,
    "righe_importate" INTEGER NOT NULL DEFAULT 0,
    "numero_errori" INTEGER NOT NULL DEFAULT 0,
    "numero_warning" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_errors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "import_batch_id" UUID NOT NULL,
    "severity" TEXT NOT NULL,
    "numero_riga" INTEGER,
    "tabella_target" TEXT,
    "campo" TEXT,
    "codice_record" TEXT,
    "messaggio" TEXT NOT NULL,
    "valore_originale" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_locations_codice_key" ON "inventory_locations"("codice");

-- CreateIndex
CREATE INDEX "inventory_balances_location_id_idx" ON "inventory_balances"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_balances_variant_id_location_id_key" ON "inventory_balances"("variant_id", "location_id");

-- CreateIndex
CREATE INDEX "inventory_movements_variant_id_idx" ON "inventory_movements"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_snapshot_items_snapshot_id_variant_id_location_id_key" ON "inventory_snapshot_items"("snapshot_id", "variant_id", "location_id");

-- CreateIndex
CREATE INDEX "supplier_materials_material_id_idx" ON "supplier_materials"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_materials_supplier_id_material_id_valido_dal_key" ON "supplier_materials"("supplier_id", "material_id", "valido_dal");

-- CreateIndex
CREATE INDEX "supplier_accessories_accessory_id_idx" ON "supplier_accessories"("accessory_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_accessories_supplier_id_accessory_id_valido_dal_key" ON "supplier_accessories"("supplier_id", "accessory_id", "valido_dal");

-- CreateIndex
CREATE INDEX "supplier_service_prices_supplier_id_idx" ON "supplier_service_prices"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_file_hash_key" ON "import_batches"("file_hash");

-- CreateIndex
CREATE INDEX "import_batches_user_id_idx" ON "import_batches"("user_id");

-- CreateIndex
CREATE INDEX "import_errors_import_batch_id_idx" ON "import_errors"("import_batch_id");

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_location_from_id_fkey" FOREIGN KEY ("location_from_id") REFERENCES "inventory_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_location_to_id_fkey" FOREIGN KEY ("location_to_id") REFERENCES "inventory_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshot_items" ADD CONSTRAINT "inventory_snapshot_items_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "inventory_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshot_items" ADD CONSTRAINT "inventory_snapshot_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshot_items" ADD CONSTRAINT "inventory_snapshot_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_materials" ADD CONSTRAINT "supplier_materials_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_materials" ADD CONSTRAINT "supplier_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_accessories" ADD CONSTRAINT "supplier_accessories_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_accessories" ADD CONSTRAINT "supplier_accessories_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_service_prices" ADD CONSTRAINT "supplier_service_prices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
