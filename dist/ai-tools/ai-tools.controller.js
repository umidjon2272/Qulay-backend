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
exports.AIToolsController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const ai_tool_execution_service_1 = require("./ai-tool-execution.service");
const ai_tool_registry_service_1 = require("./ai-tool-registry.service");
const execute_tool_dto_1 = require("./dto/execute-tool.dto");
let AIToolsController = class AIToolsController {
    constructor(registry, execution) {
        this.registry = registry;
        this.execution = execution;
    }
    list() {
        return this.registry.listMetadata();
    }
    execute(user, request) {
        return this.execution.execute(user.sub, request);
    }
};
exports.AIToolsController = AIToolsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AIToolsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('execute'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, execute_tool_dto_1.ExecuteToolDto]),
    __metadata("design:returntype", void 0)
], AIToolsController.prototype, "execute", null);
exports.AIToolsController = AIToolsController = __decorate([
    (0, common_1.Controller)('ai/tools'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [ai_tool_registry_service_1.AIToolRegistryService,
        ai_tool_execution_service_1.AIToolExecutionService])
], AIToolsController);
//# sourceMappingURL=ai-tools.controller.js.map