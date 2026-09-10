# QULAY AI — Bito audit and runtime verification

## September 10 verified inventory + general ERP routing

Production `BITO_TOOL_SCHEMA` logs verified that current product stock is exposed by
`bito_report_dashboard_summary_product_chart_paging`; the optional aggregate stock summary is
`bito_report_pos_product_stock_summary`, with `bito_report_pos_summary_product_chart_paging` kept
only as a POS fallback. Inventory no longer requires a guessed products↔stock pair and never uses
sales, distribution, ABC or production tools as a substitute.

The Bito bridge now treats the MCP registry as a general ERP capability surface rather than an
inventory-only integration. Query-scoped selection covers live READ/WRITE tools for customers,
employees, sales/POS, profit/finance, debt/credit, orders, suppliers/purchases, production,
transfers, revisions/write-offs, distribution, KPI, devices, pipeline, reasons, states/settings,
exports, SMS/templates, marketing/source/tag/ticket and other explicit Bito domains. READ tools run
without confirmation; all unknown or mutating operations fail closed as WRITE and require the
existing confirmation flow. A short, user-scoped schema cache avoids duplicate `tools/list` calls
without caching business values or sharing capabilities between accounts.

Inventory questions are deterministic: the backend prefetches the verified current-stock report,
unwraps MCP `content[].text`, expands supported pagination, normalizes product name/quantity/unit
when present, strips internal identifiers from fallback rows, and lets the model answer only from
that Bito result. Concrete product queries use Bito's `search` input when possible and fall back to
the full verified list if provider search is stricter than user wording. Normal stock questions hide
zero rows; explicit all/out-of-stock questions include them.

The `/integrations/bito/test` endpoint verifies credentials/handshake/`tools/list` only; a failing
business report no longer defines the connection as disconnected. Structure diagnostics remain
opt-in with `BITO_DEBUG_SHAPES=true` and must be disabled after troubleshooting.

The sections below preserve earlier diagnostic history for traceability. Where they refer to an
empty inventory allowlist or an unverified products↔stock pair, the verified September 10 section
above supersedes them. No production credentials were requested or stored in this repository.

## September 10 parser/routing diagnostic patch

Production evidence identifies `bito_report_sales_by_item_pagin` and `bito_report_sales_by_item_top` as incorrect selections for inventory, with page 1/2/3 and limit 100 requests. No real inventory tool schema or inner result has yet been supplied. The owner will deploy this patch and collect Render logs; no SSH access is needed.

- Inventory questions and inventory follow-ups now always execute the snapshot route. If no verified route exists, they return `BITO_INVENTORY_TOOLS_UNAVAILABLE` internally and a safe unavailable answer. They never fall back to model-selected sales tools, Files, or a confirmation card. During inventory the server also rejects model calls to any other tool.
- Removed fuzzy product/stock selection. `BITO_INVENTORY_PRODUCT_TOOLS` and `BITO_INVENTORY_STOCK_TOOLS` are exact-name, comma-separated allowlists, ordered by preference and intersected with the current user's live tools. Both default to empty. **Leave them empty for this diagnostic deployment.** Sales tools, writes, and unsatisfied required business inputs are rejected even if listed. Synthetic test tool names are not production defaults.
- MCP text entries now support JSON objects, arrays, code fences, surrounding prose, and separate metadata/data content items. Parsing uses `JSON.parse`, never eval. Non-text entries are ignored and sanitized unparsed text is retained as fallback. Metadata and rows are read from the inner payloads before pagination/mapping.
- The collection safety bounds are now 200 pages / 20,000 records, with explicit failure instead of a partial success when exhausted. A synthetic 501-product/501-stock fixture verifies six pages per tool, names/quantities/units, and sanitized logs. The real identity/unit/warehouse contract still needs production evidence.

### Render collection for the next mapping step

1. Deploy the backend and set `BITO_DEBUG_SHAPES=true`.
2. Open the Bito integration status/test or ask `Omborda nimalar bor?` to trigger authenticated tool discovery.
3. Filter `BITO_TOOL_SCHEMA` for `"inventoryCandidate":true`. This flag matches names containing stock, inventory, warehouse, product, item, balance, remain, quantity, storage, sklad, ombor, qoldiq and corresponding Russian stems. It is a **discovery aid**, not authorization to execute a tool; sales-by-item tools also match and remain forbidden for inventory.
4. Share those full JSON log lines. Each includes the exact tool name, sanitized description/title when supplied by the server, input field names/types/required fields and output schema if available. Defaults/examples and raw payload values are excluded.
5. Also share `BITO_SELECTED_TOOL`. Until names are verified it should report `intent: inventory`, `status: unavailable`, `reason: no_verified_inventory_pair`. No inventory MCP call is expected at this stage.
6. After final mapping is verified, the read path also emits `BITO_UNWRAPPED_PAYLOAD_SHAPE`, `BITO_PAGINATION_META`, and `BITO_INVENTORY_JOIN_SUMMARY`. They contain shapes, record/page counters, flags and cursor presence, never row values or cursor/token contents. Turn debug logging off after collection.

The sections below record the September 9 audit; the changes above supersede its provisional fuzzy selection and former 20-page/500-record bounds.

Local verification for this patch: `npm run lint`, `npm run build`, and all **49 suites / 401 tests** passed; `git diff --check` passed. Tests use synthetic ERP fixtures and mocked transport. Production inventory mapping and acceptance remain pending the owner's next sanitized Render logs.

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
