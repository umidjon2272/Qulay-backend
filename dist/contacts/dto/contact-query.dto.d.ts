import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
export declare class ContactQueryDto extends PaginationQueryDto {
    search?: string;
    tag?: string;
}
