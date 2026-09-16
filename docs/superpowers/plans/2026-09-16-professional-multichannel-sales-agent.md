# QULAY AI Professional Multi-Channel Sales Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Telegram, WhatsApp and Instagram a reliable, context-aware professional sales agent with safe Bito/owner truth and working Instagram comment automation.

**Architecture:** Harden the existing shared `AiAgentService`/`UniversalSalesState`, then make channel adapters reliable without replacing their integrations. Add only the persistence needed for Instagram delivery/token/OAuth safety, and keep the frontend compact.

**Tech Stack:** NestJS, TypeScript, Prisma/PostgreSQL, Jest, React/Vite, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-16-professional-multichannel-sales-agent-design.md`

## Global Constraints
- Preserve `.git`, existing migrations, config and workflows.
- No secret/token values in logs, tests, commits or final report.
- Bito live truth wins for the same exact product/variant.
- BUSINESS must include all three sales channels.
- Instagram Settings panel stays compact; AI Chat owns operational automation management.

---

### Task 1: Subscription and connection defaults
**Files:** `src/subscriptions/subscription-plans.ts`, `src/whatsapp/whatsapp-sales-agent.service.ts`, `src/instagram/instagram-integration.service.ts`, `test/subscription-business-instagram.spec.ts`, relevant service tests.
- [ ] Write failing tests proving BUSINESS includes `TELEGRAM_SALES`, `WHATSAPP_SALES`, `INSTAGRAM_SALES` and fresh WhatsApp/Instagram connections enable sales agent.
- [ ] Run focused tests and observe failures.
- [ ] Implement minimal entitlement/default changes.
- [ ] Re-run focused tests.
- [ ] Commit.

### Task 2: Exact owner-knowledge authority and professional follow-up state
**Files:** `src/ai-agent/sales-product-knowledge.service.ts`, `src/ai-agent/universal-sales-context.ts`, `src/ai-agent/ai-agent.service.ts`, `test/sales-engine-hardening.spec.ts`, `test/instagram-sales-foundation.spec.ts`.
- [ ] Add failing tests for `13 Pro` knowledge not authorizing `16 Pro`, plus `16 Pro unavailable -> 13 Pro offer -> Mayli -> 2 ta` flow.
- [ ] Run tests and observe failures.
- [ ] Implement authoritative exact-match criteria and structured offered/accepted alternative state.
- [ ] Expand unavailable-selection lookup handling to price+quantity follow-ups.
- [ ] Re-run focused tests and commit.

### Task 3: Instagram comment poller diagnostics and durable replay safety
**Files:** `src/instagram/instagram-comment-poller.service.ts`, `src/instagram/instagram-graph.service.ts`, Prisma schema/migration, `test/instagram-sales-foundation.spec.ts`.
- [ ] Add failing tests for comment rows with alternate actor shapes, aggregate diagnostics, and restart-safe unseen-comment processing.
- [ ] Run tests and observe failures.
- [ ] Add persistent poll cursor/seen state and safe diagnostics; remove process-start cutoff dependency.
- [ ] Re-run focused tests and commit.

### Task 4: Instagram automation delivery correctness
**Files:** `src/instagram/instagram-sales-agent.service.ts`, `src/instagram/instagram-integration.service.ts`, Prisma schema/migration, AI tool registry/DTO, tests.
- [ ] Add failing tests: exact trigger works without AI credits; private/public delivery tracked independently; permanent failures back off; duplicate trigger upserts; atomic replace-all operation.
- [ ] Run tests and observe failures.
- [ ] Implement per-leg delivery state and deterministic exact-match path before AI gating.
- [ ] Implement idempotent create/update and atomic replace-all service/tool.
- [ ] Re-run tests and commit.

### Task 5: Conversation-aware Instagram AI Chat tooling
**Files:** `src/ai-agent/ai-agent.service.ts`, AI tool registry/DTO tests.
- [ ] Add failing tests for `Instagram...` followed by `narxga almashtir`, `hammasini o‘chir`, `agentni yoq` retaining Instagram tools.
- [ ] Run tests and observe failures.
- [ ] Make tool selection inspect recent relevant conversation context and deterministically include setting/automation tools.
- [ ] Re-run tests and commit.

### Task 6: Connector auth and health UI
**Files:** frontend `src/services/api/apiClient.ts`, `src/components/IntegrationHub/IntegrationHub.tsx`, integration tests.
- [ ] Add failing frontend tests that Instagram connector 401 does not clear QULAY auth and DEGRADED is not rendered CONNECTED.
- [ ] Run tests and observe failures.
- [ ] Implement connector-error classification for Instagram and truthful health mapping.
- [ ] Re-run tests and commit.

### Task 7: OAuth/token lifecycle hardening
**Files:** Instagram OAuth/Graph services, Prisma schema/migration, env validation tests.
- [ ] Add failing tests for persisted single-use OAuth state and token expiry/refresh metadata.
- [ ] Run tests and observe failures.
- [ ] Implement persistent OAuth nonce consumption, token expiry storage and refresh helper without logging secrets.
- [ ] Re-run tests and commit.

### Task 8: Full regression and packaging
**Files:** no feature additions.
- [ ] Run backend `npm ci`, `npm run prisma:generate`, `npm run build`, focused tests, full unit tests.
- [ ] Run frontend `npm ci`, `npm run build`, relevant/full tests.
- [ ] Run conflict-marker audit, `git diff --check`, secret scan, migration/workflow audit, Telegram/WhatsApp/Bito/Instagram regression review.
- [ ] Merge feature branches into original local `main` without force.
- [ ] Verify clean final Git status and commit SHAs.
- [ ] Package backend/frontend with `.git` preserved and real `.env` excluded from distributable ZIPs.
- [ ] Validate ZIP integrity and report exact remaining external Meta limitations.
