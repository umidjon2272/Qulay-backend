import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, query: ConversationQueryDto) {
    const where: Prisma.ConversationWhereInput = {
      userId,
      ...(query.search
        ? { title: { contains: query.search.trim(), mode: 'insensitive' } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: { _count: { select: { messages: { where: { role: { in: ['USER', 'ASSISTANT'] } } } } } },
        orderBy: { updatedAt: 'desc' },
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);
    const items = rows.map(({ _count, ...conversation }) => ({
      ...conversation,
      messageCount: _count.messages,
    }));
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async getForUser(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
      include: { _count: { select: { messages: { where: { role: { in: ['USER', 'ASSISTANT'] } } } } } },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation was not found');
    }
    const { _count, ...data } = conversation;
    return { ...data, messageCount: _count.messages };
  }

  async createForUser(userId: string, dto: CreateConversationDto) {
    return this.prisma.conversation.create({
      data: { userId, title: dto.title ?? 'New conversation' },
    });
  }

  async updateForUser(userId: string, id: string, dto: UpdateConversationDto) {
    await this.getForUser(userId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: { title: dto.title },
      include: { _count: { select: { messages: { where: { role: { in: ['USER', 'ASSISTANT'] } } } } } },
    }).then(({ _count, ...conversation }) => ({ ...conversation, messageCount: _count.messages }));
  }

  async deleteForUser(userId: string, id: string): Promise<{ message: string }> {
    await this.getForUser(userId, id);
    await this.prisma.conversation.delete({ where: { id } });
    return { message: 'Conversation deleted successfully' };
  }

}
