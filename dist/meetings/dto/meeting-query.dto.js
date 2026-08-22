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
exports.MeetingQueryDto = void 0;
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const pagination_query_dto_1 = require("../../common/dto/pagination-query.dto");
const dateTimeWithTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/;
class MeetingQueryDto extends pagination_query_dto_1.PaginationQueryDto {
}
exports.MeetingQueryDto = MeetingQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{4}-\d{2}-\d{2}$/),
    __metadata("design:type", String)
], MeetingQueryDto.prototype, "date", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone, { message: 'from must include a timezone offset or Z' }),
    __metadata("design:type", String)
], MeetingQueryDto.prototype, "from", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone, { message: 'to must include a timezone offset or Z' }),
    __metadata("design:type", String)
], MeetingQueryDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.MeetingStatus),
    __metadata("design:type", String)
], MeetingQueryDto.prototype, "status", void 0);
//# sourceMappingURL=meeting-query.dto.js.map