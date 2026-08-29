import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ContactQueryDto } from './dto/contact-query.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async listForUser(userId: string, query: ContactQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.ContactWhereInput = {
      userId,
      ...(query.tag?.trim() ? { tags: { has: query.tag.trim() } } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { telegramUsername: { contains: search, mode: 'insensitive' } },
              { company: { contains: search, mode: 'insensitive' } },
              { position: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: [{ displayName: 'asc' }, { createdAt: 'desc' }],
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async getForUser(userId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, userId } });
    if (!contact) {
      throw new NotFoundException('Contact was not found');
    }
    return contact;
  }

  async createForUser(userId: string, dto: CreateContactDto) {
    const contact = await this.prisma.contact.create({
      data: {
        userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName: dto.displayName ?? [dto.firstName, dto.lastName].filter(Boolean).join(' '),
        phone: dto.phone,
        email: dto.email,
        telegramUsername: dto.telegramUsername,
        company: dto.company,
        position: dto.position,
        relationship: dto.relationship,
        birthday: dto.birthday ? new Date(dto.birthday) : undefined,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
        notes: dto.notes,
        tags: this.normalizeTags(dto.tags),
      },
    });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.CONTACT_CREATED,
      entityType: 'CONTACT',
      entityId: contact.id,
    });
    return contact;
  }

  async updateForUser(userId: string, id: string, dto: UpdateContactDto) {
    const current = await this.getForUser(userId, id);
    const contact = await this.prisma.contact.update({
      where: { id: current.id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName: dto.displayName,
        phone: dto.phone,
        email: dto.email,
        telegramUsername: dto.telegramUsername,
        company: dto.company,
        position: dto.position,
        relationship: dto.relationship,
        birthday: dto.birthday === undefined ? undefined : dto.birthday ? new Date(dto.birthday) : null,
        lastContactedAt: dto.lastContactedAt === undefined ? undefined : dto.lastContactedAt ? new Date(dto.lastContactedAt) : null,
        nextFollowUpAt: dto.nextFollowUpAt === undefined ? undefined : dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null,
        notes: dto.notes,
        tags: dto.tags === undefined ? undefined : this.normalizeTags(dto.tags),
      },
    });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.CONTACT_UPDATED,
      entityType: 'CONTACT',
      entityId: contact.id,
    });
    return contact;
  }

  async deleteForUser(userId: string, id: string): Promise<{ message: string }> {
    const contact = await this.getForUser(userId, id);
    await this.prisma.contact.delete({ where: { id: contact.id } });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.CONTACT_DELETED,
      entityType: 'CONTACT',
      entityId: contact.id,
    });
    return { message: 'Contact deleted successfully' };
  }

  private normalizeTags(tags?: string[]): string[] {
    return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  }
}
