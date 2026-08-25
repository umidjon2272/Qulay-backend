import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { NoteQueryDto } from './dto/note-query.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async listForUser(userId: string, query: NoteQueryDto) {
    const where: Prisma.NoteWhereInput = {
      userId,
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search.trim(), mode: 'insensitive' } },
              { content: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.note.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.note.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async getForUser(userId: string, id: string) {
    const note = await this.prisma.note.findFirst({ where: { id, userId } });
    if (!note) {
      throw new NotFoundException('Note was not found');
    }
    return note;
  }

  async createForUser(userId: string, dto: CreateNoteDto) {
    await this.assertContactOwnership(userId, dto.contactId);
    const note = await this.prisma.note.create({
      data: {
        userId,
        title: dto.title,
        content: dto.content,
        contactId: dto.contactId,
      },
    });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.NOTE_CREATED,
      entityType: 'NOTE',
      entityId: note.id,
    });
    return note;
  }

  async updateForUser(userId: string, id: string, dto: UpdateNoteDto) {
    const current = await this.getForUser(userId, id);
    await this.assertContactOwnership(userId, dto.contactId);
    return this.prisma.note.update({
      where: { id: current.id },
      data: { title: dto.title, content: dto.content, contactId: dto.contactId },
    });
  }

  async deleteForUser(userId: string, id: string): Promise<{ message: string }> {
    await this.getForUser(userId, id);
    await this.prisma.note.delete({ where: { id } });
    return { message: 'Note deleted successfully' };
  }

  private async assertContactOwnership(userId: string, contactId?: string | null): Promise<void> {
    if (!contactId) {
      return;
    }
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, userId } });
    if (!contact) {
      throw new NotFoundException('Contact was not found');
    }
  }
}
