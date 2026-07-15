
Frontend Heemia App: prototipo funzionante a dati finti (DEC-015). Il vault Obsidian è la fonte unica delle specifiche — questo file non duplica contenuto.

## Regole master 
[/08_AI_Workflow/CLAUDE.md

## Documenti da leggere a inizio sessione, prima di scrivere codice
Non importati automaticamente per non saturare il contesto: leggili con il tool Read a inizio sessione, ogni volta.

- `../00_Index/Project_Status.md`
- `../00_Index/Decision_Log.md`
- `../00_Index/Open_Questions.md`
- `../01_Business/Business_Analysis.md`
- `../02_Functional_Requirements/Functional_Requirements.md`
- `../03_Technical_Specification/UI_Design_System.md`
- `../04_Security/User_Roles_Permissions.md`

## Regola per questa fase
Frontend funzionante a dati finti (mock in memoria). Nessun backend, nessun database, nessuna chiamata API reale. Copre tutti i requisiti in Functional_Requirements.md (FR-01→FR-29). Palette e principi da UI_Design_System.md. Gating per ruolo da User_Roles_Permissions.md, anche con dati mock — Team interno non vede mai Costi e Margini. Include empty state, loading state, un alert critico attivo, un margine sotto soglia.

Su qualsiasi punto non coperto da questi documenti: non inventare. Scrivi la domanda in Open_Questions.md e fermati.