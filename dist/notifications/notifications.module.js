"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsModule = void 0;
const common_1 = require("@nestjs/common");
const activity_log_module_1 = require("../activity-log/activity-log.module");
const telegram_module_1 = require("../telegram/telegram.module");
const prisma_module_1 = require("../prisma/prisma.module");
const notifications_controller_1 = require("./notifications.controller");
const notification_delivery_service_1 = require("./notification-delivery.service");
const telegram_notification_adapter_1 = require("./adapters/telegram-notification.adapter");
const web_push_notification_adapter_1 = require("./adapters/web-push-notification.adapter");
const notification_scheduler_service_1 = require("./notification-scheduler.service");
const notification_service_1 = require("./notification.service");
const notification_worker_service_1 = require("./notification-worker.service");
let NotificationsModule = class NotificationsModule {
};
exports.NotificationsModule = NotificationsModule;
exports.NotificationsModule = NotificationsModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, activity_log_module_1.ActivityLogModule, telegram_module_1.TelegramModule],
        controllers: [notifications_controller_1.NotificationsController],
        providers: [
            notification_service_1.NotificationService,
            notification_scheduler_service_1.NotificationSchedulerService,
            notification_worker_service_1.NotificationWorkerService,
            notification_delivery_service_1.InAppNotificationAdapter,
            telegram_notification_adapter_1.TelegramNotificationAdapter,
            web_push_notification_adapter_1.WebPushNotificationAdapter,
            notification_delivery_service_1.NotificationDeliveryService,
        ],
        exports: [notification_service_1.NotificationService, notification_scheduler_service_1.NotificationSchedulerService, notification_worker_service_1.NotificationWorkerService],
    })
], NotificationsModule);
//# sourceMappingURL=notifications.module.js.map