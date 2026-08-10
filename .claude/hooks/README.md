# Hook condivisi Heemia

Questi hook sono caricati da `.claude/settings.json` e non contengono credenziali.

## Flusso

1. `capture-baseline.mjs` registra in una directory temporanea l'impronta dei file già modificati all'avvio della sessione.
2. `protect-files.mjs` blocca scritture dirette su `.env`, `.git`, lockfile e migrazioni Prisma già versionate. Una nuova migrazione resta consentita; i lockfile possono cambiare attraverso il package manager.
3. `verify-scope.mjs` confronta il worktree con l'ultima impronta verificata e avvia solo i controlli pertinenti.

Lo stato temporaneo contiene percorsi e hash, non il contenuto dei file, e vive in `${TMPDIR}/heemia-claude-hooks/` con permessi limitati all'utente.

## Matrice dei controlli

| File cambiati | Controlli |
|---|---|
| Documentazione/configurazioni non applicative | whitespace, marcatori di conflitto, `git diff --check` |
| `src/` o configurazione frontend | controlli generali, `npm run lint`, `npm run build` |
| `server/src/`, `server/test/` o configurazione backend | controlli generali, `npm run typecheck`, `npm test` se PostgreSQL locale è raggiungibile |
| Schema o migrazioni Prisma | controlli backend, `npx prisma validate`, test se PostgreSQL locale è raggiungibile |

I test automatici non vengono mai eseguiti contro un `DATABASE_URL` remoto. Se PostgreSQL locale non è disponibile, il hook completa i controlli statici ma mostra esplicitamente che i test database sono stati saltati.

## Debug

- Self-test completo del setup: `node .claude/self-test.mjs`.
- Self-test locale: `node .claude/hooks/self-test.mjs`.
- Verifica manuale dello scope: `/verify-heemia-change [file o directory ...]`.
- Preflight/deploy esplicito: `/render-deploy-check [preflight|commit|push|deploy] [scope]`.
- In Claude Code: `/hooks` mostra origine e configurazione degli hook.
- Avvio diagnostico: `claude --debug-file /tmp/heemia-claude-hooks.log`.
- Per disabilitare temporaneamente tutti gli hook locali si può impostare `disableAllHooks` solo in `.claude/settings.local.json`; non modificare il file condiviso per una necessità personale.
