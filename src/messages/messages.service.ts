import { Injectable, NotFoundException } from '@nestjs/common';
import { MessageRole, Prisma } from '@prisma/client';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForConversation(userId: string, conversationId: string, query: MessageQueryDto) {
    await this.getConversationForUser(userId, conversationId);
    const where: Prisma.MessageWhereInput = { conversationId, role: { in: [MessageRole.USER, MessageRole.ASSISTANT] } };
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.message.count({ where }),
    ]);
    return { items: items.reverse(), meta: paginationMeta(query.page, query.limit, total) };
  }

  async createForConversation(userId: string, conversationId: string, dto: CreateMessageDto) {
    await this.getConversationForUser(userId, conversationId);
    return this.prisma.$transaction(async (transaction) => {
      const message = await transaction.message.create({
        data: {
          conversationId,
          role: dto.role ?? MessageRole.USER,
          content: dto.content,
        },
      });
      await transaction.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      return message;
    });
  }

  private async getConversationForUser(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, userId } });
    if (!conversation) {
      throw new NotFoundException('Conversation was not found');
    }
    return conversation;
  }
}
