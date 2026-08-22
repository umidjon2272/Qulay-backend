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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemindersController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const create_reminder_dto_1 = require("./dto/create-reminder.dto");
const reminder_query_dto_1 = require("./dto/reminder-query.dto");
const update_reminder_dto_1 = require("./dto/update-reminder.dto");
const reminders_service_1 = require("./reminders.service");
let RemindersController = class RemindersController {
    constructor(remindersService) {
        this.remindersService = remindersService;
    }
    list(user, query) {
        return this.remindersService.listForUser(user.sub, query);
    }
    get(user, id) {
        return this.remindersService.getForUser(user.sub, id);
    }
    create(user, dto) {
        return this.remindersService.createForUser(user.sub, dto);
    }
    update(user, id, dto) {
        return this.remindersService.updateForUser(user.sub, id, dto);
    }
    delete(user, id) {
        return this.remindersService.deleteForUser(user.sub, id);
    }
    complete(user, id) {
        return this.remindersService.completeForUser(user.sub, id);
    }
};
exports.RemindersController = RemindersController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, reminder_query_dto_1.ReminderQueryDto]),
    __metadata("design:returntype", void 0)
], RemindersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RemindersController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_reminder_dto_1.CreateReminderDto]),
    __metadata("design:returntype", void 0)
], RemindersController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_reminder_dto_1.UpdateReminderDto]),
    __metadata("design:returntype", void 0)
], RemindersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RemindersController.prototype, "delete", null);
__decorate([
    (0, common_1.Patch)(':id/complete'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RemindersController.prototype, "complete", null);
exports.RemindersController = RemindersController = __decorate([
    (0, common_1.Controller)('reminders'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [reminders_service_1.RemindersService])
], RemindersController);
//# sourceMappingURL=reminders.controller.js.map