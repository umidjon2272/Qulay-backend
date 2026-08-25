import { NotificationType } from '@prisma/client';
export declare class NotificationQueryDto {
    unreadOnly?: boolean;
    type?: NotificationType;
    page: number;
    limit: number;
}
