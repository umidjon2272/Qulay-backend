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
exports.FinanceService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const date_utils_1 = require("../common/date.utils");
const prisma_service_1 = require("../prisma/prisma.service");
const finance_validation_1 = require("./dto/finance-validation");
const DEFAULT_CATEGORIES = [
    { name: 'Reklama', type: client_1.FinanceCategoryType.EXPENSE },
    { name: 'Transport', type: client_1.FinanceCategoryType.EXPENSE },
    { name: 'Ish haqi', type: client_1.FinanceCategoryType.EXPENSE },
    { name: 'Ofis', type: client_1.FinanceCategoryType.EXPENSE },
    { name: 'Soliq', type: client_1.FinanceCategoryType.EXPENSE },
    { name: 'Boshqa', type: client_1.FinanceCategoryType.EXPENSE },
    { name: 'Savdo', type: client_1.FinanceCategoryType.INCOME },
    { name: 'Xizmat', type: client_1.FinanceCategoryType.INCOME },
    { name: 'Investitsiya', type: client_1.FinanceCategoryType.INCOME },
    { name: 'Boshqa', type: client_1.FinanceCategoryType.INCOME },
];
let FinanceService = class FinanceService {
    constructor(prisma, activityLog) {
        this.prisma = prisma;
        this.activityLog = activityLog;
        this.transactionInclude = {
            category: { select: { id: true, name: true, type: true, icon: true, color: true } },
            contact: { select: { id: true, displayName: true } },
        };
    }
    async listTransactionsForUser(userId, query) {
        const period = this.parseOptionalPeriod(query.from, query.to);
        const amount = {};
        const minAmount = query.minAmount === undefined ? undefined : this.toDecimal(query.minAmount, 'minAmount');
        const maxAmount = query.maxAmount === undefined ? undefined : this.toDecimal(query.maxAmount, 'maxAmount');
        if (minAmount)
            amount.gte = minAmount;
        if (maxAmount)
            amount.lte = maxAmount;
        if (minAmount && maxAmount && minAmount.gt(maxAmount)) {
            throw new common_1.BadRequestException('minAmount cannot be greater than maxAmount');
        }
        const search = query.search?.trim();
        const where = {
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
                skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit),
                take: query.limit,
            }),
            this.prisma.financeTransaction.count({ where }),
        ]);
        return {
            items: items.map((item) => this.serializeTransaction(item)),
            meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total),
        };
    }
    async getTransactionForUser(userId, id) {
        const transaction = await this.prisma.financeTransaction.findFirst({
            where: { id, userId },
            include: this.transactionInclude,
        });
        if (!transaction)
            throw new common_1.NotFoundException('Finance transaction was not found');
        return this.serializeTransaction(transaction);
    }
    async createForUser(userId, dto) {
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
            action: activity_log_service_1.ACTIVITY_ACTIONS.FINANCE_TRANSACTION_CREATED,
            entityType: 'FINANCE_TRANSACTION',
            entityId: transaction.id,
            metadata: { type: transaction.type, currency: transaction.currency, categoryId: transaction.categoryId ?? null },
        });
        return this.serializeTransaction(transaction);
    }
    async updateForUser(userId, id, dto) {
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
            action: activity_log_service_1.ACTIVITY_ACTIONS.FINANCE_TRANSACTION_UPDATED,
            entityType: 'FINANCE_TRANSACTION',
            entityId: transaction.id,
            metadata: { type: transaction.type, currency: transaction.currency },
        });
        return this.serializeTransaction(transaction);
    }
    async deleteForUser(userId, id) {
        const transaction = await this.getOwnedTransaction(userId, id);
        await this.prisma.financeTransaction.delete({ where: { id: transaction.id } });
        await this.activityLog.record({
            userId,
            action: activity_log_service_1.ACTIVITY_ACTIONS.FINANCE_TRANSACTION_DELETED,
            entityType: 'FINANCE_TRANSACTION',
            entityId: transaction.id,
        });
        return { message: 'Finance transaction deleted successfully' };
    }
    async listCategoriesForUser(userId, query) {
        await this.ensureDefaultCategories(userId);
        return this.prisma.financeCategory.findMany({
            where: { userId, type: query.type },
            orderBy: [{ type: 'asc' }, { name: 'asc' }],
        });
    }
    async createCategoryForUser(userId, dto) {
        await this.ensureDefaultCategories(userId);
        try {
            const category = await this.prisma.financeCategory.create({
                data: { userId, name: dto.name, type: dto.type, icon: dto.icon, color: dto.color },
            });
            await this.activityLog.record({
                userId,
                action: activity_log_service_1.ACTIVITY_ACTIONS.FINANCE_CATEGORY_CREATED,
                entityType: 'FINANCE_CATEGORY',
                entityId: category.id,
                metadata: { type: category.type },
            });
            return category;
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new common_1.ConflictException('Finance category already exists');
            }
            throw error;
        }
    }
    async updateCategoryForUser(userId, id, dto) {
        const current = await this.getCategoryForUser(userId, id);
        try {
            const category = await this.prisma.financeCategory.update({
                where: { id: current.id },
                data: { name: dto.name, type: dto.type, icon: dto.icon, color: dto.color },
            });
            await this.activityLog.record({
                userId,
                action: activity_log_service_1.ACTIVITY_ACTIONS.FINANCE_CATEGORY_UPDATED,
                entityType: 'FINANCE_CATEGORY',
                entityId: category.id,
                metadata: { type: category.type },
            });
            return category;
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new common_1.ConflictException('Finance category already exists');
            }
            throw error;
        }
    }
    async deleteCategoryForUser(userId, id) {
        const category = await this.getCategoryForUser(userId, id);
        await this.prisma.$transaction([
            this.prisma.financeTransaction.updateMany({ where: { userId, categoryId: category.id }, data: { categoryId: null } }),
            this.prisma.financeCategory.delete({ where: { id: category.id } }),
        ]);
        await this.activityLog.record({
            userId,
            action: activity_log_service_1.ACTIVITY_ACTIONS.FINANCE_CATEGORY_DELETED,
            entityType: 'FINANCE_CATEGORY',
            entityId: category.id,
        });
        return { message: 'Finance category deleted successfully; linked transactions were uncategorized' };
    }
    async getSummaryForUser(userId, query) {
        const period = this.parseSummaryPeriod(query.from, query.to);
        return this.getPeriodSummary(userId, period.from, period.to, query.currency);
    }
    async getPeriodSummary(userId, from, to, currency) {
        const resolvedCurrency = await this.resolveCurrency(userId, { from, to }, currency);
        const where = {
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
        const incomeRow = grouped.find((row) => row.type === client_1.FinanceTransactionType.INCOME);
        const expenseRow = grouped.find((row) => row.type === client_1.FinanceTransactionType.EXPENSE);
        const totalIncome = this.decimal(incomeRow?._sum.amount);
        const totalExpense = this.decimal(expenseRow?._sum.amount);
        const breakdownCurrency = resolvedCurrency ?? undefined;
        const topExpenseCategories = await this.getCategoryBreakdown(userId, client_1.FinanceTransactionType.EXPENSE, from, to, breakdownCurrency);
        const topIncomeCategories = await this.getCategoryBreakdown(userId, client_1.FinanceTransactionType.INCOME, from, to, breakdownCurrency);
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
    async getTodayForUser(userId, currency) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
        if (!user)
            throw new common_1.NotFoundException('User was not found');
        const today = (0, date_utils_1.dateKeyInTimezone)(new Date(), user.timezone);
        const period = (0, date_utils_1.zonedDayRange)(today, user.timezone);
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
    async comparePeriods(userId, currentFrom, currentTo, previousFrom, previousTo, currency) {
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
    async getCategoryBreakdown(userId, type, from, to, currency) {
        const resolvedCurrency = await this.resolveCurrency(userId, { from, to }, currency);
        const where = {
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
        const total = rows.reduce((sum, row) => sum.plus(this.decimal(row._sum.amount)), new client_1.Prisma.Decimal(0));
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
    async ensureDefaultCategories(userId) {
        for (const defaultCategory of DEFAULT_CATEGORIES) {
            const exists = await this.prisma.financeCategory.findFirst({ where: { userId, ...defaultCategory } });
            if (exists)
                continue;
            try {
                await this.prisma.financeCategory.create({ data: { userId, ...defaultCategory } });
            }
            catch (error) {
                if (!(error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
                    throw error;
            }
        }
    }
    async getOwnedTransaction(userId, id) {
        const transaction = await this.prisma.financeTransaction.findFirst({ where: { id, userId } });
        if (!transaction)
            throw new common_1.NotFoundException('Finance transaction was not found');
        return transaction;
    }
    async getCategoryForUser(userId, id) {
        const category = await this.prisma.financeCategory.findFirst({ where: { id, userId } });
        if (!category)
            throw new common_1.NotFoundException('Finance category was not found');
        return category;
    }
    async validateCategory(userId, categoryId, type) {
        if (!categoryId)
            return null;
        const category = await this.getCategoryForUser(userId, categoryId);
        if (category.type !== client_1.FinanceCategoryType.BOTH && category.type !== type) {
            throw new common_1.BadRequestException('Finance category type does not match transaction type');
        }
        return category;
    }
    async validateContact(userId, contactId) {
        if (!contactId)
            return;
        const contact = await this.prisma.contact.findFirst({ where: { id: contactId, userId }, select: { id: true } });
        if (!contact)
            throw new common_1.NotFoundException('Contact was not found');
    }
    parseTransactionDate(value) {
        if (!finance_validation_1.DATE_TIME_WITH_ZONE_PATTERN.test(value))
            throw new common_1.BadRequestException('transactionDate must include a timezone offset or Z');
        return (0, date_utils_1.parseDateTime)(value);
    }
    parseOptionalPeriod(from, to) {
        if (!from && !to)
            return undefined;
        const period = this.parsePeriod(from, to);
        return period;
    }
    parseSummaryPeriod(from, to) {
        if (!from && !to) {
            const now = new Date();
            const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
            return { from: start, to: now };
        }
        return this.parsePeriod(from, to);
    }
    parsePeriod(from, to) {
        const now = new Date();
        const parsedFrom = from ? this.parseRangeBoundary(from, false) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const parsedTo = to ? this.parseRangeBoundary(to, true) : now;
        if (parsedFrom >= parsedTo)
            throw new common_1.BadRequestException('from must be before to');
        return { from: parsedFrom, to: parsedTo };
    }
    parseRangeBoundary(value, isEnd) {
        if (finance_validation_1.DATE_ONLY_PATTERN.test(value)) {
            (0, date_utils_1.assertDateKey)(value);
            const range = (0, date_utils_1.utcDayRange)(value);
            return isEnd ? range.end : range.start;
        }
        if (!finance_validation_1.DATE_TIME_WITH_ZONE_PATTERN.test(value))
            throw new common_1.BadRequestException('Date-time must include a timezone offset or Z');
        return (0, date_utils_1.parseDateTime)(value);
    }
    toDecimal(value, field = 'amount') {
        if (!finance_validation_1.FINANCE_AMOUNT_PATTERN.test(value))
            throw new common_1.BadRequestException(`${field} must be a valid decimal amount`);
        try {
            return new client_1.Prisma.Decimal(value);
        }
        catch {
            throw new common_1.BadRequestException(`${field} must be a valid decimal amount`);
        }
    }
    toPositiveDecimal(value) {
        const amount = this.toDecimal(value);
        if (amount.lte(0))
            throw new common_1.BadRequestException('amount must be greater than 0');
        return amount;
    }
    async resolveCurrency(userId, period, currency, secondPeriod) {
        if (currency)
            return currency;
        const periods = secondPeriod ? [period, secondPeriod] : [period];
        const currencies = new Set();
        for (const currentPeriod of periods) {
            const rows = await this.prisma.financeTransaction.findMany({
                where: { userId, transactionDate: { gte: currentPeriod.from, lt: currentPeriod.to } },
                select: { currency: true },
                distinct: ['currency'],
            });
            rows.forEach((row) => currencies.add(row.currency));
        }
        if (currencies.size > 1)
            throw new common_1.BadRequestException('currency query is required when the period contains mixed currencies');
        return currencies.values().next().value;
    }
    async aggregateTotals(userId, period, currency) {
        const rows = await this.prisma.financeTransaction.groupBy({
            by: ['type'],
            where: { userId, transactionDate: { gte: period.from, lt: period.to }, currency: currency ?? undefined },
            _sum: { amount: true },
            _count: { _all: true },
        });
        const income = this.decimal(rows.find((row) => row.type === client_1.FinanceTransactionType.INCOME)?._sum.amount);
        const expense = this.decimal(rows.find((row) => row.type === client_1.FinanceTransactionType.EXPENSE)?._sum.amount);
        return { income, expense, profit: income.minus(expense), incomeCount: rows.find((row) => row.type === client_1.FinanceTransactionType.INCOME)?._count._all ?? 0, expenseCount: rows.find((row) => row.type === client_1.FinanceTransactionType.EXPENSE)?._count._all ?? 0 };
    }
    comparisonTotals(totals) {
        return {
            income: this.formatDecimal(totals.income),
            expense: this.formatDecimal(totals.expense),
            profit: this.formatDecimal(totals.profit),
            incomeCount: totals.incomeCount,
            expenseCount: totals.expenseCount,
        };
    }
    percentageChange(current, previous) {
        if (previous.isZero())
            return current.isZero() ? '0.00' : null;
        return current.minus(previous).div(previous.abs()).times(100).toDecimalPlaces(2).toFixed(2);
    }
    decimal(value) {
        return value ? new client_1.Prisma.Decimal(value) : new client_1.Prisma.Decimal(0);
    }
    formatDecimal(value) {
        return value.toDecimalPlaces(2).toFixed(2);
    }
    serializeTransaction(transaction) {
        return { ...transaction, amount: this.formatDecimal(transaction.amount) };
    }
};
exports.FinanceService = FinanceService;
exports.FinanceService = FinanceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_log_service_1.ActivityLogService])
], FinanceService);
//# sourceMappingURL=finance.service.js.map