-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'ceo', 'team', 'viewer', 'showroom');

-- CreateEnum
CREATE TYPE "ProductStage" AS ENUM ('idea', 'concept', 'sviluppo_modello', 'scelta_tessuto', 'scelta_accessori', 'prototipo', 'campionario', 'produzione', 'foto_contenuti', 'scheda_ecommerce', 'pubblicato_shopify', 'in_vendita', 'archivio');

-- CreateEnum
CREATE TYPE "Linea" AS ENUM ('tessile', 'maglieria');

-- CreateEnum
CREATE TYPE "BozzaStato" AS ENUM ('bozza', 'approvata');

-- CreateEnum
CREATE TYPE "PubblicazioneShopify" AS ENUM ('non_pubblicato', 'bozza', 'pubblicato');

-- CreateEnum
CREATE TYPE "VariantStato" AS ENUM ('disponibile', 'esaurito', 'low_stock');

-- CreateEnum
CREATE TYPE "IdeaStato" AS ENUM ('nuova', 'in_valutazione', 'promossa');

-- CreateEnum
CREATE TYPE "TsVersion" AS ENUM ('preliminare', 'piazzamento', 'finale');

-- CreateEnum
CREATE TYPE "Difficolta" AS ENUM ('bassa', 'media', 'alta');

-- CreateEnum
CREATE TYPE "MaterialStato" AS ENUM ('disponibile', 'sotto_soglia', 'esaurito', 'da_verificare');

-- CreateEnum
CREATE TYPE "MaterialUnita" AS ENUM ('m', 'kg');

-- CreateEnum
CREATE TYPE "AccessoryUnita" AS ENUM ('cad', 'm');

-- CreateEnum
CREATE TYPE "SupplierCategoria" AS ENUM ('Tessuti', 'Filati', 'Passamaneria', 'Lycra', 'Felpa', 'Asole/Bottoni', 'Fodere', 'Cartellini/Etichette', 'Accessori', 'Zip', 'Bottoni', 'Accessori vari', 'Biglietti', 'Spalline', 'Modellistica/Confezione', 'Modellistica', 'Ricami', 'Smacchinatore', 'Confezione', 'Commercialista', 'Marchi e brevetti', 'Consulenza');

-- CreateEnum
CREATE TYPE "SupplierReqStato" AS ENUM ('bozza_generata', 'in_attesa_approvazione', 'modificata', 'approvata', 'inviata', 'risposta_ricevuta', 'chiusa', 'annullata');

-- CreateEnum
CREATE TYPE "Urgenza" AS ENUM ('bassa', 'media', 'alta');

-- CreateEnum
CREATE TYPE "CategoriaCosto" AS ENUM ('tessuto', 'accessori', 'manodopera', 'packaging', 'spedizione', 'marketing', 'logistica', 'servizi', 'costi_generali');

-- CreateEnum
CREATE TYPE "InvoicePaese" AS ENUM ('IT', 'EU', 'Extra-EU');

-- CreateEnum
CREATE TYPE "InvoicePagamento" AS ENUM ('da_pagare', 'pagata', 'scaduta');

-- CreateEnum
CREATE TYPE "ModalitaAllocazione" AS ENUM ('diretto_prodotto', 'per_categoria', 'per_collezione', 'per_numero_capi', 'per_fatturato', 'per_mese', 'non_allocabile');

-- CreateEnum
CREATE TYPE "TipoScadenza" AS ENUM ('fattura_da_pagare', 'fattura_da_incassare', 'iva', 'contributi', 'fornitore', 'commercialista', 'reminder', 'abbonamento');

-- CreateEnum
CREATE TYPE "DeadlineStato" AS ENUM ('in_arrivo', 'in_ritardo', 'saldata');

-- CreateEnum
CREATE TYPE "TipologiaCliente" AS ENUM ('ecommerce', 'showroom', 'b2b', 'retailer', 'showroom_partner');

-- CreateEnum
CREATE TYPE "OrderCanale" AS ENUM ('shopify', 'fisico');

-- CreateEnum
CREATE TYPE "OrderStato" AS ENUM ('in_lavorazione', 'spedito', 'consegnato', 'annullato');

-- CreateEnum
CREATE TYPE "OrderPriorita" AS ENUM ('normale', 'alta');

-- CreateEnum
CREATE TYPE "InventoryStato" AS ENUM ('disponibile', 'esaurito', 'low_stock');

