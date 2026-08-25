import { ActivityLogService } from '../activity-log/activity-log.service';
export declare class AuthSecurityAuditService {
    private readonly activityLog;
    private readonly logger;
    constructor(activityLog: ActivityLogService);
    recordUserAction(userId: string, action: string, reason?: string): Promise<void>;
    recordSuspicious(action: string, ip: string, normalizedEmail: string): void;
    static readonly actions: {
        readonly LOGIN_FAILED: "LOGIN_FAILED";
        readonly LOGIN_SUCCEEDED: "LOGIN_SUCCEEDED";
        readonly LOGIN_BLOCKED: "LOGIN_BLOCKED";
        readonly REGISTERED: "REGISTERED";
        readonly REGISTER_FAILED: "REGISTER_FAILED";
        readonly REFRESH_SUCCEEDED: "REFRESH_SUCCEEDED";
        readonly LOGOUT_COMPLETED: "LOGOUT_COMPLETED";
        readonly PASSWORD_CHANGED: "PASSWORD_CHANGED";
    };
}
