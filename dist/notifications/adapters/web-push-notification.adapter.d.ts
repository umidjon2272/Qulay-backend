import { NotificationDeliveryAdapter, NotificationRecord } from '../notification.types';
export declare class WebPushNotificationAdapter implements NotificationDeliveryAdapter {
    readonly channel: "WEB_PUSH";
    deliver(_notification: NotificationRecord): Promise<void>;
}
