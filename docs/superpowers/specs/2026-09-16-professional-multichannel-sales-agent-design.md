# QULAY AI Professional Multi-Channel Sales Agent Design

## Goal
Make Telegram, WhatsApp and Instagram behave as one professional AI sales agent that never goes silent inside an active sales conversation, keeps product/variant/quantity context, respects Bito live truth, uses owner-taught facts only for the exact saved product/variant, and reliably handles Instagram DM/comment automation.

## Non-negotiable constraints
- Current Git `main` code is the implementation source of truth.
- Preserve `.git`, Prisma migrations, workflow/config files, Telegram, WhatsApp, Google and Bito integrations.
- Never log or commit secrets/tokens.
- Bito live truth outranks owner-taught knowledge for the same product/variant.
- A Bito `NOT_FOUND` for a specific model must not be overridden by a weak family-level owner-knowledge match.
- The agent must not invent stock, price, SKU, model or payment details.
- BUSINESS currently used by the owner must include Telegram/WhatsApp/Instagram sales-agent entitlements.
- Instagram integration UI remains compact; operational management belongs in AI Chat.

## Architecture
### 1. Shared Sales Brain
Keep the existing `AiAgentService` and `UniversalSalesState` as the single semantic brain for Telegram, WhatsApp and Instagram. Extend state with a structured last-offer/accepted-offer memory so follow-ups such as `Mayli` and `2 ta olsamchi? qancha berasiz?` resolve against the real offered alternative instead of the previously unavailable model.

Quantity/price follow-ups after an unavailable selection broaden lookup to the accepted/offered family/product and never claim the unavailable selection is available. If the selected item is unavailable, the response must say so directly and only mention alternatives backed by Bito or an exact owner-taught record.

### 2. Owner Product Knowledge Safety
Replace broad family-level fuzzy override behavior with two match levels: discovery matches for model prompting, and authoritative matches for overriding Bito `NOT_FOUND`. An authoritative match must preserve discriminating query tokens (model numbers, storage, color/variant when present) rather than matching only the family name.

### 3. Channel Reliability
Telegram, WhatsApp and Instagram continue to use their existing adapters, sessions and duplicate-receipt pipeline. BUSINESS receives all three sales entitlements. WhatsApp/Instagram connection status must expose real degraded/error state instead of displaying a false healthy connection.

New successful Instagram/WhatsApp connections enable the sales agent by default while retaining user toggles to disable it.

### 4. Instagram Comment Delivery
Development polling remains a tester-only bridge. It must log safe aggregate diagnostics (`posts`, comments fetched/accepted/skipped/handled) without logging comment text or tokens. It must use durable receipt state instead of a process-start five-minute cutoff so Render sleep/restart does not permanently lose comments.

Exact comment automation runs before AI-credit gating; deterministic `narx -> DM/public reply` rules should still work when AI credits are exhausted. AI is only required for semantic matching or free-form AI comment responses.

Private DM and public reply delivery are tracked independently. A partial success only retries the missing leg, preventing duplicate DMs. Permanent permission/auth errors back off instead of retrying every minute forever.

### 5. Instagram AI Chat Control
Tool selection is conversation-aware. If recent conversation turns establish Instagram automation/settings context, follow-ups like `narxga almashtir`, `hammasini o‘chir`, `ha qil`, `agentni yoq` retain Instagram tools. Explicit setting commands deterministically expose and use the correct tool instead of allowing the model to claim the tool is unavailable.

Automation creation is idempotent per user/media/normalized trigger: create-or-update instead of accumulating duplicates. Batch replacement (`hammasini o‘chir va yangi qoida yarat`) is implemented through a dedicated atomic service operation/tool rather than multiple unrelated writes.

### 6. Frontend Safety
Instagram/WhatsApp connector authentication errors do not clear QULAY auth. Health rendering displays DEGRADED/ERROR honestly, including the last integration error when present. The Instagram panel stays compact and directs users to AI Chat for automation management.

### 7. OAuth/Token Lifecycle
Store Instagram token expiry when supplied and provide a refresh path for Instagram Login long-lived tokens. OAuth state replay protection remains signed/expiring and gains a persistent one-time nonce record so restart/multi-instance deployment cannot reuse a consumed state.

## Testing
Add regression tests for:
- BUSINESS includes Telegram/WhatsApp/Instagram sales entitlements.
- `iPhone 13 Pro` owner knowledge cannot authorize `iPhone 16 Pro` after Bito `NOT_FOUND`.
- `16 Pro unavailable -> offer 13 Pro -> Mayli -> 2 ta olsamchi?` transitions to accepted 13 Pro and computes/asks correctly.
- Instagram comment poll diagnostics and restart-safe dedupe.
- Exact automation bypasses AI-credit requirement.
- Partial Instagram automation delivery retries only the failed leg.
- Duplicate automation is upserted, not duplicated.
- AI Chat follow-up retains Instagram tools.
- WhatsApp/Instagram connect defaults agent enabled.
- Connector 401 does not logout QULAY.
- DEGRADED is not rendered as CONNECTED.

## Out of scope
Meta production App Review/business verification cannot be bypassed in code. Development polling remains a temporary tester bridge until the Meta app can be Published/Live.
