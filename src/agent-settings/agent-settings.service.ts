import { Injectable } from '@nestjs/common';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { assertValidTimezone } from '../common/date.utils';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAgentSettingsDto } from './dto/update-agent-settings.dto';

const DEFAULTS = {
  morningBriefingEnabled: true,
  morningBriefingTime: '08:00',
  eveningSummaryEnabled: true,
  eveningSummaryTime: '21:00',
  telegramDelivery: false,
  inAppDelivery: true,
  proactiveEnabled: true,
  financialAlertsEnabled: true,
  quietHoursStart: null as string | null,
  quietHoursEnd: null as string | null,
  timezone: 'Asia/Tashkent',
};

@Injectable()
export class AgentSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async getForUser(userId: string) {
    const existing = await this.prisma.agentPreference.findUnique({ where: { userId } });
    return existing ?? { userId, ...DEFAULTS };
  }

  async upsertForUser(userId: string, dto: UpdateAgentSettingsDto) {
    if (dto.timezone) assertValidTimezone(dto.timezone);
    const preference = await this.prisma.agentPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULTS, ...dto },
      update: { ...dto },
    });
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.AGENT_PREFERENCE_UPDATED, entityType: 'AGENT_PREFERENCE', entityId: preference.id });
    return preference;
  }
}
