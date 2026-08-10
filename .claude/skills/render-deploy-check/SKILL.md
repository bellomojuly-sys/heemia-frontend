---
name: render-deploy-check
description: Prepara e verifica commit, push e deploy Render di uno scope Heemia già consolidato.
argument-hint: "[preflight|commit|push|deploy] [scope]"
disable-model-invocation: true
---

# Render deploy check Heemia

Esegui solo le azioni nominate esplicitamente in `$ARGUMENTS`. L'invocazione senza `commit`, `push` o `deploy` autorizza soltanto il preflight read-only.

Segui integralmente [checklist.md](checklist.md).

Regole inderogabili:

- Non stampare o copiare credenziali, cookie, token o valori `.env`.
- Non usare un dirty tree con modifiche parallele o migrazioni incomplete per commit o deploy.
- Non includere file estranei allo scope dichiarato.
- Non correggere silenziosamente errori appartenenti ad altri scope.
- Non dichiarare un deploy concluso finché Render non mostra il commit atteso e gli smoke test non passano.

Per la verifica locale dello scope usa `/verify-heemia-change` oppure il suo script condiviso; non duplicare una matrice di controlli diversa.
