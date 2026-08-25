import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MemoryType, Prisma } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';

export type MemoryRetrievalOptions = {
  type?: MemoryType;
  contactId?: string;
  importance?: number;
  limit?: number;
};

@Injectable()
export class MemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async listForUser(userId: string, query: MemoryQueryDto) {
    const where = this.buildWhere(userId, query.search, {
      type: query.type,
      contactId: query.contactId,
      importance: query.importance,
      key: query.key,
    });
    const [items, total] = await Promise.all([
      this.prisma.userMemory.findMany({
        where,
        include: { contact: true },
        orderBy: [{ importance: 'desc' }, { lastUsedAt: 'desc' }, { updatedAt: 'desc' }],
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.userMemory.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async createForUser(userId: string, dto: CreateMemoryDto) {
    await this.assertContactOwnership(userId, dto.contactId);
    try {
      const memory = await this.prisma.userMemory.create({
        data: {
          userId,
          type: dto.type ?? MemoryType.CONTEXT,
          key: dto.key,
          value: dto.value,
          importance: dto.importance ?? 5,
          source: dto.source?.trim() || 'MANUAL',
          contactId: dto.contactId,
        },
        include: { contact: true },
      });
      await this.activityLog.record({
        userId,
        action: ACTIVITY_ACTIONS.MEMORY_CREATED,
        entityType: 'MEMORY',
        entityId: memory.id,
      });
      return memory;
    } catch (error) {
      this.throwDuplicateMemory(error);
      throw error;
    }
  }

  async updateForUser(userId: string, id: string, dto: UpdateMemoryDto) {
    await this.getForUser(userId, id);
    await this.assertContactOwnership(userId, dto.contactId);
    try {
      const memory = await this.prisma.userMemory.update({
        where: { id },
        data: {
          key: dto.key,
          value: dto.value,
          type: dto.type,
          importance: dto.importance,
          source: dto.source?.trim(),
          contactId: dto.contactId,
        },
        include: { contact: true },
      });
      await this.activityLog.record({
        userId,
        action: ACTIVITY_ACTIONS.MEMORY_UPDATED,
        entityType: 'MEMORY',
        entityId: memory.id,
      });
      return memory;
    } catch (error) {
      this.throwDuplicateMemory(error);
      throw error;
    }
  }

  async deleteForUser(userId: string, id: string): Promise<{ message: string }> {
    await this.getForUser(userId, id);
    await this.prisma.userMemory.delete({ where: { id } });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.MEMORY_DELETED,
      entityType: 'MEMORY',
      entityId: id,
    });
    return { message: 'Memory deleted successfully' };
  }

  /**
   * Deterministic retrieval seam for future vector search.
   * It intentionally stores no transient query/result as memory.
   */
  async getRelevantMemories(
    userId: string,
    query: string,
    options: MemoryRetrievalOptions = {},
  ) {
    const normalizedQuery = query.trim();
    const memories = await this.prisma.userMemory.findMany({
      where: this.buildWhere(userId, normalizedQuery, options),
      include: { contact: true },
      orderBy: [{ importance: 'desc' }, { lastUsedAt: 'desc' }, { updatedAt: 'desc' }],
      take: options.limit ?? 20,
    });

    const queryTokens = normalizedQuery.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const ranked = memories
      .map((memory) => {
        const searchable = (memory.key + ' ' + memory.value).toLocaleLowerCase();
        const tokenMatches = queryTokens.filter((token) => searchable.includes(token)).length;
        const exactKey = normalizedQuery && memory.key.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase() ? 20 : 0;
        const recency = memory.lastUsedAt ? 2 : 0;
        return { memory, score: exactKey + tokenMatches * 5 + memory.importance + recency };
      })
      .sort((left, right) => right.score - left.score)
      .map(({ memory }) => memory);

    if (ranked.length > 0) {
      await this.prisma.userMemory.updateMany({
        where: { userId, id: { in: ranked.map((memory) => memory.id) } },
        data: { lastUsedAt: new Date() },
      });
    }
    return ranked;
  }

  private buildWhere(
    userId: string,
    search: string | undefined,
    options: MemoryRetrievalOptions & { key?: string } = {},
  ): Prisma.UserMemoryWhereInput {
    const normalizedSearch = search?.trim();
    return {
      userId,
      type: options.type,
      contactId: options.contactId,
      importance: options.importance,
      ...(options.key ? { key: { contains: options.key.trim(), mode: 'insensitive' } } : {}),
      ...(normalizedSearch
        ? {
            OR: [
              { key: { contains: normalizedSearch, mode: 'insensitive' } },
              { value: { contains: normalizedSearch, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async assertContactOwnership(userId: string, contactId?: string | null) {
    if (!contactId) {
      return;
    }
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, userId } });
    if (!contact) {
      throw new NotFoundException('Contact was not found');
    }
  }

  private async getForUser(userId: string, id: string) {
    const memory = await this.prisma.userMemory.findFirst({ where: { id, userId } });
    if (!memory) {
      throw new NotFoundException('Memory was not found');
    }
    return memory;
  }

  private throwDuplicateMemory(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A memory with this key already exists');
    }
  }
}
