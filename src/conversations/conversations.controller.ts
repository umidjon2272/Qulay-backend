import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateMessageDto } from '../messages/dto/create-message.dto';
import { MessageQueryDto } from '../messages/dto/message-query.dto';
import { MessagesService } from '../messages/messages.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ConversationQueryDto) {
    return this.conversationsService.listForUser(user.sub, query);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConversationDto) {
    return this.conversationsService.createForUser(user.sub, dto);
  }

  @Get(':id/messages')
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: MessageQueryDto,
  ) {
    return this.messagesService.listForConversation(user.sub, id, query);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.createForConversation(user.sub, id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.conversationsService.getForUser(user.sub, id);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.conversationsService.deleteForUser(user.sub, id);
  }
}
