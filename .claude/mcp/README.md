# MCP condivisi Heemia

La configurazione versionata è in `.mcp.json`. Non contiene token, cookie o storage state.

## Playwright locale

- Pacchetto ufficiale Microsoft fissato a `@playwright/mcp@0.0.78`.
- Browser WebKit headless, profilo isolato e snapshot restituiti direttamente alla sessione; gli eventuali output temporanei vivono in `/tmp/heemia-playwright-mcp`.
- Origini previste: `localhost` e `127.0.0.1`, HTTP/HTTPS, su qualsiasi porta locale.
- L'allowlist delle origini riduce navigazioni accidentali ma non è una barriera di sicurezza contro redirect; controllare comunque ogni URL richiesto.
- Cookie e local storage vengono eliminati con la chiusura del contesto e non entrano nel repository.

## GitHub read-only

- Server remoto ufficiale GitHub.
- Toolset limitati a repository, pull request e Actions.
- Header `X-MCP-Readonly: true`: gli strumenti di scrittura non vengono esposti dal server.
- L'autenticazione avviene con OAuth dal menu `/mcp`; Claude Code conserva il token fuori dal repository.

## Prima attivazione

1. Avviare Claude Code nel repository e approvare i server project-scoped mostrati da `/mcp`.
2. Per `github-readonly`, completare il login OAuth nel browser.
3. Verificare che GitHub esponga soltanto operazioni di lettura.
4. Avviare l'app locale, quindi provare con Playwright: login, ruolo, azione, risposta API, reload e rilettura.

Self-test locale del server e di WebKit:

```text
node .claude/mcp/self-test.mjs
```

Non aggiungere token a `.mcp.json` e non salvare uno storage state browser nel progetto.
