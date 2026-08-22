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
exports.PaginationQueryDto = exports.MAX_PAGE_SIZE = void 0;
exports.paginationMeta = paginationMeta;
exports.paginationSkip = paginationSkip;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
exports.MAX_PAGE_SIZE = 100;
class PaginationQueryDto {
    constructor() {
        this.page = 1;
        this.limit = 20;
    }
}
exports.PaginationQueryDto = PaginationQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Object)
], PaginationQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(exports.MAX_PAGE_SIZE),
    __metadata("design:type", Object)
], PaginationQueryDto.prototype, "limit", void 0);
function paginationMeta(page, limit, total) {
    return {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
}
function paginationSkip(page, limit) {
    return (page - 1) * limit;
}
//# sourceMappingURL=pagination-query.dto.js.map