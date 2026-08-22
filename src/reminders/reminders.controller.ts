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
import { CreateReminderDto } from './dto/create-reminder.dto';
import { ReminderQueryDto } from './dto/reminder-query.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { RemindersService } from './reminders.service';

@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ReminderQueryDto) {
    return this.remindersService.listForUser(user.sub, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.remindersService.getForUser(user.sub, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReminderDto) {
    return this.remindersService.createForUser(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.remindersService.updateForUser(user.sub, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.remindersService.deleteForUser(user.sub, id);
  }

  @Patch(':id/complete')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.remindersService.completeForUser(user.sub, id);
  }
}