-- CreateEnum
CREATE TYPE "AiAutore" AS ENUM ('utente', 'assistant');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "password_hash" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'interno',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "chiave" TEXT NOT NULL,
    "valore" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("chiave")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "azione" TEXT NOT NULL,
    "entita" TEXT NOT NULL,
    "entita_id" TEXT,
    "valore_precedente" TEXT,
    "valore_nuovo" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "autore" "AiAutore" NOT NULL,
    "testo" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "categoria" "SupplierCategoria" NOT NULL,
    "citta" TEXT,
    "paese" TEXT NOT NULL DEFAULT 'IT',
    "email" TEXT,
    "referente" TEXT,
    "telefono" TEXT,
    "tempi_medi_consegna_gg" INTEGER,
    "condizioni_pagamento" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "codice_prodotto" TEXT NOT NULL,
    "categoria" TEXT,
    "collezione" TEXT,
    "stagione" TEXT,
    "linea" "Linea" NOT NULL,
    "stato" "ProductStage" NOT NULL DEFAULT 'idea',
    "descrizione_breve" TEXT,
    "descrizione_breve_stato" "BozzaStato" NOT NULL DEFAULT 'bozza',
    "descrizione_ecommerce" TEXT,
    "descrizione_tecnica" TEXT,
    "consigli_cura" TEXT,
    "consigli_cura_stato" "BozzaStato" NOT NULL DEFAULT 'bozza',
    "vestibilita" TEXT,
    "taglie_disponibili" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "colori_disponibili" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "immagini_url" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prezzo_vendita" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prezzo_netto_iva" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prezzo_showroom" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prezzo_consigliato" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stato_pubblicazione_shopify" "PubblicazioneShopify" NOT NULL DEFAULT 'non_pubblicato',
    "disponibilita_online" BOOLEAN NOT NULL DEFAULT false,
    "disponibilita_showroom" BOOLEAN NOT NULL DEFAULT false,
    "visibile_showroom" BOOLEAN NOT NULL DEFAULT false,
    "personalizzabile_su_misura" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_ideas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "concept" TEXT,
    "materiali_stimati" TEXT,
    "quantita_stimate" INTEGER NOT NULL DEFAULT 0,
    "note_creative" TEXT,
    "stato" "IdeaStato" NOT NULL DEFAULT 'nuova',
    "scan_bozzetto_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "taglia" TEXT NOT NULL,
    "colore" TEXT NOT NULL,
    "stock_disponibile" INTEGER NOT NULL DEFAULT 0,
    "stock_riservato" INTEGER NOT NULL DEFAULT 0,
    "immagine_url" TEXT,
    "stato_disponibilita" "VariantStato" NOT NULL DEFAULT 'disponibile',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "supplier_id" UUID,
    "composizione" TEXT,
    "colore" TEXT,
    "altezza_cm" DECIMAL(6,1),
    "prezzo_al_metro" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "metri_acquistati" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "metri_utilizzati" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "data_acquisto" DATE,
    "stagione" TEXT,
    "consigli_lavaggio" TEXT,
    "note_tecniche" TEXT,
    "soglia_minima" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stato" "MaterialStato" NOT NULL DEFAULT 'disponibile',
    "unita_misura" "MaterialUnita" NOT NULL DEFAULT 'm',
    "fattura_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "categoria" TEXT,
    "supplier_id" UUID,
    "quantita_acquistata" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "quantita_utilizzata" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costo_unitario" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "soglia_minima" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stato" "MaterialStato" NOT NULL DEFAULT 'disponibile',
    "unita_misura" "AccessoryUnita" NOT NULL DEFAULT 'cad',
    "fattura_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_materials" (
    "product_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,

    CONSTRAINT "product_materials_pkey" PRIMARY KEY ("product_id","material_id")
);

-- CreateTable
CREATE TABLE "product_accessories" (
    "product_id" UUID NOT NULL,
    "accessory_id" UUID NOT NULL,

    CONSTRAINT "product_accessories_pkey" PRIMARY KEY ("product_id","accessory_id")
);

-- CreateTable
CREATE TABLE "technical_sheets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "versione" "TsVersion" NOT NULL,
    "tessuto_principale_id" UUID,
    "composizione_completa" TEXT,
    "peso_capo_grammi" DECIMAL(8,1),
    "lavorazione" TEXT,
    "trattamenti" TEXT,
    "lavaggio_consigliato" TEXT,
    "note_produzione" TEXT,
    "difficolta_produttiva" "Difficolta" NOT NULL DEFAULT 'media',
    "tempi_stimati_ore" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "costo_manodopera" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costo_tessuto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costo_accessori" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costo_packaging" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "altri_costi_diretti" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "altri_costi_indiretti" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "archiviata" BOOLEAN NOT NULL DEFAULT false,
    "pdf_url" TEXT,
    "pdf_caricato_il" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "technical_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_sheet_materials" (
    "technical_sheet_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,

    CONSTRAINT "technical_sheet_materials_pkey" PRIMARY KEY ("technical_sheet_id","material_id")
);

