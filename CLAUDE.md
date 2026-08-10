# Heemia — istruzioni operative per Claude Code

Questo file viene caricato automaticamente quando Claude Code lavora nel repository. La governance completa è in `../08_AI_Workflow/CLAUDE.md`; il vault Obsidian resta la fonte approvata per decisioni, requisiti e stato del progetto.

## Prima di modificare

1. Confermare il repository con `git rev-parse --show-toplevel`.
2. Leggere `git status --short` e preservare tutte le modifiche già presenti.
3. Leggere `../00_index/home.md`, `Project_Status.md`, `Open_Questions.md` e `Roadmap.md`.
4. Cercare e leggere in `../00_index/Decision_Log.md` le decisioni pertinenti, controllando se sono state superate.
5. Leggere le specifiche funzionali, tecniche, di sicurezza e UI collegate al lavoro richiesto.

## Regole vincolanti

- Architettura: `Frontend React -> API Fastify -> Prisma -> PostgreSQL`. Il frontend non accede direttamente al database.
- PostgreSQL è autorevole per i dati dell'app. OpenAI, Gmail, Shopify, Drive e Analytics sono integrazioni opzionali: la loro assenza non deve rompere la persistenza centrale.
- Non inventare logiche aziendali, permessi, transizioni o strutture dati. Un punto materialmente ambiguo va registrato in `../00_index/Open_Questions.md` e sospeso.
- Il server decide autorizzazioni e regole. Il client può nascondere o spiegare, ma non sostituisce i controlli server-side.
- Attendere sempre il successo dell'API prima di aggiornare l'interfaccia come se un salvataggio fosse concluso.
- Verificare i dati persistenti rileggendoli dal backend e, quando applicabile, ricaricando il browser. Form chiuso o stato locale non sono una prova.
- Mantenere atomiche in una transazione Prisma le modifiche che devono riuscire insieme, incluse collezioni figlie e movimenti collegati.
- Usare migrazioni Prisma versionate e `prisma migrate deploy` in produzione. Non riscrivere migrazioni pubblicate e non usare `db push` per il deploy.
- Tenere allineati `server/src/core/permissions.ts` e `src/lib/permissions.ts`.
- Mai scrivere o mostrare credenziali, token, password, cookie o `DATABASE_URL`. I segreti restano nei file locali esclusi da Git o nelle variabili Render.
- Un'azione esterna non è completata finché il servizio esterno non conferma il successo.
- Non cancellare, ripristinare o includere modifiche estranee. Se il worktree è sporco, delimitare esplicitamente i file di propria competenza.
- Gli hook condivisi in `.claude/settings.json` proteggono file sensibili e selezionano i controlli in base allo scope. Non disabilitarli o modificare la baseline per aggirare un blocco: correggere la causa o spiegarla a Giulia.
- Niente commit o push intermedi. Consolidare e verificare tutto; pubblicare su GitHub solo dopo conferma di Giulia.
- Dopo un deploy Render verificare che `/health` esponga il commit GitHub atteso.

## Controlli di riferimento

- Frontend: `npm run lint` e `npm run build`.
- Backend: `npm run typecheck` e `npm test`.
- Prisma: `npx prisma validate` e controllo della migrazione prevista.
- Generale: `git diff --check` e revisione del perimetro con `git status --short`.
- Browser: completare login, azione, risposta API, reload e rilettura del dato; un semplice rendering non basta.

## Comunicazione

- Iniziare ogni risposta con `Giulia,`.
- Essere diretti e concreti; per ogni problema indicare file/configurazione ed esempio semplice.
- Separare sempre: verificato, predisposto, dipendente da credenziali, dipendente da una decisione aperta.
