-- Via il concetto di stagione (decisione di Giulia, 2026-08-13).
--
-- I capi non si organizzano piu' per stagione: la colonna spariva comunque
-- dall'interfaccia, e tenerla a database avrebbe lasciato in giro un dato che nessuno
-- aggiorna piu' — il tipo di residuo che fra un anno qualcuno rilegge come se fosse vero.
-- Il censimento perde la colonna corrispondente nello stesso momento.
--
-- Non e' reversibile: i valori presenti (P/E, A/I) vengono persi. In produzione la
-- colonna non e' mai stata popolata, perche' i capi reali non sono ancora stati importati.
ALTER TABLE "products" DROP COLUMN IF EXISTS "stagione";
ALTER TABLE "materials" DROP COLUMN IF EXISTS "stagione";
