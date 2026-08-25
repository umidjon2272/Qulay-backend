import { FinanceCategoryType } from '@prisma/client';
export declare class CreateFinanceCategoryDto {
    name: string;
    type: FinanceCategoryType;
    icon?: string;
    color?: string;
}
