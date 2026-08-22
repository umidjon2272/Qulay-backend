import { TaskPriority, TaskStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
export declare class TaskQueryDto extends PaginationQueryDto {
    status?: TaskStatus;
    priority?: TaskPriority;
    date?: string;
    search?: string;
}
