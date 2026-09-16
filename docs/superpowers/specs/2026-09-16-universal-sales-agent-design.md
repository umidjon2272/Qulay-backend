# QULAY AI Universal Sales Agent — Design

Date: 2026-09-16

## Scope

Finish and harden the existing QULAY AI sales agent across Telegram, WhatsApp and Instagram without replacing working integrations. Keep the existing channel adapters, webhooks, OAuth flows, Bito connector, Prisma migrations and `.git` history intact.

Primary goals:
- One shared semantic sales brain for Telegram, WhatsApp and Instagram.
- A customer already inside a sales conversation must not receive silence on legitimate product follow-ups.
- Real product/price/stock truth priority: Bito live truth -> strong owner-taught product knowledge -> AI reasoning for conversation only.
- Never invent stock, price, SKU, variant or availability.
- Instagram integration panel becomes compact; Instagram automation management moves to AI Chat.
- Development-mode Instagram comment testing must work even when Meta cannot deliver production webhooks because the app is unpublished.

## Existing Architecture to Preserve

- `AiAgentService` already owns shared external-sales reasoning and Bito reads.
- `TelegramSalesAgentService`, `WhatsAppSalesAgentService`, and `InstagramSalesAgentService` are thin channel adapters around the shared AI sales mode.
- `UniversalSalesState` stores the active customer selection and verified availability state.
- `SalesProductKnowledgeService` provides owner-taught product facts.
- Instagram AI tools already support listing real posts and creating/listing/deleting comment automations.
- Instagram OAuth, WhatsApp Cloud connection, Telegram connection, Bito connector and Google integrations must not be regressed.

## Approaches Considered

### A. Keep separate channel-specific sales logic
Rejected. It would duplicate availability/follow-up fixes three times and let Telegram/WhatsApp/Instagram drift apart again.

### B. Replace channel services with one new monolithic omnichannel service
Rejected. This is high regression risk for existing Telegram, WhatsApp and Meta webhook flows.

### C. Preserve channel adapters, strengthen shared Sales Brain, add small channel-specific delivery/fallback layers
Chosen. It fixes the semantic/root behavior once while minimizing changes to working integration plumbing.

## Sales Brain Behavior

### Conversation continuity
Once a sender is in an active sales conversation, every legitimate sales follow-up is passed through the shared semantic brain. The brain must understand short contextual turns such as:
- `16 Pro bormi?`
- `qorasi-chi?`
- `128GB?`
- `5 ta olsam?`
- `arzonrog‘i bormi?`

A new product family clears stale model/color/storage/quantity selection from the old topic.

### No-silence guarantee for sales turns
`suppressReply` is reserved only for confidently non-sales personal chatter. Any turn classified as availability, price, model, variant, stock, quantity, comparison, recommendation, delivery, payment, store info, acknowledgement or soft exit must produce a customer-facing reply.

If semantic understanding fails, fall back to deterministic sales-intent heuristics and still produce a safe response instead of silence.

### Availability truth
For product availability:
1. Query Bito when connected and relevant.
2. Reconcile `IN_STOCK`, `OUT_OF_STOCK`, and `NOT_FOUND` into the persistent sales state.
3. If Bito says `NOT_FOUND`, a strong owner-taught exact product fact may still answer for an intentionally off-Bito product.
4. Otherwise answer naturally that the requested model/variant is not available.
5. Offer only real alternatives returned by Bito or strong owner knowledge.

Examples:
- Broad: `Ayfon bormi?` -> `Ha, iPhone bor. Qaysi model kerak edi?`
- Exact unavailable: `16 Pro bormi?` -> `16 Pro hozir yo‘q. 15 Pro bor, xohlasangiz shuni ko‘rib chiqamiz.` only when 15 Pro is a real returned alternative.
- No alternative: `16 Pro hozir yo‘q ekan.`

Tool/provider failures are not translated into `yo‘q`; they produce a truthful temporary-data-unavailable response.

## Instagram

