import { AiUsage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
type UsageInput = {
    userId: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    audioSeconds?: number;
    estimatedCost?: number;
};
export declare class AiUsageService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    logTextUsage(input: UsageInput): Promise<AiUsage>;
    logVoiceUsage(input: UsageInput): Promise<AiUsage>;
    logToolUsage(input: UsageInput): Promise<AiUsage>;
    logFileUsage(input: UsageInput): Promise<AiUsage>;
    getForUser(userId: string): Promise<{
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
    private createUsage;
}
export {};
