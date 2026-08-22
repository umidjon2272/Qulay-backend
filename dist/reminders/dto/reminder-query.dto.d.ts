import { TaskPriority } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
export declare class ReminderQueryDto extends PaginationQueryDto {
    active?: boolean;
    completed?: boolean;
    date?: string;
    priority?: TaskPriority;
    search?: string;
}
