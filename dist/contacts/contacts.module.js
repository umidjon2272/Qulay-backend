"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactsModule = void 0;
const common_1 = require("@nestjs/common");
const activity_log_module_1 = require("../activity-log/activity-log.module");
const common_module_1 = require("../common/common.module");
const prisma_module_1 = require("../prisma/prisma.module");
const contact_history_service_1 = require("./contact-history.service");
const contacts_controller_1 = require("./contacts.controller");
const contacts_service_1 = require("./contacts.service");
let ContactsModule = class ContactsModule {
};
exports.ContactsModule = ContactsModule;
exports.ContactsModule = ContactsModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, common_module_1.CommonModule, activity_log_module_1.ActivityLogModule],
        controllers: [contacts_controller_1.ContactsController],
        providers: [contacts_service_1.ContactsService, contact_history_service_1.ContactHistoryService],
        exports: [contacts_service_1.ContactsService, contact_history_service_1.ContactHistoryService],
    })
], ContactsModule);
//# sourceMappingURL=contacts.module.js.map