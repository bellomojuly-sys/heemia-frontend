-- Import delle fatture elettroniche ricevute (FR-19/FR-20).
--
-- partita_iva sui fornitori: è la chiave con cui si riconosce il fornitore dentro una
-- fattura elettronica, dove la denominazione è scritta in modi sempre diversi.
-- origine_xml sulle fatture: dice da quale file è arrivata la fattura, così si distingue
-- a colpo d'occhio ciò che viene dal canale fiscale da ciò che è stato scritto a mano.
--
-- L'indice su (fornitore, numero, data) serve al controllo dei doppioni fatto dall'import.
-- È volutamente un indice e NON un vincolo di unicità: le fatture già presenti sono state
-- inserite a mano e potrebbero contenere doppioni o dati incompleti, e un vincolo
-- bloccherebbe la migrazione su dati che non si possono correggere da qui.

ALTER TABLE "invoices" ADD COLUMN "origine_xml" TEXT;

ALTER TABLE "suppliers" ADD COLUMN "partita_iva" TEXT;

CREATE INDEX "invoices_fornitore_id_numero_data_idx" ON "invoices"("fornitore_id", "numero", "data");
