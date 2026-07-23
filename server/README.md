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

- **Auth**: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` — sessioni
  server-side revocabili in cookie httpOnly firmato (A2), hashing bcrypt.
- **RBAC**: `core/permissions.ts` è il porting 1:1 di `src/lib/permissions.ts`; le guard
  `requireModule`/`requireEdit` applicano la matrice per-endpoint (server-side).
- **Prodotti**: `GET/POST/PATCH /api/products` con validazione Zod e activity log (FR-18).
- **Margini**: `GET /api/margins/quota`, `GET /api/margins/products/:id` — porting di
  `src/lib/margins.ts` (quota DEC-022 + costo diretto da scheda tecnica).
- **Health**: `GET /health`.

## Cosa manca (moduli da completare in Fase 12, stessa struttura)

materiali/accessori, magazzino, produzione (gating FR-05/07), fatture/costi/scadenze,
fornitori + bozze email (Gmail), clienti + showroom, ordini, chiusura di cassa (FR-41),
AI assistant, activity-log read, impostazioni, sync Shopify, job schedulati. Ogni modulo
segue lo schema `modules/<dominio>/{service,routes}.ts` già usato per prodotti e margini.
