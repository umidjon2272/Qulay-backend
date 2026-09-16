-- QULAY AI business sales agents are opt-out for dedicated business connectors.
-- Older connected rows were created before that default and can remain false
-- even though the UI says the connector is ready. Backfill them once. Telegram
-- is intentionally excluded because it can represent a personal account.
UPDATE "WhatsAppConnection"
SET "salesAgentEnabled" = TRUE
WHERE "status" IN ('CONNECTED', 'DEGRADED')
  AND "salesAgentEnabled" = FALSE;

UPDATE "InstagramConnection"
SET "salesAgentEnabled" = TRUE
WHERE "status" IN ('CONNECTED', 'DEGRADED')
  AND "salesAgentEnabled" = FALSE;
