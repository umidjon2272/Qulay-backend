import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SuggestionStatus } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_SNOOZE_MS = 4 * 60 * 60 * 1000;

@Injectable()
export class ProactiveSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async listForUser(userId: string, status: SuggestionStatus = SuggestionStatus.ACTIVE) {
    await this.wakeSnoozed(userId);
    const where: Prisma.ProactiveSuggestionWhereInput = { userId, status };
    return this.prisma.proactiveSuggestion.findMany({ where, orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }] });
  }

  async dismiss(userId: string, id: string) {
    const suggestion = await this.getOwned(userId, id);
    const updated = await this.prisma.proactiveSuggestion.update({ where: { id: suggestion.id }, data: { status: SuggestionStatus.DISMISSED, snoozedUntil: null } });
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.PROACTIVE_SUGGESTION_DISMISSED, entityType: 'PROACTIVE_SUGGESTION', entityId: suggestion.id });
    return updated;
  }

  async snooze(userId: string, id: string, until?: string) {
    const suggestion = await this.getOwned(userId, id);
    const snoozedUntil = until ? new Date(until) : new Date(Date.now() + DEFAULT_SNOOZE_MS);
    const updated = await this.prisma.proactiveSuggestion.update({ where: { id: suggestion.id }, data: { status: SuggestionStatus.SNOOZED, snoozedUntil } });
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.PROACTIVE_SUGGESTION_SNOOZED, entityType: 'PROACTIVE_SUGGESTION', entityId: suggestion.id, metadata: { snoozedUntil } });
    return updated;
  }

  private async wakeSnoozed(userId: string): Promise<void> {
    await this.prisma.proactiveSuggestion.updateMany({
      where: { userId, status: SuggestionStatus.SNOOZED, snoozedUntil: { lte: new Date() } },
      data: { status: SuggestionStatus.ACTIVE, snoozedUntil: null },
    });
  }

  private async getOwned(userId: string, id: string) {
    const suggestion = await this.prisma.proactiveSuggestion.findFirst({ where: { id, userId } });
    if (!suggestion) throw new NotFoundException('Tavsiya topilmadi');
    return suggestion;
  }
}
