---
name: verify-heemia-change
description: Verifica una modifica Heemia con controlli pertinenti allo scope Git, senza commit o pubblicazione.
argument-hint: "[file o directory ...]"
disable-model-invocation: true
---

# Verifica modifica Heemia

Verifica il perimetro richiesto in `$ARGUMENTS`. Non creare commit, non fare push e non modificare i file per far passare i controlli.

1. Conferma che `${CLAUDE_PROJECT_DIR}` sia il repository `04_Claude_Code` e leggi `git status --short`.
2. Se `$ARGUMENTS` contiene file o directory, limita la verifica a quei percorsi. Non includere modifiche estranee.
3. Se non contiene percorsi, usa la baseline della sessione. Se non è disponibile, mostra il worktree e chiedi uno scope esplicito invece di verificare indiscriminatamente tutto il dirty tree.
4. Esegui:

   ```text
   node ${CLAUDE_SKILL_DIR}/scripts/verify.mjs --session ${CLAUDE_SESSION_ID} -- <percorsi espliciti, se presenti>
   ```

5. Riporta separatamente:
   - file realmente verificati;
   - controlli superati;
   - controlli falliti;
   - test database saltati e motivo;
   - verifiche browser o persistenza ancora necessarie.

Un form chiuso o una build superata non dimostrano la persistenza. Per una scrittura dati, richiedi anche risposta API, rilettura backend e reload quando applicabile.
