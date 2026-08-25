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
exports.FinanceTransactionQueryDto = void 0;
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const pagination_query_dto_1 = require("../../common/dto/pagination-query.dto");
const finance_validation_1 = require("./finance-validation");
class FinanceTransactionQueryDto extends pagination_query_dto_1.PaginationQueryDto {
}
exports.FinanceTransactionQueryDto = FinanceTransactionQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.FinanceTransactionType),
    __metadata("design:type", String)
], FinanceTransactionQueryDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], FinanceTransactionQueryDto.prototype, "categoryId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: false }),
    __metadata("design:type", String)
], FinanceTransactionQueryDto.prototype, "from", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: false }),
    __metadata("design:type", String)
], FinanceTransactionQueryDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], FinanceTransactionQueryDto.prototype, "search", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDecimal)({ decimal_digits: '0,2' }),
    (0, class_validator_1.Matches)(finance_validation_1.FINANCE_AMOUNT_PATTERN),
    __metadata("design:type", String)
], FinanceTransactionQueryDto.prototype, "minAmount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDecimal)({ decimal_digits: '0,2' }),
    (0, class_validator_1.Matches)(finance_validation_1.FINANCE_AMOUNT_PATTERN),
    __metadata("design:type", String)
], FinanceTransactionQueryDto.prototype, "maxAmount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.FinanceCurrency),
    __metadata("design:type", String)
], FinanceTransactionQueryDto.prototype, "currency", void 0);
//# sourceMappingURL=transaction-query.dto.js.map