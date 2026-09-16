# QULAY AI Universal Sales Agent Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Telegram, WhatsApp and Instagram share a reliable no-silence sales brain, move Instagram automation management to AI Chat, add a development-only Instagram comment polling bridge, and simplify the Instagram integration UI without regressing existing integrations.

**Architecture:** Preserve the existing channel adapters and strengthen shared `AiAgentService`/`UniversalSalesState` behavior once. Extend existing Instagram tools/services rather than creating a parallel automation system. Route development-polled comments through the same `InstagramSalesAgentService` handler and existing idempotency receipts used by webhook events.

**Tech Stack:** NestJS 11, Prisma 6/PostgreSQL, Jest, React 19, Vite 8, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-universal-sales-agent-design.md`

## Global Constraints

- Preserve `.git`, existing Prisma migrations, config/workflows, Telegram, WhatsApp, Bito, Google and Instagram OAuth flows.
- Bito live truth > strong owner-taught verified knowledge > AI conversational reasoning.
- Never invent price, stock, SKU, model, variant or availability.
- `suppressReply` is allowed only for confidently non-sales chatter; legitimate active sales follow-ups must return a customer-facing message.
- Instagram development polling is disabled by default and must never duplicate a webhook-delivered comment.
- Normal users must not see Instagram IDs/tokens/secrets.

---

### Task 1: Shared sales no-silence and availability truth

**Files:**
- Modify: `src/ai-agent/ai-agent.service.ts`
- Modify: `src/ai-agent/universal-sales-context.ts`
- Test: `test/sales-engine-hardening.spec.ts`
- Test: `test/ai-agent-flow.spec.ts`

**Interfaces:**
- Consumes: existing `UniversalSalesState`, `SalesTurnUnderstanding`, Bito inventory snapshot and owner product knowledge.
- Produces: deterministic safe fallback helpers used by `AiAgentService.chat()` so product/availability turns never end with an empty response.

- [ ] **Step 1: Add failing tests for exact unavailable follow-ups**

Add cases equivalent to:

```ts
it('keeps an exact unavailable model and produces a safe no-silence action', () => {
  let state = updateUniversalSalesState(undefined, 'Ayfon bormi?');
  state = updateUniversalSalesState(state, '16 Pro bormi?');
  state = reconcileUniversalSalesStateFromInventory(state, {
    availabilityStatus: 'NOT_FOUND',
    items: [],
    familyAlternatives: [],
  });
  expect(state.model).toBe('16 pro');
  expect(planSalesNextAction(state, '16 Pro bormi?').nextBestAction).toBe('OFFER_ALTERNATIVE');
});
```

and a service-level test asserting an external sales turn cannot return both `suppressReply: true` and a sales intent such as availability/model/price.

- [ ] **Step 2: Run targeted tests and verify failure**

Run:

```bash
npm test -- --runInBand test/sales-engine-hardening.spec.ts test/ai-agent-flow.spec.ts
```

Expected: at least one new assertion fails on the current behavior.

- [ ] **Step 3: Implement minimal shared fallback behavior**

In `AiAgentService`, after semantic understanding, only return `suppressReply` when the turn is confidently `NON_SALES` and there is no active/current sales selection. If a product/model/variant/price/stock/delivery/payment/business-fact turn survives classification, guarantee a natural response. When inventory says `NOT_FOUND`/`OUT_OF_STOCK` and strong owner knowledge does not override it, generate wording from verified state such as:

```ts
const missing = selectedLabel(state);
return missing ? `${missing} hozir yo‘q ekan.` : 'Bu variant hozir yo‘q ekan.';
```

Only append alternatives derived from Bito `familyAlternatives` or strong owner knowledge.

- [ ] **Step 4: Run targeted tests and verify pass**

```bash
npm test -- --runInBand test/sales-engine-hardening.spec.ts test/ai-agent-flow.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai-agent/ai-agent.service.ts src/ai-agent/universal-sales-context.ts test/sales-engine-hardening.spec.ts test/ai-agent-flow.spec.ts
git commit -m "fix: guarantee sales follow-up replies"
```

### Task 2: Channel adapters keep active sales follow-ups

**Files:**
- Modify if required by failing tests: `src/telegram/telegram-sales-agent.service.ts`
- Modify if required by failing tests: `src/whatsapp/whatsapp-sales-agent.service.ts`
- Modify if required by failing tests: `src/instagram/instagram-sales-agent.service.ts`
- Test: `test/telegram-sales-agent.service.spec.ts`
- Create/Test: `test/whatsapp-sales-agent.service.spec.ts`
- Modify: `test/instagram-sales-foundation.spec.ts`

**Interfaces:**
- Consumes: `AiAgentService.chat(..., { externalSales: true, salesState })`.
- Produces: each channel forwards short contextual turns during an active sales window instead of dropping them before the shared brain.

- [ ] **Step 1: Write regression tests**

For each channel, simulate an active sales session followed by a terse message like `16 Pro bormi?` or `qorasi-chi?` and assert `ai.chat` is invoked and a non-empty send method is called.

- [ ] **Step 2: Run the three channel test files**

```bash
npm test -- --runInBand test/telegram-sales-agent.service.spec.ts test/whatsapp-sales-agent.service.spec.ts test/instagram-sales-foundation.spec.ts
```

Expected: any real pre-AI gate defect is reproduced; otherwise tests document current correct behavior and no source change is made.

- [ ] **Step 3: Fix only proven channel-specific gates**

Keep privacy/owner-pause/non-sales gates. Change only conditions that reject contextual product follow-ups while the session’s sales context is active.

- [ ] **Step 4: Re-run tests**

Same command; Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telegram src/whatsapp src/instagram test/telegram-sales-agent.service.spec.ts test/whatsapp-sales-agent.service.spec.ts test/instagram-sales-foundation.spec.ts
git commit -m "fix: preserve omnichannel sales follow-ups"
```

