-- L'accessorio che va su OGNI capo (Giulia, 2026-09-09).
--
-- «Ogni capo usa cartellini e velina, sempre che sia ordinato in showroom o online». I
-- cartellini pero' non sono tutti uguali (standard e Aurea 0,60, 10.01 0,80): quale va su
-- quale capo lo sceglie chi compila i costi. La velina invece e' una sola e ci va sempre.
--
-- Perche' una colonna e non il nome scritto nel codice: e' la stessa ragione di
-- `destinazione` (DEC-067). Riconoscere la velina con un confronto su «velina» funziona
-- finche' nessuno la rinomina, e il giorno che succede il costo sparisce dalle schede senza
-- che nessun controllo se ne accorga. La regola vive nel dato, dove si vede e si cambia.
ALTER TABLE "accessories"
  ADD COLUMN "sempre_incluso" BOOLEAN NOT NULL DEFAULT false;

-- La velina del censimento (ACC-114, categoria Cartotecnica). Il filtro su `destinazione`
-- evita di marcare per sbaglio un accessorio che sta dentro il capo.
UPDATE "accessories"
   SET "sempre_incluso" = true
 WHERE "destinazione" = 'packaging'
   AND lower("nome") LIKE 'velina%';
