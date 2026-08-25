"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramModule = void 0;
const common_1 = require("@nestjs/common");
const activity_log_module_1 = require("../activity-log/activity-log.module");
const contacts_module_1 = require("../contacts/contacts.module");
const prisma_module_1 = require("../prisma/prisma.module");
const telegram_controller_1 = require("./telegram.controller");
const telegram_integration_service_1 = require("./telegram-integration.service");
const telegram_client_service_1 = require("./telegram-client.service");
const telegram_crypto_service_1 = require("./telegram-crypto.service");
let TelegramModule = class TelegramModule {
};
exports.TelegramModule = TelegramModule;
exports.TelegramModule = TelegramModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, activity_log_module_1.ActivityLogModule, contacts_module_1.ContactsModule],
        controllers: [telegram_controller_1.TelegramController],
        providers: [
            telegram_crypto_service_1.TelegramCryptoService,
            telegram_client_service_1.TeleprotoTelegramClientService,
            { provide: telegram_client_service_1.TelegramClientService, useExisting: telegram_client_service_1.TeleprotoTelegramClientService },
            telegram_integration_service_1.TelegramIntegrationService,
        ],
        exports: [telegram_integration_service_1.TelegramIntegrationService, telegram_client_service_1.TelegramClientService, telegram_crypto_service_1.TelegramCryptoService],
    })
], TelegramModule);
//# sourceMappingURL=telegram.module.js.map