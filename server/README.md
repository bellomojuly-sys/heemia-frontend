# Heemia — Backend API (Fase 12)

Backend del gestionale Heemia. Stack: **Fastify + Prisma + PostgreSQL** (Node.js/TypeScript),
come da `System_Architecture` (A1-A6, DEC-027) e `Technical_Specification` §3. Vedi
`08_AI_Workflow/Claude_Code_Instructions.md` per il dettaglio di fase.

## Avvio locale

```bash
# 1. dalla cartella 04_Claude_Code: avvia Postgres
docker compose up -d
# 2. dentro server/
cd server
cp .env.example .env      # compila SESSION_SECRET (openssl rand -hex 32) e SEED_ADMIN_PASSWORD
npm install
npm run prisma:generate
npm run prisma:migrate     # crea le tabelle da schema.prisma
npm run db:seed            # settings + admin + prodotto demo
npm run dev                # API su http://localhost:3001
```

## Cosa c'è (foundation + prima vertical slice)

- **Auth**: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me` — sessioni
  server-side revocabili in cookie httpOnly firmato (A2), hashing bcrypt.
- **RBAC**: `core/permissions.ts` è il porting 1:1 di `src/lib/permissions.ts`; le guard
  `requireModule`/`requireEdit` applicano la matrice per-endpoint (server-side).
- **Prodotti**: `GET/POST/PATCH /api/v1/products` con validazione Zod e activity log (FR-18).
- **Margini**: `GET /api/v1/margins/quota`, `GET /api/v1/margins/products/:id` — porting di
  `src/lib/margins.ts` (quota DEC-022 + costo diretto da scheda tecnica).
- **Materiali** (FR-04): `GET/POST /api/v1/materials`, `GET/PATCH /api/v1/materials/:id`,
  `POST /api/v1/materials/:id/consume`; stessa serie su `/api/v1/accessories`.
  Stato scorte derivato (esaurito / sotto_soglia / disponibile), `da_verificare` resta manuale.
- **Alert scorte** (FR-05): `GET /api/v1/stock-alerts`.
- **Produzione** (FR-05/07): `GET /api/v1/production`, `GET /api/v1/production/:productId`,
  `GET /api/v1/production/:productId/check`, `POST /api/v1/production/:productId/advance`,
  `PATCH /api/v1/production/steps/:stepId/block`.
- **Health**: `GET /health`.

## Cosa manca (moduli da completare in Fase 12, stessa struttura)

fatture/costi/scadenze,
fornitori + bozze email (Gmail), clienti + showroom, ordini, chiusura di cassa (FR-41),
AI assistant, activity-log read, impostazioni, sync Shopify, job schedulati. Ogni modulo
segue lo schema `modules/<dominio>/{service,routes}.ts` già usato per prodotti e margini.
