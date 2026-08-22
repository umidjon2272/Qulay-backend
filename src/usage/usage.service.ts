import { Injectable } from '@nestjs/common';
import { AiUsage, UsageType } from '@prisma/client';
import { monthRangeUtc } from '../common/date.utils';
import { PrismaService } from '../prisma/prisma.service';

type UsageInput = {
  userId: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  estimatedCost?: number;
};

@Injectable()
export class AiUsageService {
  constructor(private readonly prisma: PrismaService) {}

  logTextUsage(input: UsageInput): Promise<AiUsage> {
    return this.createUsage({ ...input, type: UsageType.TEXT });
  }

  logVoiceUsage(input: UsageInput): Promise<AiUsage> {
    return this.createUsage({ ...input, type: UsageType.VOICE });
  }

  logToolUsage(input: UsageInput): Promise<AiUsage> {
    return this.createUsage({ ...input, type: UsageType.TOOL });
  }

  logFileUsage(input: UsageInput): Promise<AiUsage> {
    return this.createUsage({ ...input, type: UsageType.FILE });
  }

  async getForUser(userId: string) {
    const { start, end } = monthRangeUtc();
    const groups = await this.prisma.aiUsage.groupBy({
      by: ['type'],
      where: { userId, createdAt: { gte: start, lt: end } },
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        audioSeconds: true,
        estimatedCost: true,
      },
    });
    const text = groups.find(({ type }) => type === UsageType.TEXT);
    const voice = groups.find(({ type }) => type === UsageType.VOICE);
    const tool = groups.find(({ type }) => type === UsageType.TOOL);
    const sum = (field: 'inputTokens' | 'outputTokens' | 'audioSeconds' | 'estimatedCost') =>
      groups.reduce((total, group) => total + (group._sum[field] ?? 0), 0);

    return {
      month: start.toISOString().slice(0, 7),
      textUsage: {
        requests: text?._count._all ?? 0,
        inputTokens: text?._sum.inputTokens ?? 0,
        outputTokens: text?._sum.outputTokens ?? 0,
        totalTokens: (text?._sum.inputTokens ?? 0) + (text?._sum.outputTokens ?? 0),
      },
      voiceUsage: {
        requests: voice?._count._all ?? 0,
        audioSeconds: voice?._sum.audioSeconds ?? 0,
      },
      toolActions: tool?._count._all ?? 0,
      estimatedCost: sum('estimatedCost'),
    };
  }

  private createUsage(input: UsageInput & { type: UsageType }): Promise<AiUsage> {
    return this.prisma.aiUsage.create({
      data: {
        userId: input.userId,
        type: input.type,
        model: input.model,
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        audioSeconds: input.audioSeconds ?? 0,
        estimatedCost: input.estimatedCost ?? 0,
      },
    });
  }
}
