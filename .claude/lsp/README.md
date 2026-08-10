# TypeScript LSP Heemia

Il plugin project-scoped `typescript-lsp@claude-plugins-official` è abilitato in `.claude/settings.json`.

Dipendenze installate nell'area utente, fuori dal repository:

- `typescript-language-server@5.3.0`;
- `typescript@7.0.2` come fallback globale; i due package Heemia mantengono le rispettive versioni TypeScript locali.

Verifica:

```text
node .claude/lsp/self-test.mjs
```

Il test inizializza il protocollo LSP, apre `src/App.tsx` e richiede i simboli del documento senza modificare il file.

## Valutazione PR Review Toolkit

`pr-review-toolkit` non viene installato. Duplica parte dei reviewer Heemia, aggiunge sei agenti proattivi e include un `code-simplifier` non strettamente read-only. Il costo dichiarato dal catalogo è inoltre di circa 1.400 token sempre attivi su Sonnet. Potrà essere rivalutato soltanto per una futura esigenza PR specifica e con scope pulito.