### Compact integration panel
When connected, show only:
- account identity / connection status;
- AI Sales Agent toggle;
- Direct toggle;
- Comments toggle;
- Image understanding toggle;
- connection test;
- disconnect.

Remove post picker, trigger text, DM text, automation create form and automation list from the integration modal.

### AI Chat automation management
AI Chat becomes the normal management surface for Instagram automations. Existing tools are extended so the user can:
- create an automation from a real post/reel;
- list automations;
- pause/resume an automation;
- update trigger/DM/public reply settings;
- delete an automation.

The model must always list real posts/automations first when it needs an ID. It must never invent `mediaId` or `automationId`.

### Development comment fallback
Meta production webhooks may not deliver while the Meta app is unpublished. Add a development-only polling fallback that:
- is disabled in normal production/live mode unless explicitly enabled by env;
- periodically reads comments for connected tester accounts/posts using Instagram API;
- stores idempotency receipts so each comment is processed once;
- sends the resulting event through the existing `InstagramSalesAgentService` comment path, not through a second sales implementation;
- never duplicates an event later delivered by webhook.

This fallback is a testing bridge, not a permanent substitute for Meta Live/App Review.

## WhatsApp

Keep the current Cloud API/Embedded Signup/webhook flow. Strengthen shared sales reply behavior only. Preserve sales-only gating for non-commercial chatter, but once a sales context is active, contextual product follow-ups must not be dropped by pre-AI regex gating.

## Telegram

Preserve private/group/voice/image privacy rules and owner pause behavior. Fix only the shared semantic/fallback path plus any proven Telegram-specific gate that drops a legitimate active-sales follow-up.

## AI Chat Sales Controls

Add/extend owner tools so plain-language commands can control the sales agent, especially Instagram:
- `Instagram sotuv agentini yoq/o‘chir`
- `DMlarni yoq/o‘chir`
- `Commentlarni yoq/o‘chir`
- `Oxirgi postimga promt yozganlarga ... yubor`
- `Shu automationni to‘xtat/davom ettir/o‘chir`

Where an action changes future external messaging behavior, preserve the existing confirmation-card safety model unless the action is only toggling the owner's own integration setting and existing product policy permits direct execution.

## Error Handling and Observability

- Never log access tokens, app secrets, raw OAuth codes or customer-private payloads.
- Add structured event logs with hashed user/peer IDs and stable error codes for channel ingress, Bito lookup, send failure and dev-poll processing.
- Customer-facing failure text stays natural and non-technical.

## Data / Migration Rules

Prefer existing tables and receipts. Add a migration only if the development comment poller needs a durable cursor/receipt not already represented by `SalesInboundReceipt` / Instagram automation receipts. Never modify old Prisma migrations.

## Testing

Backend:
- unit tests for exact model unavailable -> non-empty natural reply;
- Bito `NOT_FOUND` and `OUT_OF_STOCK` cases;
- strong owner knowledge override of Bito `NOT_FOUND`;
- active sales follow-up never suppressed;
- Telegram/WhatsApp/Instagram share the same state behavior;
- Instagram automation create/list/update/pause/resume/delete AI tools;
- dev comment fallback idempotency and webhook/poll duplicate prevention;
- existing Telegram, WhatsApp, Bito and Instagram tests.

Frontend:
- Instagram connected panel contains only compact controls;
- automation form/list no longer renders in integration modal;
- OAuth/manual fallback remains intact;
- integration service tests remain green.

Verification:
- `npm ci`
- backend `npm run prisma:generate`, `npm run build`, relevant/full tests
- frontend `npm run build`, relevant/full tests
- `git diff --check`
- conflict-marker audit
- secret-pattern audit
- verify `.git`, migrations and workflow files are preserved
- regression audit for Telegram, WhatsApp, Bito, Google and Instagram OAuth.

## Non-goals

- Do not publish the Meta app or bypass Meta Business Verification in code.
- Do not replace WhatsApp/Telegram connection flows.
- Do not invent an order-creation backend that does not already exist.
- Do not expose technical IDs/tokens to normal users.
