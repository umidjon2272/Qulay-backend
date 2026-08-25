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
exports.AIToolExecutionService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const ai_tool_registry_service_1 = require("./ai-tool-registry.service");
let AIToolExecutionService = class AIToolExecutionService {
    constructor(registry) {
        this.registry = registry;
    }
    async execute(userId, request, contextOptions = {}) {
        const tool = this.registry.get(request.tool);
        const context = {
            userId,
            requestId: request.requestId ?? contextOptions.requestId ?? (0, crypto_1.randomUUID)(),
            idempotencyKey: request.idempotencyKey,
            locale: contextOptions.locale ?? 'en',
            timezone: contextOptions.timezone,
            source: 'AI_TOOL',
        };
        const input = await tool.validate(request.input);
        await tool.authorize?.(context, input);
        if (tool.requiresConfirmation && !request.confirmed) {
            const preview = await tool.preview?.(context, input);
            return { status: 'confirmation_required', tool: tool.name, preview: preview ?? input, meta: { requestId: context.requestId } };
        }
        const data = await tool.execute(context, input);
        if (tool.sideEffect === 'WRITE')
            await this.registry.recordWriteExecution(tool.name, userId, data);
        return { status: 'success', tool: tool.name, data, meta: { executedAt: new Date().toISOString(), requestId: context.requestId } };
    }
};
exports.AIToolExecutionService = AIToolExecutionService;
exports.AIToolExecutionService = AIToolExecutionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ai_tool_registry_service_1.AIToolRegistryService])
], AIToolExecutionService);
//# sourceMappingURL=ai-tool-execution.service.js.map