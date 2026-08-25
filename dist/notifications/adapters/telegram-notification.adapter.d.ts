import { TelegramIntegrationService } from '../../telegram/telegram-integration.service';
import { NotificationDeliveryAdapter, NotificationRecord } from '../notification.types';
export declare class TelegramNotificationAdapter implements NotificationDeliveryAdapter {
    private readonly telegram;
    readonly channel: "TELEGRAM";
    constructor(telegram: TelegramIntegrationService);
    deliver(notification: NotificationRecord): Promise<void>;
}
