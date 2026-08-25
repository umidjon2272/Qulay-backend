import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ACTIVITY_ACTIONS, ActivityLogService } from '../activity-log/activity-log.service';

@Injectable()
export class AuthSecurityAuditService {
  private readonly logger = new Logger(AuthSecurityAuditService.name);

  constructor(private readonly activityLog: ActivityLogService) {}

  async recordUserAction(userId: string, action: string, reason?: string): Promise<void> {
    try {
      await this.activityLog.record({
        userId,
        action,
        entityType: 'AUTH',
        metadata: reason ? { reason } : undefined,
      });
    } catch {
      this.logger.warn(`Unable to persist auth activity: ${action}`);
    }
  }

  recordSuspicious(action: string, ip: string, normalizedEmail: string): void {
    const identifierFingerprint = createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 16);
    this.logger.warn(`Suspicious auth activity action=${action} ip=${ip || 'unknown'} identifier=${identifierFingerprint}`);
  }

  static readonly actions = {
    LOGIN_FAILED: ACTIVITY_ACTIONS.LOGIN_FAILED,
    LOGIN_SUCCEEDED: ACTIVITY_ACTIONS.LOGIN_SUCCEEDED,
    LOGIN_BLOCKED: ACTIVITY_ACTIONS.LOGIN_BLOCKED,
    REGISTERED: ACTIVITY_ACTIONS.REGISTERED,
    REGISTER_FAILED: ACTIVITY_ACTIONS.REGISTER_FAILED,
    REFRESH_SUCCEEDED: ACTIVITY_ACTIONS.REFRESH_SUCCEEDED,
    LOGOUT_COMPLETED: ACTIVITY_ACTIONS.LOGOUT_COMPLETED,
    PASSWORD_CHANGED: ACTIVITY_ACTIONS.PASSWORD_CHANGED,
  } as const;
}
