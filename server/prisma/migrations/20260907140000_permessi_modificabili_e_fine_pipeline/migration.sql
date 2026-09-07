-- Fine della pipeline, permessi modificabili, nota sui costi fissi (2026-09-07).
--
-- Tre cambiamenti, nessuna riga cancellata e nessun valore riscritto se non per rinomina.

-- 1. Via la fase «In vendita».
--    Essere in vendita non e' una lavorazione: e' il risultato di giacenza piu' attributi
--    commerciali (stato_pubblicazione_shopify, disponibilita_online, visibile_showroom).
--    Il valore viene RINOMINATO, non cancellato: i 93 capi del censimento e le fasi gia'
--    registrate restano esattamente dove sono, e l'operazione e' reversibile con la stessa
--    riga al contrario. `completato` dice una cosa sola e vera: la produzione e' finita,
--    il capo e' uscito dalla pipeline ed e' entrato nello stock.
ALTER TYPE "ProductStage" RENAME VALUE 'in_vendita' TO 'completato';

-- 2. Nota di origine sulle voci di costo fisso.
--    Serve a distinguere una spesa ricorrente da un acquisto una tantum: senza, i due
--    piedini e la placca aghi peserebbero ogni anno sulla quota per capo senza che si
--    veda perche'. Il nome diventa unico perche' l'import dal censimento riconosce una
--    voce dal nome: senza vincolo, rilanciarlo creerebbe doppioni.
ALTER TABLE "fixed_cost_items" ADD COLUMN "nota" TEXT;

-- I doppioni eventualmente gia' presenti vanno fusi PRIMA del vincolo, altrimenti la
-- migrazione fallisce a meta'. Si tiene la riga piu' vecchia (la prima inserita) e si
-- sommano gli importi delle omonime: nessun importo sparisce.
UPDATE "fixed_cost_items" f
SET "importo_annuo" = t.totale
FROM (
  SELECT MIN("created_at") AS prima, "nome", SUM("importo_annuo") AS totale
  FROM "fixed_cost_items" GROUP BY "nome" HAVING COUNT(*) > 1
) t
WHERE f."nome" = t."nome" AND f."created_at" = t.prima;

DELETE FROM "fixed_cost_items" f
WHERE EXISTS (
  SELECT 1 FROM "fixed_cost_items" g
  WHERE g."nome" = f."nome" AND g."created_at" < f."created_at"
);

CREATE UNIQUE INDEX "fixed_cost_items_nome_key" ON "fixed_cost_items"("nome");

-- 3. Matrice permessi ruolo x modulo, con quattro azioni separate.
--    La tabella nasce VUOTA di proposito: finche' una riga non c'e', vale il valore
--    predefinito scritto in core/permissions.ts. Cosi' un modulo nuovo funziona il giorno
--    in cui viene scritto, e questa migrazione non fotografa una matrice che cambiera'.
CREATE TABLE "role_permissions" (
    "role" "Role" NOT NULL,
    "module_key" TEXT NOT NULL,
    "puo_vedere" BOOLEAN NOT NULL DEFAULT false,
    "puo_creare" BOOLEAN NOT NULL DEFAULT false,
    "puo_modificare" BOOLEAN NOT NULL DEFAULT false,
    "puo_eliminare" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role","module_key")
);