### Task 3: Instagram AI Chat controls for settings and automations

**Files:**
- Modify: `src/ai-tools/dto/tool-input.dto.ts`
- Modify: `src/ai-tools/ai-tool-registry.service.ts`
- Modify: `src/ai-tools/ai-tool-execution.service.ts`
- Modify: `src/ai-agent/ai-agent.service.ts`
- Modify: `src/instagram/instagram-integration.service.ts`
- Test: `test/ai-tool-registry.service.spec.ts`
- Test: `test/ai-agent-flow.spec.ts`
- Test: `test/instagram-sales-foundation.spec.ts`

**Interfaces:**
- Produces tools:
  - `get_instagram_sales_settings({})`
  - `update_instagram_sales_settings({ enabled?, dmEnabled?, commentsEnabled?, imageVisionEnabled? })`
  - `update_instagram_comment_automation({ automationId, triggerText?, dmMessage?, publicReply?, semanticMatch?, sendPrivateReply?, replyPublicly?, active? })`
- Existing `list_instagram_posts`, `list_instagram_comment_automations`, `save_instagram_comment_automation`, `delete_instagram_comment_automation` remain canonical.

- [ ] **Step 1: Add DTO and registry failing tests**

Verify the new tools exist, validate ownership, and update only requested fields. Verify `update_instagram_comment_automation({ active: false })` pauses and `active: true` resumes an existing automation.

- [ ] **Step 2: Run targeted registry tests**

```bash
npm test -- --runInBand test/ai-tool-registry.service.spec.ts test/instagram-sales-foundation.spec.ts
```

Expected: FAIL because the tools do not yet exist.

- [ ] **Step 3: Implement tools and feature entitlement**

Add DTOs with `class-validator`. Register READ/WRITE tools backed by `InstagramIntegrationService.status`, `updateSettings`, and `updateAutomation`. In `AIToolExecutionService`, assert `INSTAGRAM_SALES` whenever a tool name starts with/contains `instagram_`. Keep future external-messaging creation/update confirmation behavior; owner-local on/off setting toggles may execute directly.

- [ ] **Step 4: Make AI Chat select Instagram tools reliably**

Extend the non-external chat tool-selection prompt/intent so commands such as `Instagram sotuv agentini yoq`, `commentlarni o‘chir`, `shu automationni to‘xtat`, and `oxirgi postimga promt yozganlarga ...` expose the Instagram tool subset without invoking Bito.

- [ ] **Step 5: Run targeted tests**

```bash
npm test -- --runInBand test/ai-tool-registry.service.spec.ts test/ai-agent-flow.spec.ts test/instagram-sales-foundation.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ai-tools src/ai-agent/ai-agent.service.ts src/instagram/instagram-integration.service.ts test
git commit -m "feat: manage instagram sales from ai chat"
```

### Task 4: Development-only Instagram comment polling bridge

**Files:**
- Modify: `src/config/configuration.ts`
- Modify: `src/config/validation.ts`
- Modify: `.env.example`
- Modify: `src/instagram/instagram-graph.service.ts`
- Modify: `src/instagram/instagram-sales-agent.service.ts`
- Create: `src/instagram/instagram-comment-poller.service.ts`
- Modify: `src/instagram/instagram.module.ts`
- Test: `test/instagram-sales-foundation.spec.ts`
- Test: `test/instagram-env-validation.spec.ts`