-- CreateTable
CREATE TABLE "technical_sheet_accessories" (
    "technical_sheet_id" UUID NOT NULL,
    "accessory_id" UUID NOT NULL,

    CONSTRAINT "technical_sheet_accessories_pkey" PRIMARY KEY ("technical_sheet_id","accessory_id")
);

-- CreateTable
CREATE TABLE "production_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "fase" "ProductStage" NOT NULL,
    "responsabile" TEXT,
    "data_inizio" DATE,
    "data_fine" DATE,
    "note" TEXT,
    "bloccata" BOOLEAN NOT NULL DEFAULT false,
    "motivo_blocco" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "production_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "paese" TEXT NOT NULL DEFAULT 'IT',
    "tipologia" "TipologiaCliente" NOT NULL DEFAULT 'ecommerce',
    "valore_totale_acquistato" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "numero_ordini" INTEGER NOT NULL DEFAULT 0,
    "sconto" DECIMAL(5,2),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "fornitore_id" UUID,
    "cliente_id" UUID,
    "paese" "InvoicePaese" NOT NULL DEFAULT 'IT',
    "valuta" TEXT NOT NULL DEFAULT 'EUR',
    "tasso_cambio" DECIMAL(10,4),
    "data_cambio" DATE,
    "imponibile_valuta_originale" DECIMAL(12,2),
    "totale_valuta_originale" DECIMAL(12,2),
    "imponibile" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "iva" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totale" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "categoria_costo" "CategoriaCosto" NOT NULL DEFAULT 'costi_generali',
    "metodo_pagamento" TEXT,
    "stato_pagamento" "InvoicePagamento" NOT NULL DEFAULT 'da_pagare',
    "data_scadenza" DATE,
    "documento_url" TEXT,
    "note_amministrative" TEXT,
    "associata" BOOLEAN NOT NULL DEFAULT false,
    "reverse_charge" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_products" (
    "invoice_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "invoice_products_pkey" PRIMARY KEY ("invoice_id","product_id")
);

-- CreateTable
CREATE TABLE "invoice_materials" (
    "invoice_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,

    CONSTRAINT "invoice_materials_pkey" PRIMARY KEY ("invoice_id","material_id")
);

-- CreateTable
CREATE TABLE "cost_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "modalita" "ModalitaAllocazione" NOT NULL,
    "target_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_cost_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "importo_annuo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fixed_cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "periodo" TEXT NOT NULL,
    "capi_prodotti_annui" INTEGER NOT NULL,
    "totale_costi_fissi" DECIMAL(12,2) NOT NULL,
    "quota_per_capo" DECIMAL(12,2) NOT NULL,
    "nota" TEXT,
    "registrata_il" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadlines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "TipoScadenza" NOT NULL,
    "descrizione" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "importo" DECIMAL(12,2),
    "stato" "DeadlineStato" NOT NULL DEFAULT 'in_arrivo',
    "invoice_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_closures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mese" CHAR(7) NOT NULL,
    "totale_incassato" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "numero_scontrini" INTEGER NOT NULL DEFAULT 0,
    "file_nome" TEXT,
    "riepilogo_ai" TEXT,
    "note" TEXT,
    "importato_il" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID NOT NULL,
    "material_id" UUID,
    "accessory_id" UUID,
    "product_id" UUID,
    "oggetto" TEXT NOT NULL,
    "testo" TEXT NOT NULL,
    "quantita_richiesta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "quantita_disponibile" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "quantita_mancante" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "urgenza" "Urgenza" NOT NULL DEFAULT 'media',
    "deadline_ideale" DATE,
    "stato" "SupplierReqStato" NOT NULL DEFAULT 'bozza_generata',
    "note_tecniche" TEXT,
    "risposta_fornitore" TEXT,
    "approvata_da" UUID,
    "inviata_il" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supplier_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" TEXT NOT NULL,
    "customer_id" UUID,
    "canale" "OrderCanale" NOT NULL,
    "stato" "OrderStato" NOT NULL DEFAULT 'in_lavorazione',
    "priorita" "OrderPriorita" NOT NULL DEFAULT 'normale',
    "data" DATE NOT NULL,
    "totale" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "variant_id" UUID,
    "quantita" INTEGER NOT NULL DEFAULT 1,
    "prezzo_unitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "su_misura" BOOLEAN NOT NULL DEFAULT false,
    "materiale_scelto_id" UUID,
    "taglia_scelta" TEXT,
    "misure" JSONB,
    "note_su_misura" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variant_id" UUID NOT NULL,
    "qta_magazzino" INTEGER NOT NULL DEFAULT 0,
    "qta_laboratorio" INTEGER NOT NULL DEFAULT 0,
    "qta_riservata" INTEGER NOT NULL DEFAULT 0,
    "qta_venduta" INTEGER NOT NULL DEFAULT 0,
    "soglia_minima" INTEGER NOT NULL DEFAULT 0,
    "stato" "InventoryStato" NOT NULL DEFAULT 'disponibile',
    "stock_shopify" INTEGER NOT NULL DEFAULT 0,
    "divergenza_shopify" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "products_codice_prodotto_key" ON "products"("codice_prodotto");

