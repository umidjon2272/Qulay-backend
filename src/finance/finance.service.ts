import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinanceCategoryType, FinanceCurrency, FinanceTransactionType, Prisma } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { assertDateKey, dateKeyInTimezone, parseDateTime, utcDayRange, zonedDayRange } from '../common/date.utils';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinanceCategoryDto } from './dto/create-finance-category.dto';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto';
import { FinanceCategoryQueryDto } from './dto/finance-category-query.dto';
import { DATE_ONLY_PATTERN, DATE_TIME_WITH_ZONE_PATTERN, FINANCE_AMOUNT_PATTERN } from './dto/finance-validation';
import { FinanceSummaryQueryDto } from './dto/finance-summary-query.dto';
import { FinanceTransactionQueryDto } from './dto/transaction-query.dto';
import { UpdateFinanceCategoryDto } from './dto/update-finance-category.dto';
import { UpdateFinanceTransactionDto } from './dto/update-finance-transaction.dto';

const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; type: FinanceCategoryType }> = [
  { name: 'Reklama', type: FinanceCategoryType.EXPENSE },
  { name: 'Transport', type: FinanceCategoryType.EXPENSE },
  { name: 'Ish haqi', type: FinanceCategoryType.EXPENSE },
  { name: 'Ofis', type: FinanceCategoryType.EXPENSE },
  { name: 'Soliq', type: FinanceCategoryType.EXPENSE },
  { name: 'Boshqa', type: FinanceCategoryType.EXPENSE },
  { name: 'Savdo', type: FinanceCategoryType.INCOME },
  { name: 'Xizmat', type: FinanceCategoryType.INCOME },
  { name: 'Investitsiya', type: FinanceCategoryType.INCOME },
  { name: 'Boshqa', type: FinanceCategoryType.INCOME },
];

type Period = { from: Date; to: Date };
type TransactionInclude = {
  category: { select: { id: true; name: true; type: true; icon: true; color: true } };
  contact: { select: { id: true; displayName: true } };
};

