# End-to-end tests

Playwright-tests die de app in de browser doorklikken. De Claude API wordt nagebootst
(`page.route`), dus de tests kosten niets en hebben geen API-key nodig. De nagebootste API
controleert elk request zoals de echte API: headers, `fallbacks`, de strikte tool-schema's en
hun limieten (`api-limits.js`), en of de gespreksgeschiedenis alleen wordt aangevuld.

| Test | Wat |
|---|---|
| `app.e2e.js` | Training starten, sets loggen, rusttimer, records, voeding, doelen, gewicht, schema's, opslag na herladen |
| `coach.e2e.js` | API-key instellen, profiel, eten loggen (tekst en foto), data opvragen, schema maken, fouten en opnieuw proberen |
| `coach-actions.e2e.js` | Alles aanpassen via de coach: schema, voeding, training, profiel, ongedaan maken, app-update |
| `web-build.e2e.js` | De productie-build als web-app: manifest, offline starten, back-up maken en terugzetten |

## Draaien

Eenmalig de browser installeren:

```bash
npx playwright install chromium
```

App- en coachtests (start eerst de dev-server in een tweede terminal met `npx expo start --web`):

```bash
npm run test:e2e
```

Productie-build:

```bash
npm run test:web-build
```

Tegen de Cloudflare-runtime (in een tweede terminal `npx wrangler dev`):

```bash
BASE_URL=http://localhost:8787 node e2e/web-build.e2e.js
```

Screenshots komen in `e2e/screenshots/` (staat in `.gitignore`).
