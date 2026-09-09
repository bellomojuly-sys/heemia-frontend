-- Accessori: dentro il capo o intorno al capo (Giulia, 2026-09-09).
--
-- La scheda tecnica tiene gia' separati `costo_accessori` e `costo_packaging`, ma
-- l'accessorio non sapeva dire a quale delle due appartiene: la distinzione viveva solo
-- nella testa di chi compilava. Questa colonna la scrive.
--
-- Il default e' `capo`: e' il caso piu' frequente (14 accessori su 19 nel censimento) e
-- sbagliare verso `packaging` gonfierebbe una voce che serve a decidere i prezzi.
CREATE TYPE "AccessoryDestinazione" AS ENUM ('capo', 'packaging');

ALTER TABLE "accessories"
  ADD COLUMN "destinazione" "AccessoryDestinazione" NOT NULL DEFAULT 'capo';

-- Le righe gia' presenti si classificano dalla categoria del censimento: "Packaging" e
-- "Cartotecnica" (la velina) sono le uniche che stanno intorno al capo e non addosso.
UPDATE "accessories"
   SET "destinazione" = 'packaging'
 WHERE lower(coalesce("categoria", '')) IN ('packaging', 'cartotecnica');