-- CreateIndex
CREATE INDEX "products_stato_idx" ON "products"("stato");

-- CreateIndex
CREATE INDEX "products_linea_idx" ON "products"("linea");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "materials_codice_key" ON "materials"("codice");

-- CreateIndex
CREATE INDEX "materials_supplier_id_idx" ON "materials"("supplier_id");

-- CreateIndex
CREATE INDEX "materials_stato_idx" ON "materials"("stato");

-- CreateIndex
CREATE UNIQUE INDEX "accessories_codice_key" ON "accessories"("codice");

-- CreateIndex
CREATE INDEX "accessories_supplier_id_idx" ON "accessories"("supplier_id");

-- CreateIndex
CREATE INDEX "accessories_stato_idx" ON "accessories"("stato");

-- CreateIndex
CREATE INDEX "technical_sheets_product_id_idx" ON "technical_sheets"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "technical_sheets_product_id_versione_key" ON "technical_sheets"("product_id", "versione");

-- CreateIndex
CREATE INDEX "production_steps_product_id_idx" ON "production_steps"("product_id");

-- CreateIndex
CREATE INDEX "invoices_fornitore_id_idx" ON "invoices"("fornitore_id");

-- CreateIndex
CREATE INDEX "invoices_cliente_id_idx" ON "invoices"("cliente_id");

-- CreateIndex
CREATE INDEX "invoices_data_scadenza_idx" ON "invoices"("data_scadenza");

-- CreateIndex
CREATE INDEX "deadlines_data_idx" ON "deadlines"("data");

-- CreateIndex
CREATE UNIQUE INDEX "cash_closures_mese_key" ON "cash_closures"("mese");

-- CreateIndex
CREATE INDEX "supplier_requests_supplier_id_idx" ON "supplier_requests"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_numero_key" ON "orders"("numero");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_records_variant_id_key" ON "inventory_records"("variant_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_fattura_id_fkey" FOREIGN KEY ("fattura_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "accessories_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "accessories_fattura_id_fkey" FOREIGN KEY ("fattura_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_materials" ADD CONSTRAINT "product_materials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_materials" ADD CONSTRAINT "product_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_accessories" ADD CONSTRAINT "product_accessories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_accessories" ADD CONSTRAINT "product_accessories_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheets" ADD CONSTRAINT "technical_sheets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheets" ADD CONSTRAINT "technical_sheets_tessuto_principale_id_fkey" FOREIGN KEY ("tessuto_principale_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_materials" ADD CONSTRAINT "technical_sheet_materials_technical_sheet_id_fkey" FOREIGN KEY ("technical_sheet_id") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_materials" ADD CONSTRAINT "technical_sheet_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_accessories" ADD CONSTRAINT "technical_sheet_accessories_technical_sheet_id_fkey" FOREIGN KEY ("technical_sheet_id") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_accessories" ADD CONSTRAINT "technical_sheet_accessories_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_steps" ADD CONSTRAINT "production_steps_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_fornitore_id_fkey" FOREIGN KEY ("fornitore_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_products" ADD CONSTRAINT "invoice_products_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_products" ADD CONSTRAINT "invoice_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_materials" ADD CONSTRAINT "invoice_materials_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_materials" ADD CONSTRAINT "invoice_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_allocations" ADD CONSTRAINT "cost_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_requests" ADD CONSTRAINT "supplier_requests_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_requests" ADD CONSTRAINT "supplier_requests_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_requests" ADD CONSTRAINT "supplier_requests_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_requests" ADD CONSTRAINT "supplier_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_requests" ADD CONSTRAINT "supplier_requests_approvata_da_fkey" FOREIGN KEY ("approvata_da") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_materiale_scelto_id_fkey" FOREIGN KEY ("materiale_scelto_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_records" ADD CONSTRAINT "inventory_records_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

