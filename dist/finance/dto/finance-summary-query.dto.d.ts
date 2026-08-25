import { FinanceCurrency } from '@prisma/client';
export declare class FinanceSummaryQueryDto {
    from?: string;
    to?: string;
    currency?: FinanceCurrency;
}
