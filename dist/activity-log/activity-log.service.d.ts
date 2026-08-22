import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare const ACTIVITY_ACTIONS: {
    readonly TASK_CREATED: "TASK_CREATED";
    readonly TASK_COMPLETED: "TASK_COMPLETED";
    readonly REMINDER_CREATED: "REMINDER_CREATED";
    readonly MEETING_CREATED: "MEETING_CREATED";
    readonly NOTE_CREATED: "NOTE_CREATED";
};
export type ActivityLogInput = {
    userId: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
};
export declare class ActivityLogService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    record(input: ActivityLogInput): Prisma.Prisma__ActivityLogClient<{
        id: string;
        createdAt: Date;
        userId: string;
        action: string;
        entityType: string;
        entityId: string | null;
        metadata: Prisma.JsonValue | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
}
