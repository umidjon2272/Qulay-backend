import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateFinanceCategoryDto } from './dto/create-finance-category.dto';
import { FinanceCategoryQueryDto } from './dto/finance-category-query.dto';
import { FinanceSummaryQueryDto } from './dto/finance-summary-query.dto';
import { FinanceTransactionQueryDto } from './dto/transaction-query.dto';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto';
import { UpdateFinanceCategoryDto } from './dto/update-finance-category.dto';
import { UpdateFinanceTransactionDto } from './dto/update-finance-transaction.dto';
import { FinanceService } from './finance.service';
export declare class FinanceController {
    private readonly financeService;
    constructor(financeService: FinanceService);
    listTransactions(user: AuthenticatedUser, query: FinanceTransactionQueryDto): Promise<{
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
            amount: import("@prisma/client/runtime/library").Decimal;
            transactionDate: Date;
        } & {
            amount: string;
        })[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    getTransaction(user: AuthenticatedUser, id: string): Promise<{
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
    createTransaction(user: AuthenticatedUser, dto: CreateFinanceTransactionDto): Promise<{
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
    updateTransaction(user: AuthenticatedUser, id: string, dto: UpdateFinanceTransactionDto): Promise<{
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
    deleteTransaction(user: AuthenticatedUser, id: string): Promise<{
        message: string;
    }>;
    listCategories(user: AuthenticatedUser, query: FinanceCategoryQueryDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        userId: string;
        type: import(".prisma/client").$Enums.FinanceCategoryType;
        icon: string | null;
        color: string | null;
    }[]>;
    createCategory(user: AuthenticatedUser, dto: CreateFinanceCategoryDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        userId: string;
        type: import(".prisma/client").$Enums.FinanceCategoryType;
        icon: string | null;
        color: string | null;
    }>;
    updateCategory(user: AuthenticatedUser, id: string, dto: UpdateFinanceCategoryDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        userId: string;
        type: import(".prisma/client").$Enums.FinanceCategoryType;
        icon: string | null;
        color: string | null;
    }>;
    deleteCategory(user: AuthenticatedUser, id: string): Promise<{
        message: string;
    }>;
    summary(user: AuthenticatedUser, query: FinanceSummaryQueryDto): Promise<{
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
    today(user: AuthenticatedUser, query: FinanceSummaryQueryDto): Promise<{
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
}
