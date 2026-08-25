import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
export type NotificationRecord = Prisma.NotificationGetPayload<{}>;
export type NotificationDraft = {
    type: NotificationType;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
    scheduledAt: Date;
    metadata?: Prisma.InputJsonValue;
};
export interface NotificationDeliveryAdapter {
    channel: NotificationChannel;
    deliver(notification: NotificationRecord): Promise<void>;
}
