import { NotificationDeliveryAdapter, NotificationRecord } from './notification.types';
import { TelegramNotificationAdapter } from './adapters/telegram-notification.adapter';
import { WebPushNotificationAdapter } from './adapters/web-push-notification.adapter';
export declare class InAppNotificationAdapter implements NotificationDeliveryAdapter {
    readonly channel: "IN_APP";
    deliver(_notification: NotificationRecord): Promise<void>;
}
export declare class NotificationDeliveryService {
    private readonly adapters;
    constructor(inApp: InAppNotificationAdapter, telegram: TelegramNotificationAdapter, webPush: WebPushNotificationAdapter);
    deliver(notification: NotificationRecord): Promise<void>;
}
