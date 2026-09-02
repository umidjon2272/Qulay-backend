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
    if (query.before) {
      const anchor = await this.prisma.message.findFirst({ where: { ...where, id: query.before }, select: { id: true, createdAt: true } });
      if (!anchor) throw new NotFoundException('Message cursor was not found');
      where.OR = [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }];
    }
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.before ? 0 : paginationSkip(query.page, query.limit),
        take: query.limit + 1,
      }),
      this.prisma.message.count({ where }),
    ]);
    const hasMore = items.length > query.limit;
    const page = items.slice(0, query.limit).reverse();
    return { items: page, meta: { ...paginationMeta(query.page, query.limit, total), hasMore, nextCursor: hasMore ? page[0]?.id ?? null : null } };
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
