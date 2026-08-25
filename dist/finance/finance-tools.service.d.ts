import { FinanceCurrency } from '@prisma/client';
import { FinanceService } from './finance.service';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto';
export declare class FinanceToolsService {
    private readonly financeService;
    constructor(financeService: FinanceService);
    getTodayFinance(userId: string, currency?: FinanceCurrency): Promise<{
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
            amount: import("@prisma/client/runtime/library").Decimal;
            transactionDate: Date;
        } & {
            amount: string;
        })[];
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
    getTopExpenses(userId: string, from: Date, to: Date, currency?: FinanceCurrency): Promise<{
        category: {
            id: string;
            name: string;
            type: import(".prisma/client").$Enums.FinanceCategoryType;
        } | null;
        total: string;
        transactionCount: number;
        percentage: string;
    }[]>;
    compareFinancePeriods(userId: string, currentFrom: Date, currentTo: Date, previousFrom: Date, previousTo: Date, currency?: FinanceCurrency): Promise<{
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
    createFinanceTransactionForUser(userId: string, dto: CreateFinanceTransactionDto): Promise<{
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
        amount: import("@prisma/client/runtime/library").Decimal;
        transactionDate: Date;
    } & {
        amount: string;
    }>;
}
