import { FinanceCurrency, FinanceTransactionType } from '@prisma/client';
export declare class CreateFinanceTransactionDto {
    type: FinanceTransactionType;
    amount: string;
    currency: FinanceCurrency;
    categoryId?: string;
    title: string;
    description?: string;
    transactionDate: string;
    contactId?: string;
    source?: string;
}
