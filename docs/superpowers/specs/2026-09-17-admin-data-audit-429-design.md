# Admin data truth and rate-limit design

## Goal

Normal authenticated admin navigation must not exhaust a shared proxy-IP bucket, while abusive and authentication traffic remains protected. Every admin value must preserve database truth: login, activity, subscriptions, usage, integrations, and health are distinct facts and missing data is never converted into a fabricated value.

## Rate limiting

- Resolve a stable client address from the trusted Render forwarding chain; reject malformed forwarded values and fall back to the socket address.
- Use a verified JWT subject plus client address for authenticated global buckets. Anonymous traffic remains keyed by client address.
- Keep the stricter login/register/reset limiters and brute-force controls unchanged.
- Return `Retry-After` for every 429. The frontend coalesces concurrent GETs and enters a per-request cooldown after a 429 instead of retrying.

## Activity truth

- Add nullable `User.lastLoginAt` and `User.lastActivityAt` fields.
- Set `lastLoginAt` only after successful credential login.
- Set `lastActivityAt` only when a meaningful, persisted user event is recorded. Background refreshes and reads do not touch it; an admin action touches the actor, never the target user.
- Admin APIs return login time, activity time, and active session as separate fields. No `createdAt`/`updatedAt` fallback is permitted.

## Admin data truth

- Normalize subscription expiry through the subscription entitlement service; pending and expired records are never active.
- Return usage and limits from `AiUsage`, `UserFile`, and the effective subscription.
- Return Telegram, scoped Google Calendar/Drive, Bito ERP, WhatsApp, and Instagram connection states from their database rows. WhatsApp and Instagram remain disabled/coming-soon in the product UI.
- Health output distinguishes observed checks from unverified components; it does not invent healthy states.
- Frontend empty/error states preserve `null` and hide stale/fabricated values.

## Verification

Regression tests cover bucket isolation, Retry-After/cooldown, login/activity semantics, subscription status, integration state, usage truth, and null rendering. Backend and frontend builds plus `git diff --check` are required before commit and push.
