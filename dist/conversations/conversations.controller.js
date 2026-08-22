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
exports.ConversationsController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const create_message_dto_1 = require("../messages/dto/create-message.dto");
const message_query_dto_1 = require("../messages/dto/message-query.dto");
const messages_service_1 = require("../messages/messages.service");
const create_conversation_dto_1 = require("./dto/create-conversation.dto");
const conversation_query_dto_1 = require("./dto/conversation-query.dto");
const conversations_service_1 = require("./conversations.service");
let ConversationsController = class ConversationsController {
    constructor(conversationsService, messagesService) {
        this.conversationsService = conversationsService;
        this.messagesService = messagesService;
    }
    list(user, query) {
        return this.conversationsService.listForUser(user.sub, query);
    }
    create(user, dto) {
        return this.conversationsService.createForUser(user.sub, dto);
    }
    listMessages(user, id, query) {
        return this.messagesService.listForConversation(user.sub, id, query);
    }
    addMessage(user, id, dto) {
        return this.messagesService.createForConversation(user.sub, id, dto);
    }
    get(user, id) {
        return this.conversationsService.getForUser(user.sub, id);
    }
    delete(user, id) {
        return this.conversationsService.deleteForUser(user.sub, id);
    }
};
exports.ConversationsController = ConversationsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, conversation_query_dto_1.ConversationQueryDto]),
    __metadata("design:returntype", void 0)
], ConversationsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_conversation_dto_1.CreateConversationDto]),
    __metadata("design:returntype", void 0)
], ConversationsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id/messages'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, message_query_dto_1.MessageQueryDto]),
    __metadata("design:returntype", void 0)
], ConversationsController.prototype, "listMessages", null);
__decorate([
    (0, common_1.Post)(':id/messages'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, create_message_dto_1.CreateMessageDto]),
    __metadata("design:returntype", void 0)
], ConversationsController.prototype, "addMessage", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ConversationsController.prototype, "get", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ConversationsController.prototype, "delete", null);
exports.ConversationsController = ConversationsController = __decorate([
    (0, common_1.Controller)('conversations'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [conversations_service_1.ConversationsService,
        messages_service_1.MessagesService])
], ConversationsController);
//# sourceMappingURL=conversations.controller.js.map