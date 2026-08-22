import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { MemoryService } from './memory.service';

@Controller('memories')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: MemoryQueryDto) {
    return this.memoryService.listForUser(user.sub, query);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMemoryDto) {
    return this.memoryService.createForUser(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMemoryDto,
  ) {
    return this.memoryService.updateForUser(user.sub, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.memoryService.deleteForUser(user.sub, id);
  }
}
