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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const admin_query_dto_1 = require("./dto/admin-query.dto");
const admin_service_1 = require("./admin.service");
let AdminController = class AdminController {
    constructor(admin) {
        this.admin = admin;
    }
    overview(query) { return this.admin.getOverview(query.range); }
    users(query) { return this.admin.listUsers(query); }
    user(id) { return this.admin.getUser(id); }
    status(actor, id, dto) { return this.admin.updateUserStatus(actor.sub, id, dto.status); }
    role(actor, id, dto) { return this.admin.updateUserRole(actor.sub, id, dto.role); }
    usage(query) { return this.admin.getUsage(query.range); }
    integrations() { return this.admin.getIntegrations(); }
    notifications(query) { return this.admin.getNotifications(query.range); }
    files(query) { return this.admin.getFiles(query.page, query.limit); }
    activity(query) { return this.admin.getActivity(query); }
    system() { return this.admin.getSystemHealth(); }
    settings() { return this.admin.getSettings(); }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('overview'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_query_dto_1.AdminRangeQueryDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('users'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_query_dto_1.AdminUsersQueryDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "users", null);
__decorate([
    (0, common_1.Get)('users/:id'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "user", null);
__decorate([
    (0, common_1.Patch)('users/:id/status'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_query_dto_1.AdminStatusDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "status", null);
__decorate([
    (0, common_1.Patch)('users/:id/role'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_query_dto_1.AdminRoleDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "role", null);
__decorate([
    (0, common_1.Get)('usage'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_query_dto_1.AdminRangeQueryDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "usage", null);
__decorate([
    (0, common_1.Get)('integrations'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "integrations", null);
__decorate([
    (0, common_1.Get)('notifications'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_query_dto_1.AdminRangeQueryDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "notifications", null);
__decorate([
    (0, common_1.Get)('files'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_query_dto_1.AdminUsersQueryDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "files", null);
__decorate([
    (0, common_1.Get)('activity'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_query_dto_1.AdminActivityQueryDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "activity", null);
__decorate([
    (0, common_1.Get)('system'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "system", null);
__decorate([
    (0, common_1.Get)('settings'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "settings", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ADMIN),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map