@Injectable()
export class FinanceService {
  private readonly transactionInclude: TransactionInclude = {
    category: { select: { id: true, name: true, type: true, icon: true, color: true } },
    contact: { select: { id: true, displayName: true } },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async listTransactionsForUser(userId: string, query: FinanceTransactionQueryDto) {
    const period = this.parseOptionalPeriod(query.from, query.to);
    const amount: Prisma.DecimalFilter = {};
    const minAmount = query.minAmount === undefined ? undefined : this.toDecimal(query.minAmount, 'minAmount');
    const maxAmount = query.maxAmount === undefined ? undefined : this.toDecimal(query.maxAmount, 'maxAmount');
    if (minAmount) amount.gte = minAmount;
    if (maxAmount) amount.lte = maxAmount;
    if (minAmount && maxAmount && minAmount.gt(maxAmount)) {
      throw new BadRequestException('minAmount cannot be greater than maxAmount');
    }
    const search = query.search?.trim();
    const where: Prisma.FinanceTransactionWhereInput = {
      userId,
      type: query.type,
      categoryId: query.categoryId,
      currency: query.currency,
      amount: Object.keys(amount).length ? amount : undefined,
      transactionDate: period ? { gte: period.from, lt: period.to } : undefined,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { source: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.financeTransaction.findMany({
        where,
        include: this.transactionInclude,
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.financeTransaction.count({ where }),
    ]);
    return {
      items: items.map((item) => this.serializeTransaction(item)),
      meta: paginationMeta(query.page, query.limit, total),
    };
  }

  async getTransactionForUser(userId: string, id: string) {
    const transaction = await this.prisma.financeTransaction.findFirst({
      where: { id, userId },
      include: this.transactionInclude,
    });
    if (!transaction) throw new NotFoundException('Finance transaction was not found');
    return this.serializeTransaction(transaction);
  }

  async createForUser(userId: string, dto: CreateFinanceTransactionDto) {
    const category = await this.validateCategory(userId, dto.categoryId, dto.type);
    await this.validateContact(userId, dto.contactId);
    const amount = this.toPositiveDecimal(dto.amount);
    const transaction = await this.prisma.financeTransaction.create({
      data: {
        userId,
        type: dto.type,
        amount,
        currency: dto.currency,
        categoryId: category?.id,
        title: dto.title,
        description: dto.description,
        transactionDate: this.parseTransactionDate(dto.transactionDate),
        contactId: dto.contactId,
        source: dto.source,
      },
      include: this.transactionInclude,
    });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.FINANCE_TRANSACTION_CREATED,
      entityType: 'FINANCE_TRANSACTION',
      entityId: transaction.id,
      metadata: { type: transaction.type, currency: transaction.currency, categoryId: transaction.categoryId ?? null },
    });
    return this.serializeTransaction(transaction);
  }

  async updateForUser(userId: string, id: string, dto: UpdateFinanceTransactionDto) {
    const current = await this.getOwnedTransaction(userId, id);
    const type = dto.type ?? current.type;
    const category = dto.categoryId === undefined
      ? current.categoryId
        ? await this.validateCategory(userId, current.categoryId, type)
        : null
      : await this.validateCategory(userId, dto.categoryId, type);
    await this.validateContact(userId, dto.contactId);
    const transaction = await this.prisma.financeTransaction.update({
      where: { id: current.id },
      data: {
        type: dto.type,
        amount: dto.amount === undefined ? undefined : this.toPositiveDecimal(dto.amount),
        currency: dto.currency,
        categoryId: category?.id ?? (dto.categoryId === undefined ? undefined : null),
        title: dto.title,
        description: dto.description,
        transactionDate: dto.transactionDate ? this.parseTransactionDate(dto.transactionDate) : undefined,
        contactId: dto.contactId === undefined ? undefined : dto.contactId,
        source: dto.source,
      },
      include: this.transactionInclude,
    });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.FINANCE_TRANSACTION_UPDATED,
      entityType: 'FINANCE_TRANSACTION',
      entityId: transaction.id,
      metadata: { type: transaction.type, currency: transaction.currency },
    });
    return this.serializeTransaction(transaction);
  }

  async deleteForUser(userId: string, id: string): Promise<{ message: string }> {
    const transaction = await this.getOwnedTransaction(userId, id);
    await this.prisma.financeTransaction.delete({ where: { id: transaction.id } });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.FINANCE_TRANSACTION_DELETED,
      entityType: 'FINANCE_TRANSACTION',
      entityId: transaction.id,
    });
    return { message: 'Finance transaction deleted successfully' };
  }

  async listCategoriesForUser(userId: string, query: FinanceCategoryQueryDto) {
    await this.ensureDefaultCategories(userId);
    return this.prisma.financeCategory.findMany({
      where: { userId, type: query.type },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategoryForUser(userId: string, dto: CreateFinanceCategoryDto) {
    await this.ensureDefaultCategories(userId);
    try {
      const category = await this.prisma.financeCategory.create({
        data: { userId, name: dto.name, type: dto.type, icon: dto.icon, color: dto.color },
      });
      await this.activityLog.record({
        userId,
        action: ACTIVITY_ACTIONS.FINANCE_CATEGORY_CREATED,
        entityType: 'FINANCE_CATEGORY',
        entityId: category.id,
        metadata: { type: category.type },
      });
      return category;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Finance category already exists');
      }
      throw error;
    }
  }

  async updateCategoryForUser(userId: string, id: string, dto: UpdateFinanceCategoryDto) {
    const current = await this.getCategoryForUser(userId, id);
    try {
      const category = await this.prisma.financeCategory.update({
        where: { id: current.id },
        data: { name: dto.name, type: dto.type, icon: dto.icon, color: dto.color },
      });
      await this.activityLog.record({
        userId,
        action: ACTIVITY_ACTIONS.FINANCE_CATEGORY_UPDATED,
        entityType: 'FINANCE_CATEGORY',
        entityId: category.id,
        metadata: { type: category.type },
      });
      return category;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Finance category already exists');
      }
      throw error;
    }
  }

  async deleteCategoryForUser(userId: string, id: string): Promise<{ message: string }> {
    const category = await this.getCategoryForUser(userId, id);
    await this.prisma.$transaction([
      this.prisma.financeTransaction.updateMany({ where: { userId, categoryId: category.id }, data: { categoryId: null } }),
      this.prisma.financeCategory.delete({ where: { id: category.id } }),
    ]);
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.FINANCE_CATEGORY_DELETED,
      entityType: 'FINANCE_CATEGORY',
      entityId: category.id,
    });
    return { message: 'Finance category deleted successfully; linked transactions were uncategorized' };
  }

  async getSummaryForUser(userId: string, query: FinanceSummaryQueryDto) {
    const period = this.parseSummaryPeriod(query.from, query.to);
    return this.getPeriodSummary(userId, period.from, period.to, query.currency);
  }

  async getPeriodSummary(userId: string, from: Date, to: Date, currency?: FinanceCurrency) {
    const resolvedCurrency = await this.resolveCurrency(userId, { from, to }, currency);
    const where: Prisma.FinanceTransactionWhereInput = {
      userId,
      transactionDate: { gte: from, lt: to },
      currency: resolvedCurrency ?? undefined,
    };
    const grouped = await this.prisma.financeTransaction.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
    const incomeRow = grouped.find((row) => row.type === FinanceTransactionType.INCOME);
    const expenseRow = grouped.find((row) => row.type === FinanceTransactionType.EXPENSE);
    const totalIncome = this.decimal(incomeRow?._sum.amount);
    const totalExpense = this.decimal(expenseRow?._sum.amount);
    const breakdownCurrency = resolvedCurrency ?? undefined;
    const topExpenseCategories = await this.getCategoryBreakdown(userId, FinanceTransactionType.EXPENSE, from, to, breakdownCurrency);
    const topIncomeCategories = await this.getCategoryBreakdown(userId, FinanceTransactionType.INCOME, from, to, breakdownCurrency);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      currency: resolvedCurrency,
      totalIncome: this.formatDecimal(totalIncome),
      totalExpense: this.formatDecimal(totalExpense),
      netProfit: this.formatDecimal(totalIncome.minus(totalExpense)),
      transactionCount: (incomeRow?._count._all ?? 0) + (expenseRow?._count._all ?? 0),
      incomeCount: incomeRow?._count._all ?? 0,
      expenseCount: expenseRow?._count._all ?? 0,
      topExpenseCategories: topExpenseCategories.slice(0, 5),
      topIncomeCategories: topIncomeCategories.slice(0, 5),
    };
  }

  async getTodayForUser(userId: string, currency?: FinanceCurrency) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    if (!user) throw new NotFoundException('User was not found');
    const today = dateKeyInTimezone(new Date(), user.timezone);
    const period = zonedDayRange(today, user.timezone);
    const summary = await this.getPeriodSummary(userId, period.start, period.end, currency);
    const recentTransactions = await this.prisma.financeTransaction.findMany({
      where: { userId, transactionDate: { gte: period.start, lt: period.end }, currency: currency ?? undefined },
      include: this.transactionInclude,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    });
    return {
      date: today,
      timezone: user.timezone,
      todayIncome: summary.totalIncome,
      todayExpense: summary.totalExpense,
      todayProfit: summary.netProfit,
      recentTransactions: recentTransactions.map((item) => this.serializeTransaction(item)),
    };
  }

  async comparePeriods(
    userId: string,
    currentFrom: Date,
    currentTo: Date,
    previousFrom: Date,
    previousTo: Date,
    currency?: FinanceCurrency,
  ) {
    const resolvedCurrency = await this.resolveCurrency(userId, { from: currentFrom, to: currentTo }, currency, { from: previousFrom, to: previousTo });
    const [current, previous] = await Promise.all([
      this.aggregateTotals(userId, { from: currentFrom, to: currentTo }, resolvedCurrency),
      this.aggregateTotals(userId, { from: previousFrom, to: previousTo }, resolvedCurrency),
    ]);
    const incomeDifference = current.income.minus(previous.income);
    const expenseDifference = current.expense.minus(previous.expense);
    const profitDifference = current.profit.minus(previous.profit);
    return {
      currency: resolvedCurrency,
      current: this.comparisonTotals(current),
      previous: this.comparisonTotals(previous),
      incomeDifference: this.formatDecimal(incomeDifference),
      expenseDifference: this.formatDecimal(expenseDifference),
      profitDifference: this.formatDecimal(profitDifference),
      incomePercentageChange: this.percentageChange(current.income, previous.income),
      expensePercentageChange: this.percentageChange(current.expense, previous.expense),
      profitPercentageChange: this.percentageChange(current.profit, previous.profit),
      percentageChange: {
        income: this.percentageChange(current.income, previous.income),
        expense: this.percentageChange(current.expense, previous.expense),
        profit: this.percentageChange(current.profit, previous.profit),
      },
    };
  }

  async getCategoryBreakdown(
    userId: string,
    type: FinanceTransactionType,
    from: Date,
    to: Date,
    currency?: FinanceCurrency,
  ) {
    const resolvedCurrency = await this.resolveCurrency(userId, { from, to }, currency);
    const where: Prisma.FinanceTransactionWhereInput = {
      userId,
      type,
      transactionDate: { gte: from, lt: to },
      currency: resolvedCurrency ?? undefined,
    };
    const rows = await this.prisma.financeTransaction.groupBy({
      by: ['categoryId'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
    });
    const categoryIds = rows.flatMap((row) => (row.categoryId ? [row.categoryId] : []));
    const categories = categoryIds.length
      ? await this.prisma.financeCategory.findMany({ where: { userId, id: { in: categoryIds } }, select: { id: true, name: true, type: true } })
      : [];
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const total = rows.reduce((sum, row) => sum.plus(this.decimal(row._sum.amount)), new Prisma.Decimal(0));
    return rows.map((row) => {
      const category = row.categoryId ? categoryById.get(row.categoryId) ?? null : null;
      const amount = this.decimal(row._sum.amount);
      return {
        category,
        total: this.formatDecimal(amount),
        transactionCount: row._count._all,
        percentage: total.isZero() ? '0.00' : amount.div(total).times(100).toDecimalPlaces(2).toFixed(2),
      };
    });
  }

  async ensureDefaultCategories(userId: string): Promise<void> {
    for (const defaultCategory of DEFAULT_CATEGORIES) {
      const exists = await this.prisma.financeCategory.findFirst({ where: { userId, ...defaultCategory } });
      if (exists) continue;
      try {
        await this.prisma.financeCategory.create({ data: { userId, ...defaultCategory } });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    }
  }

  private async getOwnedTransaction(userId: string, id: string) {
    const transaction = await this.prisma.financeTransaction.findFirst({ where: { id, userId } });
    if (!transaction) throw new NotFoundException('Finance transaction was not found');
    return transaction;
  }

  private async getCategoryForUser(userId: string, id: string) {
    const category = await this.prisma.financeCategory.findFirst({ where: { id, userId } });
    if (!category) throw new NotFoundException('Finance category was not found');
    return category;
  }

  private async validateCategory(userId: string, categoryId: string | undefined, type: FinanceTransactionType) {
    if (!categoryId) return null;
    const category = await this.getCategoryForUser(userId, categoryId);
    if (category.type !== FinanceCategoryType.BOTH && category.type !== type) {
      throw new BadRequestException('Finance category type does not match transaction type');
    }
    return category;
  }

  private async validateContact(userId: string, contactId: string | undefined): Promise<void> {
    if (!contactId) return;
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, userId }, select: { id: true } });
    if (!contact) throw new NotFoundException('Contact was not found');
  }

  private parseTransactionDate(value: string): Date {
    if (!DATE_TIME_WITH_ZONE_PATTERN.test(value)) throw new BadRequestException('transactionDate must include a timezone offset or Z');
    return parseDateTime(value);
  }

  private parseOptionalPeriod(from?: string, to?: string): Period | undefined {
    if (!from && !to) return undefined;
    const period = this.parsePeriod(from, to);
    return period;
  }

  private parseSummaryPeriod(from?: string, to?: string): Period {
    if (!from && !to) {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { from: start, to: now };
    }
    return this.parsePeriod(from, to);
  }

  private parsePeriod(from?: string, to?: string): Period {
    const now = new Date();
    const parsedFrom = from ? this.parseRangeBoundary(from, false) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const parsedTo = to ? this.parseRangeBoundary(to, true) : now;
    if (parsedFrom >= parsedTo) throw new BadRequestException('from must be before to');
    return { from: parsedFrom, to: parsedTo };
  }

  private parseRangeBoundary(value: string, isEnd: boolean): Date {
    if (DATE_ONLY_PATTERN.test(value)) {
      assertDateKey(value);
      const range = utcDayRange(value);
      return isEnd ? range.end : range.start;
    }
    if (!DATE_TIME_WITH_ZONE_PATTERN.test(value)) throw new BadRequestException('Date-time must include a timezone offset or Z');
    return parseDateTime(value);
  }

  private toDecimal(value: string, field = 'amount'): Prisma.Decimal {
    if (!FINANCE_AMOUNT_PATTERN.test(value)) throw new BadRequestException(`${field} must be a valid decimal amount`);
    try {
      return new Prisma.Decimal(value);
    } catch {
      throw new BadRequestException(`${field} must be a valid decimal amount`);
    }
  }

  private toPositiveDecimal(value: string): Prisma.Decimal {
    const amount = this.toDecimal(value);
    if (amount.lte(0)) throw new BadRequestException('amount must be greater than 0');
    return amount;
  }

  private async resolveCurrency(userId: string, period: Period, currency?: FinanceCurrency, secondPeriod?: Period): Promise<FinanceCurrency | undefined> {
    if (currency) return currency;
    const periods = secondPeriod ? [period, secondPeriod] : [period];
    const currencies = new Set<FinanceCurrency>();
    for (const currentPeriod of periods) {
      const rows = await this.prisma.financeTransaction.findMany({
        where: { userId, transactionDate: { gte: currentPeriod.from, lt: currentPeriod.to } },
        select: { currency: true },
        distinct: ['currency'],
      });
      rows.forEach((row) => currencies.add(row.currency));
    }
    if (currencies.size > 1) throw new BadRequestException('currency query is required when the period contains mixed currencies');
    return currencies.values().next().value as FinanceCurrency | undefined;
  }

  private async aggregateTotals(userId: string, period: Period, currency?: FinanceCurrency) {
    const rows = await this.prisma.financeTransaction.groupBy({
      by: ['type'],
      where: { userId, transactionDate: { gte: period.from, lt: period.to }, currency: currency ?? undefined },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const income = this.decimal(rows.find((row) => row.type === FinanceTransactionType.INCOME)?._sum.amount);
    const expense = this.decimal(rows.find((row) => row.type === FinanceTransactionType.EXPENSE)?._sum.amount);
    return { income, expense, profit: income.minus(expense), incomeCount: rows.find((row) => row.type === FinanceTransactionType.INCOME)?._count._all ?? 0, expenseCount: rows.find((row) => row.type === FinanceTransactionType.EXPENSE)?._count._all ?? 0 };
  }

  private comparisonTotals(totals: { income: Prisma.Decimal; expense: Prisma.Decimal; profit: Prisma.Decimal; incomeCount: number; expenseCount: number }) {
    return {
      income: this.formatDecimal(totals.income),
      expense: this.formatDecimal(totals.expense),
      profit: this.formatDecimal(totals.profit),
      incomeCount: totals.incomeCount,
      expenseCount: totals.expenseCount,
    };
  }

  private percentageChange(current: Prisma.Decimal, previous: Prisma.Decimal): string | null {
    if (previous.isZero()) return current.isZero() ? '0.00' : null;
    return current.minus(previous).div(previous.abs()).times(100).toDecimalPlaces(2).toFixed(2);
  }

  private decimal(value: Prisma.Decimal | null | undefined): Prisma.Decimal {
    return value ? new Prisma.Decimal(value) : new Prisma.Decimal(0);
  }

  private formatDecimal(value: Prisma.Decimal): string {
    return value.toDecimalPlaces(2).toFixed(2);
  }

  private serializeTransaction<T extends { amount: Prisma.Decimal }>(transaction: T) {
    return { ...transaction, amount: this.formatDecimal(transaction.amount) };
  }
}