**Interfaces:**
- New config: `INSTAGRAM_DEV_COMMENT_POLL_ENABLED=false` and `INSTAGRAM_DEV_COMMENT_POLL_INTERVAL_MS=60000`.
- `InstagramGraphService.listRecentComments(userId, mediaId, limit)` returns real API comment objects with `id`, `text`, commenter identity and media id.
- `InstagramSalesAgentService.handlePolledComment(userId, event)` calls the same comment pipeline used by webhook ingestion.

- [ ] **Step 1: Add failing idempotency/config tests**

Assert the poller is disabled by default, refuses unsafe short intervals, and processing the same comment first via poll then webhook results in one outbound automation/reply because existing inbound/automation receipts deduplicate it.

- [ ] **Step 2: Run targeted tests**

```bash
npm test -- --runInBand test/instagram-sales-foundation.spec.ts test/instagram-env-validation.spec.ts
```

Expected: FAIL because poller/config do not exist.

- [ ] **Step 3: Implement graph comment read and shared ingestion entry point**

Read comments from the connected professional account’s real media. Do not create a second sales brain. Expose a public method on `InstagramSalesAgentService` that normalizes the polled event and invokes the existing `handleComment` path.

- [ ] **Step 4: Implement scheduler loop**

Use a Nest injectable with `OnModuleInit`/`OnModuleDestroy` and `setInterval`; start only when `instagram.devCommentPollEnabled === true`. For each connected account with comments enabled, poll recent posts and comments. Hash IDs in logs; never log content/tokens. Rely on existing receipt uniqueness for idempotency.

- [ ] **Step 5: Run targeted tests**

Same command; Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .env.example src/config src/instagram test/instagram-sales-foundation.spec.ts test/instagram-env-validation.spec.ts
git commit -m "feat: add instagram development comment poller"
```

### Task 5: Compact Instagram integration UI

**Files:**
- Modify: `frontend/src/components/IntegrationHub/InstagramIntegrationPanel.tsx`
- Modify if needed: `frontend/src/components/IntegrationHub/IntegrationHub.scss`
- Modify: `frontend/src/services/integrationService.test.ts`
- Create/Test if practical: `frontend/src/components/IntegrationHub/InstagramIntegrationPanel.test.tsx`

**Interfaces:**
- Keeps OAuth connect, manual fallback when disconnected, status, toggles, test and disconnect.
- Removes post picker, automation create form and automation list from the integration modal.

- [ ] **Step 1: Add failing UI test**

Render connected status and assert `Automation yaratish`, trigger input and automation list are absent while AI Sales Agent/Direct/Comment/Image toggles and disconnect remain.

- [ ] **Step 2: Run frontend targeted tests**

```bash
npm test -- --run src/services/integrationService.test.ts src/components/IntegrationHub/InstagramIntegrationPanel.test.tsx
```

Expected: FAIL against the current long panel.

- [ ] **Step 3: Simplify component**

Delete connected-state post/automation form state and JSX. Preserve disconnected one-click OAuth/manual fallback and existing service methods used elsewhere.

- [ ] **Step 4: Run frontend tests and build**

```bash
npm test -- --run src/services/integrationService.test.ts src/components/IntegrationHub/InstagramIntegrationPanel.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/IntegrationHub src/services/integrationService.test.ts
git commit -m "fix: simplify instagram integration panel"
```

### Task 6: Full verification, regression audit and delivery ZIPs

**Files:**
- No feature source changes unless verification reveals a real regression.

- [ ] **Step 1: Backend clean install/generate/build/tests**

```bash
npm ci
npm run prisma:generate
npm run build
npm test -- --runInBand
```

Expected: all commands exit 0.

- [ ] **Step 2: Frontend clean install/build/tests**

```bash
npm ci
npm run build
npm test -- --run
```

Expected: all commands exit 0.

- [ ] **Step 3: Static integrity audits**

```bash
git diff --check
git grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- . ':!package-lock.json'
git status --short
```

Run a secret scan for committed values matching common token/secret patterns, excluding `.env`, `node_modules`, `dist`, `.git`, fixtures and lockfiles. Confirm old Prisma migration directories still exist and `.git` is present.

- [ ] **Step 4: Regression-focused tests/audit**

Re-run Instagram OAuth/env tests, Telegram tests, WhatsApp policy/agent tests, Bito tests, Google tests and subscription entitlement tests. Inspect diffs to confirm WhatsApp connect, Telegram auth, Google and Bito integration plumbing were not rewritten.

- [ ] **Step 5: Final commits and ZIPs**

Ensure backend/frontend working trees are clean, preserve `.git`, exclude only dependency/build caches as appropriate without deleting tracked files, and create final backend/frontend ZIP archives for the user.
