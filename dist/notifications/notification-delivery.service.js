"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationDeliveryService = exports.InAppNotificationAdapter = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const telegram_notification_adapter_1 = require("./adapters/telegram-notification.adapter");
const web_push_notification_adapter_1 = require("./adapters/web-push-notification.adapter");
let InAppNotificationAdapter = class InAppNotificationAdapter {
    constructor() {
        this.channel = client_1.NotificationChannel.IN_APP;
    }
    async deliver(_notification) { }
};
exports.InAppNotificationAdapter = InAppNotificationAdapter;
exports.InAppNotificationAdapter = InAppNotificationAdapter = __decorate([
    (0, common_1.Injectable)()
], InAppNotificationAdapter);
let NotificationDeliveryService = class NotificationDeliveryService {
    constructor(inApp, telegram, webPush) {
        this.adapters = new Map();
        for (const adapter of [inApp, telegram, webPush])
            this.adapters.set(adapter.channel, adapter);
    }
    deliver(notification) {
        const adapter = this.adapters.get(notification.channel);
        if (!adapter)
            throw new Error(`No adapter registered for ${notification.channel}`);
        return adapter.deliver(notification);
    }
};
exports.NotificationDeliveryService = NotificationDeliveryService;
exports.NotificationDeliveryService = NotificationDeliveryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [InAppNotificationAdapter,
        telegram_notification_adapter_1.TelegramNotificationAdapter,
        web_push_notification_adapter_1.WebPushNotificationAdapter])
], NotificationDeliveryService);
//# sourceMappingURL=notification-delivery.service.js.map