import { FinanceCurrency, FinanceTransactionType, Prisma } from '@prisma/client';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinanceCategoryDto } from './dto/create-finance-category.dto';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto';
import { FinanceCategoryQueryDto } from './dto/finance-category-query.dto';
import { FinanceSummaryQueryDto } from './dto/finance-summary-query.dto';
import { FinanceTransactionQueryDto } from './dto/transaction-query.dto';
import { UpdateFinanceCategoryDto } from './dto/update-finance-category.dto';
import { UpdateFinanceTransactionDto } from './dto/update-finance-transaction.dto';
export declare class FinanceService {
    private readonly prisma;
    private readonly activityLog;
    private readonly transactionInclude;
    constructor(prisma: PrismaService, activityLog: ActivityLogService);
    listTransactionsForUser(userId: string, query: FinanceTransactionQueryDto): Promise<{
        items: ({
            contact: {
                id: string;
                displayName: string;
            } | null;
            category: {
                id: string;
                name: string;
                type: import(".prisma/client").$Enums.FinanceCategoryType;
                icon: string | null;
                color: string | null;
            } | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            type: import(".prisma/client").$Enums.FinanceTransactionType;
            title: string;
            description: string | null;
            contactId: string | null;
            source: string | null;
            currency: import(".prisma/client").$Enums.FinanceCurrency;
            categoryId: string | null;
            amount: Prisma.Decimal;
            transactionDate: Date;
        } & {
            amount: string;
        })[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    getTransactionForUser(userId: string, id: string): Promise<{
        contact: {
            id: string;
            displayName: string;
        } | null;
        category: {
            id: string;
            name: string;
            type: import(".prisma/client").$Enums.FinanceCategoryType;
            icon: string | null;
            color: string | null;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        type: import(".prisma/client").$Enums.FinanceTransactionType;
        title: string;
        description: string | null;
        contactId: string | null;
        source: string | null;
        currency: import(".prisma/client").$Enums.FinanceCurrency;
        categoryId: string | null;
        amount: Prisma.Decimal;
        transactionDate: Date;
    } & {
        amount: string;
    }>;
    createForUser(userId: string, dto: CreateFinanceTransactionDto): Promise<{
        contact: {
            id: string;
            displayName: string;
        } | null;
        category: {
            id: string;
            name: string;
            type: import(".prisma/client").$Enums.FinanceCategoryType;
            icon: string | null;
            color: string | null;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        type: import(".prisma/client").$Enums.FinanceTransactionType;
        title: string;
        description: string | null;
        contactId: string | null;
        source: string | null;
        currency: import(".prisma/client").$Enums.FinanceCurrency;
        categoryId: string | null;
        amount: Prisma.Decimal;
        transactionDate: Date;
    } & {
        amount: string;
    }>;
    updateForUser(userId: string, id: string, dto: UpdateFinanceTransactionDto): Promise<{
        contact: {
            id: string;
            displayName: string;
        } | null;
        category: {
            id: string;
            name: string;
            type: import(".prisma/client").$Enums.FinanceCategoryType;
            icon: string | null;
            color: string | null;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        type: import(".prisma/client").$Enums.FinanceTransactionType;
        title: string;
        description: string | null;
        contactId: string | null;
        source: string | null;
        currency: import(".prisma/client").$Enums.FinanceCurrency;
        categoryId: string | null;
        amount: Prisma.Decimal;
        transactionDate: Date;
    } & {
        amount: string;
    }>;
    deleteForUser(userId: string, id: string): Promise<{
        message: string;
    }>;
    listCategoriesForUser(userId: string, query: FinanceCategoryQueryDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        userId: string;
        type: import(".prisma/client").$Enums.FinanceCategoryType;
        icon: string | null;
        color: string | null;
    }[]>;
    createCategoryForUser(userId: string, dto: CreateFinanceCategoryDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        userId: string;
        type: import(".prisma/client").$Enums.FinanceCategoryType;
        icon: string | null;
        color: string | null;
    }>;
    updateCategoryForUser(userId: string, id: string, dto: UpdateFinanceCategoryDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        userId: string;
        type: import(".prisma/client").$Enums.FinanceCategoryType;
        icon: string | null;
        color: string | null;
    }>;
    deleteCategoryForUser(userId: string, id: string): Promise<{
        message: string;
    }>;
    getSummaryForUser(userId: string, query: FinanceSummaryQueryDto): Promise<{
        from: string;
        to: string;
        currency: import(".prisma/client").$Enums.FinanceCurrency | undefined;
        totalIncome: string;
        totalExpense: string;
        netProfit: string;
        transactionCount: number;
        incomeCount: number;
        expenseCount: number;
        topExpenseCategories: {
            category: {
                id: string;
                name: string;
                type: import(".prisma/client").$Enums.FinanceCategoryType;
            } | null;
            total: string;
            transactionCount: number;
            percentage: string;
        }[];
        topIncomeCategories: {
            category: {
                id: string;
                name: string;
                type: import(".prisma/client").$Enums.FinanceCategoryType;
            } | null;
            total: string;
            transactionCount: number;
            percentage: string;
        }[];
    }>;
    getPeriodSummary(userId: string, from: Date, to: Date, currency?: FinanceCurrency): Promise<{
        from: string;
        to: string;
        currency: import(".prisma/client").$Enums.FinanceCurrency | undefined;
        totalIncome: string;
        totalExpense: string;
        netProfit: string;
        transactionCount: number;
        incomeCount: number;
        expenseCount: number;
        topExpenseCategories: {
            category: {
                id: string;
                name: string;
                type: import(".prisma/client").$Enums.FinanceCategoryType;
            } | null;
            total: string;
            transactionCount: number;
            percentage: string;
        }[];
        topIncomeCategories: {
            category: {
                id: string;
                name: string;
                type: import(".prisma/client").$Enums.FinanceCategoryType;
            } | null;
            total: string;
            transactionCount: number;
            percentage: string;
        }[];
    }>;
    getTodayForUser(userId: string, currency?: FinanceCurrency): Promise<{
        date: string;
        timezone: string;
        todayIncome: string;
        todayExpense: string;
        todayProfit: string;
        recentTransactions: ({
            contact: {
                id: string;
                displayName: string;
            } | null;
            category: {
                id: string;
                name: string;
                type: import(".prisma/client").$Enums.FinanceCategoryType;
                icon: string | null;
                color: string | null;
            } | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            type: import(".prisma/client").$Enums.FinanceTransactionType;
            title: string;
            description: string | null;
            contactId: string | null;
            source: string | null;
            currency: import(".prisma/client").$Enums.FinanceCurrency;
            categoryId: string | null;
            amount: Prisma.Decimal;
            transactionDate: Date;
        } & {
            amount: string;
        })[];
    }>;
    comparePeriods(userId: string, currentFrom: Date, currentTo: Date, previousFrom: Date, previousTo: Date, currency?: FinanceCurrency): Promise<{
        currency: import(".prisma/client").$Enums.FinanceCurrency | undefined;
        current: {
            income: string;
            expense: string;
            profit: string;
            incomeCount: number;
            expenseCount: number;
        };
        previous: {
            income: string;
            expense: string;
            profit: string;
            incomeCount: number;
            expenseCount: number;
        };
        incomeDifference: string;
        expenseDifference: string;
        profitDifference: string;
        incomePercentageChange: string | null;
        expensePercentageChange: string | null;
        profitPercentageChange: string | null;
        percentageChange: {
            income: string | null;
            expense: string | null;
            profit: string | null;
        };
    }>;
    getCategoryBreakdown(userId: string, type: FinanceTransactionType, from: Date, to: Date, currency?: FinanceCurrency): Promise<{
        category: {
            id: string;
            name: string;
            type: import(".prisma/client").$Enums.FinanceCategoryType;
        } | null;
        total: string;
        transactionCount: number;
        percentage: string;
    }[]>;
    ensureDefaultCategories(userId: string): Promise<void>;
    private getOwnedTransaction;
    private getCategoryForUser;
    private validateCategory;
    private validateContact;
    private parseTransactionDate;
    private parseOptionalPeriod;
    private parseSummaryPeriod;
    private parsePeriod;
    private parseRangeBoundary;
    private toDecimal;
    private toPositiveDecimal;
    private resolveCurrency;
    private aggregateTotals;
    private comparisonTotals;
    private percentageChange;
    private decimal;
    private formatDecimal;
    private serializeTransaction;
}
