import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const ACTIVITY_ACTIONS = {
  TASK_CREATED: 'TASK_CREATED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  REMINDER_CREATED: 'REMINDER_CREATED',
  MEETING_CREATED: 'MEETING_CREATED',
  NOTE_CREATED: 'NOTE_CREATED',
} as const;

export type ActivityLogInput = {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: ActivityLogInput) {
    return this.prisma.activityLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
      },
    });
  }
}
