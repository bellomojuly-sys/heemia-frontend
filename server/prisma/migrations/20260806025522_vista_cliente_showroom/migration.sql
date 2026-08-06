-- CreateEnum
CREATE TYPE "ShowroomRequestTipo" AS ENUM ('personalizzazione', 'informazioni');

-- CreateEnum
CREATE TYPE "StatoRichiestaShowroom" AS ENUM ('nuova_richiesta', 'da_contattare', 'appuntamento_fissato', 'misure_raccolte', 'preventivo_inviato', 'confermato', 'in_produzione', 'pronto', 'consegnato', 'annullato');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "cognome" TEXT,
ADD COLUMN     "consenso_marketing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consenso_privacy_il" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "tempi_realizzazione" TEXT;

-- CreateTable
CREATE TABLE "showroom_visits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "consenso_privacy" BOOLEAN NOT NULL DEFAULT false,
    "consenso_marketing" BOOLEAN NOT NULL DEFAULT false,
    "informativa_versione" TEXT NOT NULL,
    "iniziata_il" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_attivita_il" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "showroom_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showroom_product_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "visualizzazioni" INTEGER NOT NULL DEFAULT 1,
    "ultima_vista_il" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "showroom_product_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showroom_favorites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "visit_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "showroom_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showroom_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "tipo" "ShowroomRequestTipo" NOT NULL DEFAULT 'personalizzazione',
    "stato" "StatoRichiestaShowroom" NOT NULL DEFAULT 'nuova_richiesta',
    "customer_id" UUID NOT NULL,
    "product_id" UUID,
    "visit_id" UUID,
    "taglia_base" TEXT,
    "colore_desiderato" TEXT,
    "lunghezza" TEXT,
    "modifiche" TEXT,
    "note" TEXT,
    "misure" JSONB,
    "data_desiderata" DATE,
    "note_interne" TEXT,
    "preventivo_importo" DECIMAL(12,2),
    "preventivo_inviato_il" TIMESTAMPTZ(6),
    "appuntamento_il" TIMESTAMPTZ(6),
    "order_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "showroom_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showroom_request_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "data_url" TEXT NOT NULL,
    "caricata_il" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "showroom_request_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "showroom_visits_customer_id_idx" ON "showroom_visits"("customer_id");

-- CreateIndex
CREATE INDEX "showroom_visits_iniziata_il_idx" ON "showroom_visits"("iniziata_il");

-- CreateIndex
CREATE INDEX "showroom_product_views_product_id_idx" ON "showroom_product_views"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "showroom_product_views_visit_id_product_id_key" ON "showroom_product_views"("visit_id", "product_id");

-- CreateIndex
CREATE INDEX "showroom_favorites_product_id_idx" ON "showroom_favorites"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "showroom_favorites_customer_id_product_id_key" ON "showroom_favorites"("customer_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "showroom_requests_numero_key" ON "showroom_requests"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "showroom_requests_order_id_key" ON "showroom_requests"("order_id");

-- CreateIndex
CREATE INDEX "showroom_requests_customer_id_idx" ON "showroom_requests"("customer_id");

-- CreateIndex
CREATE INDEX "showroom_requests_product_id_idx" ON "showroom_requests"("product_id");

-- CreateIndex
CREATE INDEX "showroom_requests_stato_idx" ON "showroom_requests"("stato");

-- CreateIndex
CREATE INDEX "showroom_request_images_request_id_idx" ON "showroom_request_images"("request_id");

-- AddForeignKey
ALTER TABLE "showroom_visits" ADD CONSTRAINT "showroom_visits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_product_views" ADD CONSTRAINT "showroom_product_views_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "showroom_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_product_views" ADD CONSTRAINT "showroom_product_views_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_favorites" ADD CONSTRAINT "showroom_favorites_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_favorites" ADD CONSTRAINT "showroom_favorites_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_favorites" ADD CONSTRAINT "showroom_favorites_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "showroom_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_requests" ADD CONSTRAINT "showroom_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_requests" ADD CONSTRAINT "showroom_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_requests" ADD CONSTRAINT "showroom_requests_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "showroom_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_requests" ADD CONSTRAINT "showroom_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_request_images" ADD CONSTRAINT "showroom_request_images_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "showroom_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
