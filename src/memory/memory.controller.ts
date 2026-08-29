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
  Put,
} from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { MemoryService } from './memory.service';

class MemoryPreferenceDto { @IsBoolean() enabled!: boolean; }

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

  @Get('preference')
  preference(@CurrentUser() user: AuthenticatedUser) { return this.memoryService.getPreference(user.sub); }

  @Put('preference')
  updatePreference(@CurrentUser() user: AuthenticatedUser, @Body() dto: MemoryPreferenceDto) {
    return this.memoryService.setPreference(user.sub, dto.enabled);
  }

  @Get('export')
  export(@CurrentUser() user: AuthenticatedUser) { return this.memoryService.exportForUser(user.sub); }

  @Delete()
  deleteAll(@CurrentUser() user: AuthenticatedUser) { return this.memoryService.deleteAllForUser(user.sub); }

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
