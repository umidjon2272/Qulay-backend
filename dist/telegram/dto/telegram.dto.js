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
exports.SendTelegramMessageDto = exports.TelegramChatsQueryDto = exports.TelegramSearchQueryDto = exports.VerifyTelegramPasswordDto = exports.VerifyTelegramCodeDto = exports.ConnectTelegramDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const phonePattern = /^\+[1-9]\d{7,14}$/;
class ConnectTelegramDto {
}
exports.ConnectTelegramDto = ConnectTelegramDto;
__decorate([
    (0, class_transformer_1.Transform)(({ value }) => (typeof value === 'string' ? value.trim() : value)),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(phonePattern, { message: 'phoneNumber must be a valid international phone number' }),
    __metadata("design:type", String)
], ConnectTelegramDto.prototype, "phoneNumber", void 0);
class VerifyTelegramCodeDto {
}
exports.VerifyTelegramCodeDto = VerifyTelegramCodeDto;
__decorate([
    (0, class_transformer_1.Transform)(({ value }) => (typeof value === 'string' ? value.trim() : value)),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{3,8}$/, { message: 'code must contain only 3 to 8 digits' }),
    __metadata("design:type", String)
], VerifyTelegramCodeDto.prototype, "code", void 0);
class VerifyTelegramPasswordDto {
}
exports.VerifyTelegramPasswordDto = VerifyTelegramPasswordDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], VerifyTelegramPasswordDto.prototype, "password", void 0);
class TelegramSearchQueryDto {
    constructor() {
        this.limit = 10;
    }
}
exports.TelegramSearchQueryDto = TelegramSearchQueryDto;
__decorate([
    (0, class_transformer_1.Transform)(({ value }) => (typeof value === 'string' ? value.trim() : value)),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], TelegramSearchQueryDto.prototype, "q", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(20),
    __metadata("design:type", Object)
], TelegramSearchQueryDto.prototype, "limit", void 0);
class TelegramChatsQueryDto {
    constructor() {
        this.limit = 10;
    }
}
exports.TelegramChatsQueryDto = TelegramChatsQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => (typeof value === 'string' ? value.trim() : value)),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], TelegramChatsQueryDto.prototype, "search", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(20),
    __metadata("design:type", Object)
], TelegramChatsQueryDto.prototype, "limit", void 0);
class SendTelegramMessageDto {
}
exports.SendTelegramMessageDto = SendTelegramMessageDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SendTelegramMessageDto.prototype, "peerId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(4096),
    __metadata("design:type", String)
], SendTelegramMessageDto.prototype, "text", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SendTelegramMessageDto.prototype, "confirmed", void 0);
//# sourceMappingURL=telegram.dto.js.map