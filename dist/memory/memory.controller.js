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
exports.MemoryController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const create_memory_dto_1 = require("./dto/create-memory.dto");
const memory_query_dto_1 = require("./dto/memory-query.dto");
const update_memory_dto_1 = require("./dto/update-memory.dto");
const memory_service_1 = require("./memory.service");
let MemoryController = class MemoryController {
    constructor(memoryService) {
        this.memoryService = memoryService;
    }
    list(user, query) {
        return this.memoryService.listForUser(user.sub, query);
    }
    create(user, dto) {
        return this.memoryService.createForUser(user.sub, dto);
    }
    update(user, id, dto) {
        return this.memoryService.updateForUser(user.sub, id, dto);
    }
    delete(user, id) {
        return this.memoryService.deleteForUser(user.sub, id);
    }
};
exports.MemoryController = MemoryController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, memory_query_dto_1.MemoryQueryDto]),
    __metadata("design:returntype", void 0)
], MemoryController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_memory_dto_1.CreateMemoryDto]),
    __metadata("design:returntype", void 0)
], MemoryController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_memory_dto_1.UpdateMemoryDto]),
    __metadata("design:returntype", void 0)
], MemoryController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MemoryController.prototype, "delete", null);
exports.MemoryController = MemoryController = __decorate([
    (0, common_1.Controller)('memories'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [memory_service_1.MemoryService])
], MemoryController);
//# sourceMappingURL=memory.controller.js.map