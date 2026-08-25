import { FinanceCurrency, FinanceTransactionType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
export declare class FinanceTransactionQueryDto extends PaginationQueryDto {
    type?: FinanceTransactionType;
    categoryId?: string;
    from?: string;
    to?: string;
    search?: string;
    minAmount?: string;
    maxAmount?: string;
    currency?: FinanceCurrency;
}
