# Checklist Render Heemia

## 1. Perimetro

- Confermare `git rev-parse --show-toplevel`, branch, remote, `git status --short` e `git diff --name-only`.
- Elencare esattamente i file richiesti e separare modifiche preesistenti o parallele.
- Fermarsi prima di commit/push/deploy se lo stesso file mescola scope non separabili.

## 2. Configurazione e segreti

- Per cambi di configurazione, verificare insieme codice/default, `.env.example` e `render.yaml` pertinenti.
- Leggere soltanto i nomi delle variabili necessarie; non mostrare mai i valori.
- Verificare che nessun file sensibile sia tracciato o incluso nel diff.

## 3. Verifica locale

- Eseguire la matrice scope-aware tramite `.claude/skills/verify-heemia-change/scripts/verify.mjs`.
- Per scritture persistenti verificare anche risposta API, rilettura backend e reload.
- Dichiarare esplicitamente test saltati, database usato e limiti browser.

## 4. Commit e push

- Procedere solo se `$ARGUMENTS` autorizza esplicitamente l'azione.
- Aggiungere allo staging solo i file concordati, poi ispezionare `git diff --cached` e `git diff --cached --check`.
- Creare un commit con messaggio descrittivo e mostrare hash e file inclusi.
- Eseguire il push soltanto del branch atteso; non forzare e non riscrivere la cronologia.

## 5. Render e smoke test

- Osservare il completamento del deploy con la fonte già configurata e approvata.
- Verificare `/health` e confrontare il commit esposto con quello pubblicato.
- Provare gli endpoint interessati. Per auth/proxy, un login non valido same-origin deve restituire JSON `401`, non HTML.
- Per Safari/sessione verificare `VITE_API_BASE_URL=/`, `/api/*` prima del fallback SPA e i prefissi API relativi nel bundle.
- Riportare separatamente: verificato in produzione, verificato solo in locale, dipendente da credenziali o non verificato.
