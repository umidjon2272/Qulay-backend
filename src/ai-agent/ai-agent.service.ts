import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentActionStatus, MemoryStatus, MessageRole, NotificationChannel, NotificationStatus, NotificationType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { AIToolExecutionService } from '../ai-tools/ai-tool-execution.service';
import { AIToolRegistryService } from '../ai-tools/ai-tool-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AiUsageService } from '../usage/usage.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { AiProviderService, ProviderMessage, ProviderTool } from './ai-provider.service';
import { AgentActionQueryDto } from './dto/agent-action-query.dto';
import { AgentChatDto } from './dto/agent-chat.dto';

const MAX_TOOL_ROUNDS = 6;

@Injectable()
export class AiAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly registry: AIToolRegistryService,
    private readonly execution: AIToolExecutionService,
    private readonly usage: AiUsageService,
    private readonly subscriptions: SubscriptionsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  status() {
    return { configured: this.provider.configured(), mode: this.provider.configured() ? 'MODEL' : 'SETUP_REQUIRED' };
  }

  async listForUser(userId: string, query: AgentActionQueryDto) {
    const where = { userId, status: query.status };
    const [items, total] = await Promise.all([
      this.prisma.pendingAgentAction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.pendingAgentAction.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  /** Sweeps PENDING actions past their expiry so the Approval Center's "Muddati tugadi" status is accurate without waiting for a confirm() call. */
  async expireStale(): Promise<number> {
    const result = await this.prisma.pendingAgentAction.updateMany({
      where: { status: AgentActionStatus.PENDING, expiresAt: { lt: new Date() } },
      data: { status: AgentActionStatus.EXPIRED },
    });
    return result.count;
  }

  async chat(userId: string, dto: AgentChatDto) {
    await this.subscriptions.assertAiAllowed(userId);
    const conversation = await this.resolveConversation(userId, dto.conversationId, dto.message);
    const recentDuplicate = await this.prisma.message.findFirst({
      where: { conversationId: conversation.id, role: MessageRole.USER, content: dto.message, createdAt: { gte: new Date(Date.now() - 15_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (!recentDuplicate) await this.prisma.message.create({ data: { conversationId: conversation.id, role: MessageRole.USER, content: dto.message } });
    await this.prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

    const [user, memories, history] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, timezone: true, language: true, memoryEnabled: true } }),
      this.prisma.userMemory.findMany({ where: { userId, status: MemoryStatus.ACTIVE }, include: { contact: { select: { displayName: true } } }, orderBy: [{ isVerified: 'desc' }, { importance: 'desc' }, { updatedAt: 'desc' }], take: 30 }),
      this.prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'asc' }, take: 40 }),
    ]);
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    const messages: ProviderMessage[] = [
      { role: 'system', content: this.systemPrompt(user, user.memoryEnabled ? memories : []) },
      ...history.filter((item) => item.role === MessageRole.USER || item.role === MessageRole.ASSISTANT).map((item) => ({ role: this.toProviderRole(item.role), content: item.content })),
    ];
    const memoryTools = new Set(['save_memory', 'update_memory', 'delete_memory', 'get_relevant_memories']);
    const tools: ProviderTool[] = this.registry.getToolDefinitionsForModel().filter((tool) => user.memoryEnabled || !memoryTools.has(tool.name)).map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: `${tool.description}${tool.requiresConfirmation ? ' This action always requires explicit user confirmation.' : ''}`, parameters: tool.inputSchema },
    }));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const result = await this.provider.complete(messages, tools);
      await this.usage.logTextUsage({ userId, model: result.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens });
      const toolCalls = result.message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const answer = result.message.content?.trim() || 'Bajarildi.';
        await this.prisma.message.create({ data: { conversationId: conversation.id, role: MessageRole.ASSISTANT, content: answer } });
        await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.AI_AGENT_MESSAGE, entityType: 'CONVERSATION', entityId: conversation.id });
        return { conversationId: conversation.id, message: answer, pendingConfirmation: null };
      }

      messages.push(result.message);
      const pendingCalls: Array<{ toolName: string; input: Record<string, unknown>; preview: unknown }> = [];
      for (const call of toolCalls) {
        const input = this.parseToolInput(call.function.arguments);
        const execution = await this.execution.execute(userId, { tool: call.function.name, input, confirmed: false, requestId: call.id }, { locale: user.language, timezone: user.timezone });
        if (execution.status === 'confirmation_required') {
          pendingCalls.push({ toolName: call.function.name, input, preview: execution.preview });
          continue;
        }
        await this.usage.logToolUsage({ userId, model: 'tool-registry' });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(execution.data) });
      }
      if (pendingCalls.length) {
        const batch = pendingCalls.length > 1;
        const pending = await this.prisma.pendingAgentAction.create({ data: { userId, conversationId: conversation.id,
          toolName: batch ? '__batch__' : pendingCalls[0].toolName,
          input: (batch ? { actions: pendingCalls.map(({ toolName, input }) => ({ toolName, input })) } : pendingCalls[0].input) as Prisma.InputJsonValue,
          preview: (batch ? pendingCalls.map(({ toolName, preview }) => ({ toolName, preview })) : pendingCalls[0].preview) as Prisma.InputJsonValue,
          idempotencyKey: randomUUID(), expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
        const prompt = batch ? (user.language === 'ru' ? `Подготовлено действий: ${pendingCalls.length}. Выполнить все?` : `${pendingCalls.length} ta amal tayyor. Hammasi bajarilsinmi?`) : this.confirmationPrompt(pending.toolName, pendingCalls[0].preview, user.language);
        await Promise.all([
          this.prisma.message.create({ data: { conversationId: conversation.id, role: MessageRole.ASSISTANT, content: prompt } }),
          this.prisma.notification.create({ data: { userId, type: NotificationType.AI, title: 'AI tasdiqlashi kutilmoqda', message: prompt, entityType: 'AI_AGENT_ACTION', entityId: pending.id, channel: NotificationChannel.IN_APP, status: NotificationStatus.SENT, sentAt: new Date(), metadata: { deepLink: `/ai-assistant?action=${pending.id}`, conversationId: conversation.id } } }),
        ]);
        return { conversationId: conversation.id, message: prompt, pendingConfirmation: { id: pending.id, tool: pending.toolName, preview: pending.preview, expiresAt: pending.expiresAt } };
      }
    }
    throw new ConflictException('AI juda ko‘p amal chaqirdi. So‘rovni soddaroq yozing.');
  }

  async confirm(userId: string, actionId: string, confirmed: boolean) {
    const action = await this.prisma.pendingAgentAction.findFirst({ where: { id: actionId, userId } });
    if (!action) throw new NotFoundException('Tasdiqlash amali topilmadi');
    const language = (await this.prisma.user.findUnique({ where: { id: userId }, select: { language: true } }))?.language ?? 'uz';
    if (action.status !== AgentActionStatus.PENDING) throw new ConflictException('Bu amal avval bajarilgan yoki bekor qilingan');
    if (action.expiresAt <= new Date()) {
      await this.prisma.pendingAgentAction.update({ where: { id: action.id }, data: { status: AgentActionStatus.EXPIRED } });
      throw new BadRequestException('Tasdiqlash muddati tugagan');
    }
    if (!confirmed) {
      await this.prisma.pendingAgentAction.update({ where: { id: action.id }, data: { status: AgentActionStatus.CANCELLED } });
      await this.prisma.notification.updateMany({ where: { userId, entityType: 'AI_AGENT_ACTION', entityId: action.id, readAt: null }, data: { status: NotificationStatus.READ, readAt: new Date() } });
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.AI_AGENT_ACTION_CANCELLED, entityType: 'AI_AGENT_ACTION', entityId: action.id });
      const message = language === 'ru' ? 'Действие отменено.' : 'Amal bekor qilindi.';
      if (action.conversationId) await this.prisma.message.create({ data: { conversationId: action.conversationId, role: MessageRole.ASSISTANT, content: message } });
      return { status: 'cancelled', message };
    }

    const claimed = await this.prisma.pendingAgentAction.updateMany({ where: { id: action.id, userId, status: AgentActionStatus.PENDING }, data: { status: AgentActionStatus.EXECUTING } });
    if (claimed.count !== 1) throw new ConflictException('Amal boshqa so‘rovda bajarilmoqda');
    try {
      await this.subscriptions.assertToolAllowed(userId);
      const actions = action.toolName === '__batch__' ? ((action.input as { actions?: Array<{ toolName: string; input: Record<string, unknown> }> }).actions ?? []) : [{ toolName: action.toolName, input: action.input as Record<string, unknown> }];
      const data: unknown[] = [];
      for (const [index, item] of actions.entries()) {
        const result = await this.execution.execute(userId, { tool: item.toolName, input: item.input, confirmed: true, idempotencyKey: `${action.idempotencyKey}:${index}` });
        if (result.status !== 'success') throw new ConflictException('Tasdiqlangan amal bajarilmadi');
        data.push(result.data); await this.usage.logToolUsage({ userId, model: 'tool-registry' });
      }
      await this.prisma.pendingAgentAction.update({ where: { id: action.id }, data: { status: AgentActionStatus.EXECUTED, executedAt: new Date() } });
      await this.prisma.notification.updateMany({ where: { userId, entityType: 'AI_AGENT_ACTION', entityId: action.id, readAt: null }, data: { status: NotificationStatus.READ, readAt: new Date() } });
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.AI_AGENT_ACTION_CONFIRMED, entityType: 'AI_AGENT_ACTION', entityId: action.id, metadata: { tool: action.toolName } });
      const message = language === 'ru' ? '✅ Действие успешно выполнено.' : '✅ Amal muvaffaqiyatli bajarildi.';
      if (action.conversationId) await this.prisma.message.create({ data: { conversationId: action.conversationId, role: MessageRole.ASSISTANT, content: message } });
      return { status: 'success', message, data: action.toolName === '__batch__' ? data : data[0] };
    } catch (error) {
      await this.prisma.pendingAgentAction.update({ where: { id: action.id }, data: { status: AgentActionStatus.FAILED, errorCode: 'EXECUTION_FAILED' } });
      throw error;
    }
  }

  private async resolveConversation(userId: string, conversationId: string | undefined, message: string) {
    if (conversationId) {
      const conversation = await this.prisma.conversation.findFirst({ where: { id: conversationId, userId } });
      if (!conversation) throw new NotFoundException('Suhbat topilmadi');
      return conversation;
    }
    return this.prisma.conversation.create({ data: { userId, title: message.slice(0, 80) } });
  }

  private systemPrompt(user: { firstName: string; lastName: string; timezone: string; language: string; memoryEnabled: boolean }, memories: Array<{ key: string; value: string; type: string; isVerified: boolean; confidence: number; contact: { displayName: string } | null }>) {
    const memoryLines = memories.map((memory) => `- [${memory.type}] ${memory.key}: ${memory.value}${memory.contact ? ` (${memory.contact.displayName})` : ''}${memory.isVerified ? ' [tasdiqlangan]' : ` [taxmin ${memory.confidence}%]`}`).join('\n');
    const responseLanguage = user.language === 'ru' ? 'rus tilida' : "o‘zbek tilida";
    return `Siz Qulay AI — tadbirkorning shaxsiy ish agentisiz. Foydalanuvchi: ${user.firstName} ${user.lastName}. Til: ${user.language}. Vaqt zonasi: ${user.timezone}.
Qoidalar:
1. Foydalanuvchiga qisqa, aniq va tabiiy ${responseLanguage} javob bering. Boshqa tilni aralashtirmang.
2. Mavjud tool bo‘lsa, bajarilgan deb yolg‘on aytmang — tool’dan foydalaning.
3. Har qanday WRITE tool uchun tasdiqlash shart. Tasdiqsiz pul, vazifa, uchrashuv, xotira yoki xabar yozmang.
4. Taxminiy xotirani fakt deb ko‘rsatmang. Qarama-qarshi ma’lumot bo‘lsa, foydalanuvchidan aniqlashtiring.
5. Pul bo‘yicha UZS va USD ni aralashtirmang. Foyda = daromad - xarajat.
6. Bir so‘rovdagi bir nechta ishni rejalab, tool’lar orqali ketma-ket bajaring.

Uzoq muddatli xotira:
${memoryLines || '- Hozircha saqlangan xotira yo‘q.'}`;
  }

  private toProviderRole(role: MessageRole): 'user' | 'assistant' | 'tool' {
    if (role === MessageRole.ASSISTANT) return 'assistant';
    if (role === MessageRole.TOOL) return 'tool';
    return 'user';
  }

  private parseToolInput(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
      return parsed as Record<string, unknown>;
    } catch {
      throw new BadRequestException('AI tool argumentlari noto‘g‘ri shakllandi');
    }
  }

  private confirmationPrompt(tool: string, preview: unknown, language = 'uz'): string {
    if (language === 'ru') {
      const labels: Record<string, string> = { create_task: 'Создать задачу?', create_reminder: 'Создать напоминание?', create_meeting: 'Создать встречу?', create_note: 'Сохранить заметку?', save_memory: 'Сохранить это в памяти AI?', create_finance_transaction: 'Сохранить финансовую запись?', send_telegram_message: 'Отправить сообщение в Telegram?', create_google_calendar_event: 'Создать событие в Google Календаре?', update_google_calendar_event: 'Обновить событие Google Календаря?', delete_google_calendar_event: 'Удалить событие Google Календаря?' };
      const details = preview && typeof preview === 'object' ? `\n${JSON.stringify(preview)}` : '';
      return `${labels[tool] ?? 'Выполнить это действие?'}${details}`;
    }
    const labels: Record<string, string> = {
      create_task: 'Vazifa yaratilsinmi?', create_reminder: 'Eslatma yaratilsinmi?', create_meeting: 'Uchrashuv yaratilsinmi?',
      create_note: 'Qayd saqlansinmi?', create_contact: 'Kontakt saqlansinmi?', save_memory: 'Bu ma’lumot AI xotirasiga saqlansinmi?',
      update_contact: 'Kontakt ma’lumoti tuzatilsinmi?', delete_contact: 'Kontakt o‘chirilsinmi?',
      update_memory: 'AI xotirasidagi ma’lumot tuzatilsinmi?', delete_memory: 'Bu ma’lumot AI xotirasidan unutulsinmi?',
      create_finance_transaction: 'Moliyaviy yozuv saqlansinmi?', send_telegram_message: 'Telegram xabari yuborilsinmi?',
      create_google_calendar_event: 'Google Calendar hodisasi yaratilsinmi?', update_google_calendar_event: 'Google Calendar hodisasi yangilansinmi?', delete_google_calendar_event: 'Google Calendar hodisasi o‘chirilsinmi?',
    };
    const details = preview && typeof preview === 'object' ? `\n${JSON.stringify(preview)}` : '';
    return `${labels[tool] ?? 'Ushbu amal bajarilsinmi?'}${details}`;
  }
}
