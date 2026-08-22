import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AiUsageService } from './usage.service';
export declare class UsageController {
    private readonly usageService;
    constructor(usageService: AiUsageService);
    getMine(user: AuthenticatedUser): Promise<{
        month: string;
        textUsage: {
            requests: number;
            inputTokens: number;
            outputTokens: number;
            totalTokens: number;
        };
        voiceUsage: {
            requests: number;
            audioSeconds: number;
        };
        toolActions: number;
        estimatedCost: number;
    }>;
}
