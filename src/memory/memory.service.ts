import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { MemoryStatus, MemoryType, Prisma } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { APP_ERROR_CODES } from '../common/errors/app-error-codes';

export type MemoryRetrievalOptions = {
  type?: MemoryType;
  contactId?: string;
  importance?: number;
  limit?: number;
  status?: MemoryStatus;
};

@Injectable()
export class MemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    @Optional() private readonly subscriptions?: SubscriptionsService,
  ) {}

  async listForUser(userId: string, query: MemoryQueryDto) {
    const where = this.buildWhere(userId, query.search, {
      type: query.type,
      contactId: query.contactId,
      importance: query.importance,
      key: query.key,
      status: query.status ?? MemoryStatus.ACTIVE,
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
    await this.subscriptions?.assertMemoryAllowed(userId);
    const preference = await this.prisma.user.findUnique({ where: { id: userId }, select: { memoryEnabled: true } });
    if (!preference?.memoryEnabled) throw new ConflictException({ code: APP_ERROR_CODES.MEMORY_DISABLED, message: 'AI memory is disabled' });
    await this.assertContactOwnership(userId, dto.contactId);
    const existing = await this.prisma.userMemory.findFirst({
      where: { userId, key: { equals: dto.key.trim(), mode: 'insensitive' }, status: MemoryStatus.ACTIVE },
    });
    if (existing) {
      if (existing.contactId === (dto.contactId ?? null) && existing.value.trim().toLocaleLowerCase() === dto.value.trim().toLocaleLowerCase()) return this.getForUser(userId, existing.id);
      throw new ConflictException({ code: APP_ERROR_CODES.MEMORY_KEY_CONFLICT, message: 'A memory with this key already exists; update it explicitly' });
    }
    try {
      const memory = await this.prisma.userMemory.create({
        data: {
          userId,
          type: dto.type ?? MemoryType.CONTEXT,
          key: dto.key,
          value: dto.value,
          importance: dto.importance ?? 5,
          confidence: dto.confidence ?? (dto.source?.toUpperCase().startsWith('AI') ? 60 : 100),
          isVerified: dto.isVerified ?? !dto.source?.toUpperCase().startsWith('AI'),
          status: dto.status ?? MemoryStatus.ACTIVE,
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
          confidence: dto.confidence,
          isVerified: dto.isVerified,
          status: dto.status,
          source: dto.source?.trim(),
          contactId: dto.contactId,
          correctedAt: dto.value !== undefined || dto.key !== undefined ? new Date() : undefined,
          archivedAt: dto.status === MemoryStatus.ARCHIVED ? new Date() : dto.status === MemoryStatus.ACTIVE ? null : undefined,
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

  async getPreference(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { memoryEnabled: true } });
    if (!user) throw new NotFoundException('User was not found');
    return { enabled: user.memoryEnabled };
  }

  async setPreference(userId: string, enabled: boolean) {
    await this.prisma.user.update({ where: { id: userId }, data: { memoryEnabled: enabled } });
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.MEMORY_PREFERENCE_UPDATED, entityType: 'MEMORY_PREFERENCE', metadata: { enabled } });
    return { enabled };
  }

  async deleteAllForUser(userId: string) {
    const result = await this.prisma.userMemory.deleteMany({ where: { userId } });
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.MEMORY_ALL_DELETED, entityType: 'MEMORY', metadata: { count: result.count } });
    return { message: 'All memories deleted successfully', count: result.count };
  }

  async exportForUser(userId: string) {
    const items = await this.prisma.userMemory.findMany({
      where: { userId }, orderBy: { updatedAt: 'desc' },
      select: { type: true, key: true, value: true, importance: true, confidence: true, isVerified: true, status: true, source: true, createdAt: true, updatedAt: true },
    });
    return { exportedAt: new Date().toISOString(), items };
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
      where: this.buildWhere(userId, normalizedQuery, { ...options, status: MemoryStatus.ACTIVE }),
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
    const tokens = normalizedSearch?.split(/\s+/).filter((token) => token.length > 1).slice(0, 12) ?? [];
    return {
      userId,
      type: options.type,
      contactId: options.contactId,
      importance: options.importance,
      status: options.status,
      ...(options.key ? { key: { contains: options.key.trim(), mode: 'insensitive' } } : {}),
      ...(normalizedSearch
        ? {
            OR: (tokens.length ? tokens : [normalizedSearch]).flatMap((token) => [
              { key: { contains: token, mode: 'insensitive' as const } },
              { value: { contains: token, mode: 'insensitive' as const } },
              { contact: { displayName: { contains: token, mode: 'insensitive' as const } } },
            ]),
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

  async getForUser(userId: string, id: string) {
    const memory = await this.prisma.userMemory.findFirst({ where: { id, userId } });
    if (!memory) {
      throw new NotFoundException('Memory was not found');
    }
    return memory;
  }

  private throwDuplicateMemory(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({ code: APP_ERROR_CODES.MEMORY_KEY_CONFLICT, message: 'A memory with this key already exists' });
    }
  }
}
