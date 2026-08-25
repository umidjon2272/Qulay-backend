-- Admin console query indexes. No data is fabricated or changed by this migration.
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt");
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");
CREATE INDEX "AiUsage_createdAt_type_idx" ON "AiUsage"("createdAt", "type");
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
CREATE INDEX "ActivityLog_action_createdAt_idx" ON "ActivityLog"("action", "createdAt");
CREATE INDEX "ActivityLog_entityType_createdAt_idx" ON "ActivityLog"("entityType", "createdAt");
CREATE INDEX "Notification_createdAt_status_idx" ON "Notification"("createdAt", "status");
CREATE INDEX "UserFile_createdAt_idx" ON "UserFile"("createdAt");
