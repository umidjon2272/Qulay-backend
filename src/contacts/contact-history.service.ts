import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContactHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getContactHistory(userId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, userId },
    });
    if (!contact) {
      throw new NotFoundException('Contact was not found');
    }

    const [meetings, notes, memories, financeTransactions] = await Promise.all([
      this.prisma.meeting.findMany({
        where: { userId, contactId },
        orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
        take: 20,
      }),
      this.prisma.note.findMany({
        where: { userId, contactId },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      this.prisma.userMemory.findMany({
        where: { userId, contactId, status: 'ACTIVE' },
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: 20,
      }),
      this.prisma.financeTransaction.findMany({
        where: { userId, contactId },
        include: { category: true, account: true },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        take: 20,
      }),
    ]);

    return {
      contact,
      recentMeetings: meetings,
      relatedNotes: notes,
      relatedMemories: memories,
      financeTransactions: financeTransactions.map((item) => ({ ...item, amount: item.amount.toFixed(2) })),
      tasks: [],
    };
  }
}
