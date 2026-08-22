import { MeetingStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
export declare class MeetingQueryDto extends PaginationQueryDto {
    date?: string;
    from?: string;
    to?: string;
    status?: MeetingStatus;
}
