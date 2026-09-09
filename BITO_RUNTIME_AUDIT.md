# QULAY AI — Bito audit and runtime verification

This is the reviewed local fix and diagnostic stage. Production mapping is **not yet verified**. The owner will deploy to Render and supply sanitized schema logs; no production credentials were requested or used.

## Confirmed causes in the current source

- Agent word-boundary regexes missed Uzbek suffixes: `omborda`, `Bitoda`, `mahsulotlar`, `qoldi`. Bito tool discovery ran only when those regexes matched.
- Generic `qidir/top` selected file/Drive tools without requiring a document intent. Explicit Bito routing now takes priority; actual document requests retain their file tools.
- The bridge cached tools for two minutes and its refresh parameter did not bypass an existing cache. The cache is removed. Each model request and alias resolution uses the authenticated user's current connection/tool list.
- Connection status trusted the DB's CONNECTED value. Status now validates credentials and live tools/list, reporting CONNECTED, DEGRADED, EXPIRED or DISCONNECTED. Legacy DB enum values remain compatible; no migration is needed.
- Runtime auth failures set ERROR, but ERROR connections could not attempt token refresh again. Retriable connection records can now recover. Refresh persistence checks the original connection/token before saving so a late response cannot overwrite a replacement connection.
- MCP `isError` was returned as success. Tool discovery stopped at one tools/list page. SSE response handling waited for stream closure. These paths now reject tool failures, collect discovery pages and return upon the matching SSE response ID.
- Pagination silently stopped on repeated pages/limits and omitted completeness checks. Inconsistent totals, unknown continuation controls, repeated requests and safety limits now fail explicitly. Paging metadata is no longer read from product rows. Current limits: 20 pages and 500 records per business collection, 20 tool-discovery pages.
- READ/WRITE classification trusted filter-shaped schemas and broad description keywords. A shared policy now uses read annotations/known read operation names; mutations and unknown operations require confirmation. Payment reports remain reads.
- Any old Bito result could trigger an inventory follow-up, including sales results. Follow-ups now follow the preceding user topic; inventory is fetched again and bounded source/intent/completeness metadata is stored instead of truncated snapshot JSON.
- Legacy mapping mixed identifier domains, ignored unmatched rows and combined equal display names. The current safeguards reject missing/ambiguous mappings and preserve stock positions. They do **not** establish the real Bito join contract.

## Still requires production evidence

The existing inventory tool selection, collection extraction and identifier aliases predate this audit. They are retained provisionally, with stricter failure checks. No new guessed schema adapter has been added. Product/stock identifiers, variant identity, warehouse and unit lookups, prices, actual pagination and the real 78-product/46-position result must be established from runtime logs before calling the integration production-ready. A stock row's own `id` is never a product join key.

All 78/46 test fixtures are synthetic; they demonstrate pagination and orchestration, not the production schema. Sales/profit tests verify real-tool selection policy with mocks, not actual business values. Full A–J production acceptance and live Telegram/Google/Voice regression checks remain for the deployed environment.

## Render diagnostic collection

1. Deploy this backend to **Qulay-backend**, `https://qulay-backend-y98j.onrender.com`, using the normal release process. Deploy the frontend changes separately.
2. In Render Environment set `BITO_DEBUG_SHAPES=true`, then deploy/restart. Existing OAuth/encryption settings stay in Render.
3. Open Bito integration status/test, then ask in chat: `Omborda nimalar bor?`, `Bitoda qidir omborda nimalar bor`, `Bito’da mahsulotlar nechta?`, `Hammasini chiqar`, `Bugungi savdo qancha?`, `Bugungi foyda qancha?`, `Cola qancha qoldi?`.
4. Share only lines with **BITO_TOOL_SCHEMA**, **BITO_RESPONSE_SHAPE**, and the **BITO_* error code** emitted during these checks. Include product and stock tool logs from the same run. If a required company/warehouse input prevents prefetch, tool schema logs identify the required fields for the next fix.
5. After collection set `BITO_DEBUG_SHAPES=false` and redeploy/restart.

Diagnostics contain tool names, input/output schema property names and types, required field names, response object keys, array lengths, pagination numeric counts/flags and presence/type of cursors. They exclude scalar business values, cursor contents, identifiers, credentials, authorization headers, customer names and provider error bodies. JSON log lines preserve nested field structure. Raw HTTP/SDK debug logging is unnecessary.

## Changed areas

- `src/bito/`: bridge, MCP transport, integration status/retry, OAuth refresh persistence, controller and new intent, safety-policy and schema-diagnostic helpers.
- `src/ai-agent/`: automatic discovery, business read requirement, inventory prefetch, safe errors, follow-up handling and buffered Bito read output.
- `src/config/`: opt-in diagnostic flag and validation.
- `src/integrations-health/`: Bito degradation/refresh status labels.
- Frontend integration status types, IntegrationContext and IntegrationHub; chat rendering already uses server confirmation state.
- Tests cover routing, tool policy, transport, status/retry, account isolation, completeness, context and frontend READ/WRITE cards. Existing test constructors were updated for the Bito dependency already required by production.

## Cleanup evidence

The frontend `index.html` starts `src/main.tsx`, which uses `src/app/router.tsx`. TypeScript import resolution across retained TS/TSX files found **zero incoming imports** to the separate JSX demo tree. The build configs, package scripts and deploy entry do not use that tree; it is not a fixture or migration.

Removed 19 orphan demo files: `src/App.jsx`, `src/main.jsx`, `src/components/UI.jsx`, `src/layout/AppLayout.jsx`, `src/state/AppContext.jsx`, `src/styles.css` and `src/pages/{AiWorkspace,Customers,Dashboard,Employees,Finance,PosTerminal,Products,Purchases,Reports,Sales,Settings,Suppliers,Warehouse}.jsx`.

Removed duplicate `frontend/vite.config.js` after retaining its port 5173 setting in `vite.config.ts`, which also contains the test configuration. No backup ZIP/patch files or tracked `dist` were found. Generated ignored dist/node_modules remain local. Existing scripts, documentation, env examples, lockfiles, migrations and Git histories are retained.

## Final local verification (2026-09-09)

- Backend: `npm install`, `npm run prisma:generate`, `npm run lint`, `npm run build`, `npm test` passed. **47 suites / 371 tests passed** on the final run. Prisma engine download required network escalation; generation then succeeded.
- Frontend: `npm install`, `npm run lint`, `npm run build`, `npm test` passed. **25 suites / 112 tests passed**. Lint retains 21 existing warnings in router, PlatformContext and TopBar; no lint errors.
- Existing Telegram, Google, Voice, Tasks, Reminders, Files, history, memory and security unit/regression suites passed. These do not replace production end-to-end checks.
- `git diff --check` passed in both repositories; conflict-marker scan found zero. Both `.git` directories remain intact. No commits, pushes, history rewrites or deployment were performed.
