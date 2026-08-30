import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinanceCurrency, FinanceTransactionType, Prisma } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from './finance.service';
import { CreateFinanceBudgetDto, UpdateFinanceBudgetDto } from './dto/finance-budget.dto';

const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;
const OVER_BUDGET_THRESHOLD_PERCENT = 90;
const MIN_FORECAST_DISTINCT_DAYS = 3;

const categoryInclude = { category: { select: { id: true, name: true, type: true, icon: true, color: true } } } as const;

@Injectable()
export class FinanceBudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeService: FinanceService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async listForUser(userId: string, monthKey?: string) {
    const resolvedMonthKey = monthKey ?? this.currentMonthKey();
    this.assertMonthKey(resolvedMonthKey);
    const rows = await this.prisma.financeBudget.findMany({
      where: { userId, monthKey: resolvedMonthKey },
      include: categoryInclude,
      orderBy: [{ currency: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.serialize(row));
  }

  async createForUser(userId: string, dto: CreateFinanceBudgetDto) {
    if (dto.categoryId) await this.assertCategoryOwned(userId, dto.categoryId);
    try {
      const budget = await this.prisma.financeBudget.create({
        data: {
          userId,
          categoryId: dto.categoryId ?? null,
          currency: dto.currency,
          monthKey: dto.monthKey,
          amount: new Prisma.Decimal(dto.amount),
        },
        include: categoryInclude,
      });
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.FINANCE_BUDGET_CREATED, entityType: 'FINANCE_BUDGET', entityId: budget.id });
      return this.serialize(budget);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu kategoriya uchun shu oy va valyutada budjet allaqachon mavjud');
      }
      throw error;
    }
  }

  async updateForUser(userId: string, id: string, dto: UpdateFinanceBudgetDto) {
    const current = await this.getOwned(userId, id);
    const updated = await this.prisma.financeBudget.update({
      where: { id: current.id },
      data: { amount: dto.amount === undefined ? undefined : new Prisma.Decimal(dto.amount) },
      include: categoryInclude,
    });
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.FINANCE_BUDGET_UPDATED, entityType: 'FINANCE_BUDGET', entityId: updated.id });
    return this.serialize(updated);
  }

  async deleteForUser(userId: string, id: string): Promise<{ message: string }> {
    const budget = await this.getOwned(userId, id);
    await this.prisma.financeBudget.delete({ where: { id: budget.id } });
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.FINANCE_BUDGET_DELETED, entityType: 'FINANCE_BUDGET', entityId: budget.id });
    return { message: 'Budjet o‘chirildi' };
  }

  /** Deterministic spent-vs-budgeted comparison. No AI, no estimates. */
  async getBudgetStatus(userId: string, monthKey: string | undefined, currency: FinanceCurrency) {
    const resolvedMonthKey = monthKey ?? this.currentMonthKey();
    this.assertMonthKey(resolvedMonthKey);
    const budgets = await this.prisma.financeBudget.findMany({
      where: { userId, monthKey: resolvedMonthKey, currency },
      include: categoryInclude,
    });
    if (budgets.length === 0) return { monthKey: resolvedMonthKey, currency, items: [] };

    const { from, to } = this.monthRange(resolvedMonthKey);
    const [breakdown, summary] = await Promise.all([
      this.financeService.getCategoryBreakdown(userId, FinanceTransactionType.EXPENSE, from, to, currency),
      this.financeService.getPeriodSummary(userId, from, to, currency),
    ]);
    const spentByCategory = new Map(breakdown.filter((row) => row.category).map((row) => [row.category!.id, row.total]));

    const items = budgets.map((budget) => {
      const spentValue = budget.categoryId ? spentByCategory.get(budget.categoryId) ?? '0.00' : summary.totalExpense;
      const spent = new Prisma.Decimal(spentValue);
      const budgeted = new Prisma.Decimal(budget.amount);
      const percentUsed = budgeted.isZero() ? 0 : Number(spent.div(budgeted).times(100).toDecimalPlaces(2));
      return {
        id: budget.id,
        category: budget.category ? { id: budget.category.id, name: budget.category.name } : null,
        budgeted: this.formatDecimal(budgeted),
        spent: this.formatDecimal(spent),
        remaining: this.formatDecimal(budgeted.minus(spent)),
        percentUsed,
        isOverBudget: spent.gt(budgeted),
        isNearLimit: percentUsed >= OVER_BUDGET_THRESHOLD_PERCENT,
      };
    });
    return { monthKey: resolvedMonthKey, currency, items };
  }

  /**
   * Simple linear extrapolation from this month's daily average net profit. Never a
   * guess dressed up as a fact: below MIN_FORECAST_DISTINCT_DAYS of activity this month,
   * returns insufficientData instead of a number.
   */
  async getCashflowForecast(userId: string, currency: FinanceCurrency) {
    const monthKey = this.currentMonthKey();
    const { from, to } = this.monthRange(monthKey);
    const now = new Date();
    const daysInMonth = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    const daysElapsed = Math.min(daysInMonth, Math.max(1, Math.ceil((now.getTime() - from.getTime()) / 86_400_000)));
    const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

    const rows = await this.prisma.financeTransaction.findMany({
      where: { userId, currency, transactionDate: { gte: from, lt: to } },
      select: { transactionDate: true },
    });
    const distinctDayKeys = new Set(rows.map((row) => row.transactionDate.toISOString().slice(0, 10)));
    if (distinctDayKeys.size < MIN_FORECAST_DISTINCT_DAYS) {
      return { monthKey, currency, isForecast: true, insufficientData: true };
    }

    const periodEnd = now < to ? now : to;
    const summary = await this.financeService.getPeriodSummary(userId, from, periodEnd, currency);
    const netProfitSoFar = new Prisma.Decimal(summary.netProfit);
    const dailyAverageNet = netProfitSoFar.div(daysElapsed);
    const forecastEndOfMonth = netProfitSoFar.plus(dailyAverageNet.times(daysRemaining));

    return {
      monthKey,
      currency,
      isForecast: true,
      insufficientData: false,
      daysElapsed,
      daysRemaining,
      netProfitSoFar: this.formatDecimal(netProfitSoFar),
      dailyAverageNet: this.formatDecimal(dailyAverageNet),
      forecastEndOfMonth: this.formatDecimal(forecastEndOfMonth),
    };
  }

  private async getOwned(userId: string, id: string) {
    const budget = await this.prisma.financeBudget.findFirst({ where: { id, userId } });
    if (!budget) throw new NotFoundException('Budjet topilmadi');
    return budget;
  }

  private async assertCategoryOwned(userId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.financeCategory.findFirst({ where: { id: categoryId, userId } });
    if (!category) throw new NotFoundException('Finance category was not found');
  }

  private assertMonthKey(value: string): void {
    if (!MONTH_KEY_PATTERN.test(value)) throw new BadRequestException('monthKey YYYY-MM shaklida bo‘lishi kerak');
  }

  private currentMonthKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private monthRange(monthKey: string): { from: Date; to: Date } {
    const [year, month] = monthKey.split('-').map(Number);
    return { from: new Date(Date.UTC(year, month - 1, 1)), to: new Date(Date.UTC(year, month, 1)) };
  }

  private formatDecimal(value: Prisma.Decimal): string {
    return value.toDecimalPlaces(2).toFixed(2);
  }

  private serialize<T extends { amount: Prisma.Decimal }>(budget: T) {
    return { ...budget, amount: this.formatDecimal(budget.amount) };
  }
}
