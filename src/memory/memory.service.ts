import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MemoryCategory, Prisma } from '@prisma/client';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';

@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, query: MemoryQueryDto) {
    const where: Prisma.UserMemoryWhereInput = {
      userId,
      category: query.category,
      ...(query.key ? { key: { contains: query.key.trim(), mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            OR: [
              { key: { contains: query.search.trim(), mode: 'insensitive' } },
              { value: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.userMemory.findMany({
        where,
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.userMemory.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async createForUser(userId: string, dto: CreateMemoryDto) {
    try {
      return await this.prisma.userMemory.create({
        data: {
          userId,
          key: dto.key,
          value: dto.value,
          category: dto.category ?? MemoryCategory.OTHER,
          importance: dto.importance ?? 5,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A memory with this key already exists');
      }
      throw error;
    }
  }

  async updateForUser(userId: string, id: string, dto: UpdateMemoryDto) {
    await this.getForUser(userId, id);
    try {
      return await this.prisma.userMemory.update({
        where: { id },
        data: {
          key: dto.key,
          value: dto.value,
          category: dto.category,
          importance: dto.importance,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A memory with this key already exists');
      }
      throw error;
    }
  }

  async deleteForUser(userId: string, id: string): Promise<{ message: string }> {
    await this.getForUser(userId, id);
    await this.prisma.userMemory.delete({ where: { id } });
    return { message: 'Memory deleted successfully' };
  }

  private async getForUser(userId: string, id: string) {
    const memory = await this.prisma.userMemory.findFirst({ where: { id, userId } });
    if (!memory) {
      throw new NotFoundException('Memory was not found');
    }
    return memory;
  }
}
