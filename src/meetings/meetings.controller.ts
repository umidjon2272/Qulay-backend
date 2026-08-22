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
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { MeetingQueryDto } from './dto/meeting-query.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { MeetingsService } from './meetings.service';

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: MeetingQueryDto) {
    return this.meetingsService.listForUser(user.sub, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.meetingsService.getForUser(user.sub, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMeetingDto) {
    return this.meetingsService.createForUser(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetingsService.updateForUser(user.sub, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.meetingsService.deleteForUser(user.sub, id);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.meetingsService.cancelForUser(user.sub, id);
  }
}
