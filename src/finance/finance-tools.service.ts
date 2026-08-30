import { Injectable } from '@nestjs/common';
import { FinanceCurrency, FinanceTransactionType } from '@prisma/client';
import { FinanceService } from './finance.service';
import { FinanceBudgetService } from './finance-budget.service';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto';

/** Controller-independent finance primitives for a future AI/tool layer. */
@Injectable()
export class FinanceToolsService {
  constructor(
    private readonly financeService: FinanceService,
    private readonly financeBudgetService: FinanceBudgetService,
  ) {}

  getBudgetStatus(userId: string, monthKey: string | undefined, currency: FinanceCurrency) {
    return this.financeBudgetService.getBudgetStatus(userId, monthKey, currency);
  }

  getCashflowForecast(userId: string, currency: FinanceCurrency) {
    return this.financeBudgetService.getCashflowForecast(userId, currency);
  }

  getTodayFinance(userId: string, currency?: FinanceCurrency) {
    return this.financeService.getTodayForUser(userId, currency);
  }

  getPeriodSummary(userId: string, from: Date, to: Date, currency?: FinanceCurrency) {
    return this.financeService.getPeriodSummary(userId, from, to, currency);
  }

  getTopExpenses(userId: string, from: Date, to: Date, currency?: FinanceCurrency) {
    return this.financeService.getCategoryBreakdown(userId, FinanceTransactionType.EXPENSE, from, to, currency);
  }

  compareFinancePeriods(userId: string, currentFrom: Date, currentTo: Date, previousFrom: Date, previousTo: Date, currency?: FinanceCurrency) {
    return this.financeService.comparePeriods(userId, currentFrom, currentTo, previousFrom, previousTo, currency);
  }

  createFinanceTransactionForUser(userId: string, dto: CreateFinanceTransactionDto) {
    return this.financeService.createForUser(userId, dto);
  }
}
