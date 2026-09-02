import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { IsOptional, IsUUID } from 'class-validator';

export class MessageQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID('4') before?: string;
}
