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
import { CreateNoteDto } from './dto/create-note.dto';
import { NoteQueryDto } from './dto/note-query.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NotesService } from './notes.service';

@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: NoteQueryDto) {
    return this.notesService.listForUser(user.sub, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.notesService.getForUser(user.sub, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateNoteDto) {
    return this.notesService.createForUser(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notesService.updateForUser(user.sub, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.notesService.deleteForUser(user.sub, id);
  }
}
