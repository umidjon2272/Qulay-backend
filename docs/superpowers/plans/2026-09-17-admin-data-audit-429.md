# Admin data audit and 429 implementation plan

1. Generate the baseline Prisma client and add failing security/API-client regression tests for client isolation, Retry-After, GET coalescing, and cooldown.
2. Add the activity timestamp migration and failing tests for never-logged-in users, successful login, meaningful activity, and admin reads.
3. Implement trusted client-IP resolution, authenticated rate-limit keys, limiter decisions with retry metadata, and frontend request deduplication/cooldown.
4. Implement login/activity persistence without per-request writes.
5. Audit and correct admin service mappings for subscriptions, usage/limits, integrations, activity, settings, and health; add regression coverage before each correction.
6. Update frontend types and admin views so zero, false, null, and load failure stay distinct and stale/fake defaults are not rendered.
7. Run focused tests, full feasible test suites, both builds, and `git diff --check`; review only task changes, commit in each repository, and push the feature branches.
