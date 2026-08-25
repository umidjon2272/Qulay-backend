"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleModule = void 0;
const common_1 = require("@nestjs/common");
const activity_log_module_1 = require("../activity-log/activity-log.module");
const prisma_module_1 = require("../prisma/prisma.module");
const google_api_client_service_1 = require("./google-api-client.service");
const google_auth_service_1 = require("./google-auth.service");
const google_calendar_service_1 = require("./google-calendar.service");
const google_controller_1 = require("./google.controller");
const google_crypto_service_1 = require("./google-crypto.service");
const google_drive_service_1 = require("./google-drive.service");
let GoogleModule = class GoogleModule {
};
exports.GoogleModule = GoogleModule;
exports.GoogleModule = GoogleModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, activity_log_module_1.ActivityLogModule],
        controllers: [google_controller_1.GoogleController],
        providers: [google_api_client_service_1.GoogleApiClientService, google_auth_service_1.GoogleAuthService, google_calendar_service_1.GoogleCalendarService, google_crypto_service_1.GoogleCryptoService, google_drive_service_1.GoogleDriveService],
        exports: [google_auth_service_1.GoogleAuthService, google_calendar_service_1.GoogleCalendarService, google_drive_service_1.GoogleDriveService, google_api_client_service_1.GoogleApiClientService, google_crypto_service_1.GoogleCryptoService],
    })
], GoogleModule);
//# sourceMappingURL=google.module.js.map