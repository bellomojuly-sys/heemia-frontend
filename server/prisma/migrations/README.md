# Migrazioni Prisma

Da ora lo schema del DB è versionato qui: ogni cartella `TIMESTAMP_nome/migration.sql` è una
migrazione immutabile committata nel repo. Non modificare gli SQL già committati: per ogni
cambiamento di `schema.prisma` si crea una NUOVA migrazione con `npm run prisma:migrate`.

La migrazione `20260722204300_init` è la **baseline**: rappresenta l'intero schema corrente
(tutte le tabelle + gli indici su `products.stato/linea`, `materials.stato`, `accessories.stato`).

## Applicare le migrazioni

### DB nuovo / vuoto (es. staging, prod al primo deploy, CI)
```bash
npm run prisma:deploy        # = prisma migrate deploy
```

### DB dev già esistente (tabelle già create a mano prima del versionamento)
Il DB ha già le tabelle ma non la baseline registrata: va marcata come "già applicata"
(baseline), senza rieseguirla, poi si applicano SOLO le migrazioni successive.
```bash
npx prisma migrate resolve --applied 20260722204300_init
# gli indici nuovi NON sono ancora nel DB dev: creali una tantum, oppure ricrea il DB.
# Opzione A (mantieni i dati): applica a mano gli indici della baseline (righe CREATE INDEX ...idx).
# Opzione B (dev usa e getta): droppa e ricrea il DB, poi `npm run prisma:deploy && npm run db:seed`.
```

Verifica stato in qualsiasi momento con `npx prisma migrate status`.
