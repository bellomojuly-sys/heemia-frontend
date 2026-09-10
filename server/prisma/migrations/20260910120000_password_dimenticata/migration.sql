-- «Password dimenticata»: chi non ricorda la password se la reimposta da solo,
-- senza dover chiedere a un amministratore (DEC-071, 2026-09-10).
--
-- La tabella conserva l'IMPRONTA del token, non il token: chi legge questa tabella non
-- trova niente di riutilizzabile, come per le password. Il token in chiaro esiste una
-- volta sola, nel link spedito per email.
--
-- `scade_il` e `usato_il` sono le due condizioni che rendono un link innocuo dopo poco:
-- un'ora di vita e un solo uso. Una richiesta lasciata a metà scade da sé.
CREATE TABLE "password_reset_tokens" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "scade_il"   TIMESTAMPTZ(6) NOT NULL,
  "usato_il"   TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- Eliminando un utente spariscono anche le sue richieste in sospeso: un link vivo verso
-- un account che non c'è più non deve restare in giro.
ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
