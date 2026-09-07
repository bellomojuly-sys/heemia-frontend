-- Tessuto e composizione sul capo (richiesta di Giulia, 2026-09-07).
--
-- Il censimento ha sempre avuto il tessuto di ogni capo, ma nel database non c'era dove
-- metterlo: restava nel CSV. Serve, perche' e' la chiave da cui si ricavano composizione e
-- consigli di cura secondo la tabella "CONSIGLI DEL TEAM" gia' approvata dall'azienda.
--
-- Due colonne, entrambe facoltative e senza valore predefinito: nessun capo esistente
-- cambia, e chi non le compila non se ne accorge.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tessuto" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "composizione" TEXT;
