import { FinanceCategoryType } from '@prisma/client';
export declare class UpdateFinanceCategoryDto {
    name?: string;
    type?: FinanceCategoryType;
    icon?: string;
    color?: string;
}
