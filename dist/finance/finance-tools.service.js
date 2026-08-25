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
exports.FinanceToolsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const finance_service_1 = require("./finance.service");
let FinanceToolsService = class FinanceToolsService {
    constructor(financeService) {
        this.financeService = financeService;
    }
    getTodayFinance(userId, currency) {
        return this.financeService.getTodayForUser(userId, currency);
    }
    getPeriodSummary(userId, from, to, currency) {
        return this.financeService.getPeriodSummary(userId, from, to, currency);
    }
    getTopExpenses(userId, from, to, currency) {
        return this.financeService.getCategoryBreakdown(userId, client_1.FinanceTransactionType.EXPENSE, from, to, currency);
    }
    compareFinancePeriods(userId, currentFrom, currentTo, previousFrom, previousTo, currency) {
        return this.financeService.comparePeriods(userId, currentFrom, currentTo, previousFrom, previousTo, currency);
    }
    createFinanceTransactionForUser(userId, dto) {
        return this.financeService.createForUser(userId, dto);
    }
};
exports.FinanceToolsService = FinanceToolsService;
exports.FinanceToolsService = FinanceToolsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [finance_service_1.FinanceService])
], FinanceToolsService);
//# sourceMappingURL=finance-tools.service.js.map