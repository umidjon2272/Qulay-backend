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
exports.FinanceController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const create_finance_category_dto_1 = require("./dto/create-finance-category.dto");
const finance_category_query_dto_1 = require("./dto/finance-category-query.dto");
const finance_summary_query_dto_1 = require("./dto/finance-summary-query.dto");
const transaction_query_dto_1 = require("./dto/transaction-query.dto");
const create_finance_transaction_dto_1 = require("./dto/create-finance-transaction.dto");
const update_finance_category_dto_1 = require("./dto/update-finance-category.dto");
const update_finance_transaction_dto_1 = require("./dto/update-finance-transaction.dto");
const finance_service_1 = require("./finance.service");
let FinanceController = class FinanceController {
    constructor(financeService) {
        this.financeService = financeService;
    }
    listTransactions(user, query) {
        return this.financeService.listTransactionsForUser(user.sub, query);
    }
    getTransaction(user, id) {
        return this.financeService.getTransactionForUser(user.sub, id);
    }
    createTransaction(user, dto) {
        return this.financeService.createForUser(user.sub, dto);
    }
    updateTransaction(user, id, dto) {
        return this.financeService.updateForUser(user.sub, id, dto);
    }
    deleteTransaction(user, id) {
        return this.financeService.deleteForUser(user.sub, id);
    }
    listCategories(user, query) {
        return this.financeService.listCategoriesForUser(user.sub, query);
    }
    createCategory(user, dto) {
        return this.financeService.createCategoryForUser(user.sub, dto);
    }
    updateCategory(user, id, dto) {
        return this.financeService.updateCategoryForUser(user.sub, id, dto);
    }
    deleteCategory(user, id) {
        return this.financeService.deleteCategoryForUser(user.sub, id);
    }
    summary(user, query) {
        return this.financeService.getSummaryForUser(user.sub, query);
    }
    today(user, query) {
        return this.financeService.getTodayForUser(user.sub, query.currency);
    }
};
exports.FinanceController = FinanceController;
__decorate([
    (0, common_1.Get)('transactions'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, transaction_query_dto_1.FinanceTransactionQueryDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "listTransactions", null);
__decorate([
    (0, common_1.Get)('transactions/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "getTransaction", null);
__decorate([
    (0, common_1.Post)('transactions'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_finance_transaction_dto_1.CreateFinanceTransactionDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "createTransaction", null);
__decorate([
    (0, common_1.Patch)('transactions/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_finance_transaction_dto_1.UpdateFinanceTransactionDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "updateTransaction", null);
__decorate([
    (0, common_1.Delete)('transactions/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "deleteTransaction", null);
__decorate([
    (0, common_1.Get)('categories'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_category_query_dto_1.FinanceCategoryQueryDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "listCategories", null);
__decorate([
    (0, common_1.Post)('categories'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_finance_category_dto_1.CreateFinanceCategoryDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "createCategory", null);
__decorate([
    (0, common_1.Patch)('categories/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_finance_category_dto_1.UpdateFinanceCategoryDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "updateCategory", null);
__decorate([
    (0, common_1.Delete)('categories/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "deleteCategory", null);
__decorate([
    (0, common_1.Get)('summary'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_summary_query_dto_1.FinanceSummaryQueryDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)('today'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, finance_summary_query_dto_1.FinanceSummaryQueryDto]),
    __metadata("design:returntype", void 0)
], FinanceController.prototype, "today", null);
exports.FinanceController = FinanceController = __decorate([
    (0, common_1.Controller)('finance'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [finance_service_1.FinanceService])
], FinanceController);
//# sourceMappingURL=finance.controller.js.map