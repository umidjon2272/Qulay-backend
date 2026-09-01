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
        try {
          const input = this.parseToolInput(call.function.arguments);
          const execution = await this.execution.execute(
            userId,
            { tool: call.function.name, input, confirmed: false, requestId: call.id },
            { locale: user.language, timezone: user.timezone },
          );

          if (execution.status === 'confirmation_required') {
            pendingCalls.push({ toolName: call.function.name, input, preview: execution.preview });
            continue;
          }

          await this.usage.logToolUsage({ userId, model: 'tool-registry' });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ ok: true, data: execution.data }),
          });
        } catch (error) {
          // Tool xatosi butun chatni generic error bilan yiqitmasin.
          // Model faqat xavfsiz, foydalanuvchiga aytish mumkin bo'lgan natijani ko'radi.
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(this.safeToolFailure(call.function.name, error, user.language)),
          });
        }
      }      if (pendingCalls.length) {
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
    const fallback = user.language === 'ru'
      ? 'РЇ РЅРµ СЃРјРѕРі РЅР°РґС‘Р¶РЅРѕ Р·Р°РІРµСЂС€РёС‚СЊ СЌС‚РѕС‚ Р·Р°РїСЂРѕСЃ. РЈС‚РѕС‡РЅРёС‚Рµ РѕРґРёРЅ РєР»СЋС‡РµРІРѕР№ РјРѕРјРµРЅС‚ РёР»Рё РЅР°РїРёС€РёС‚Рµ РЅРµРјРЅРѕРіРѕ РёРЅР°С‡Рµ.'
      : 'Bu soвЂrovni hozir ishonchli yakunlay olmadim. Bitta muhim joyini aniqlashtiring yoki biroz boshqacha yozing.';
    await this.prisma.message.create({
      data: { conversationId: conversation.id, role: MessageRole.ASSISTANT, content: fallback },
    });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.AI_AGENT_MESSAGE,
      entityType: 'CONVERSATION',
      entityId: conversation.id,
    });
    return { conversationId: conversation.id, message: fallback, pendingConfirmation: null };  }

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
    const memoryLines = memories
      .map((memory) => `- [${memory.type}] ${memory.key}: ${memory.value}${memory.contact ? ` (${memory.contact.displayName})` : ''}${memory.isVerified ? ' [tasdiqlangan]' : ` [taxmin ${memory.confidence}%]`}`)
      .join('\n');
    const responseLanguage = user.language === 'ru' ? 'rus tilida' : "oвЂzbek tilida";

    return `Siz Qulay AI вЂ” foydalanuvchini tabiiy tilda tushunadigan shaxsiy ish agentisiz.
Foydalanuvchi: ${user.firstName} ${user.lastName}. Til: ${user.language}. Vaqt zonasi: ${user.timezone}.

ASOSIY MAQSAD:
Foydalanuvchi mukammal yozishi shart emas. U tez, xato, slang, qisqartma, tinish belgilarisiz yoki ogвЂzaki uslubda yozishi mumkin. Avval yozuvni emas, uning asl MAQSADINI tushuning.

TUSHUNISH QOIDALARI:
1. OвЂzbekcha xato yozuv, tushib qolgan harf, chat uslubi va fonetik yozuvni kontekstdan tiklashga harakat qiling.
2. Misollar: "kere"в‰€"kerak", "qber"в‰€"qilib ber", "topda"в‰€"top va", "yozvori"в‰€"yozib yubor", "manga"в‰€"menga". Bu yopiq lugвЂat emas.
3. MaвЂ™no yetarlicha aniq boвЂlsa, imlo xatosi sabab foydalanuvchini toвЂxtatmang.
4. Faqat xavfsiz bajarish uchun zarur maвЂ™lumot yetishmasa yoki ikki jiddiy talqin boвЂlsa BITTA qisqa savol bilan aniqlashtiring.
5. "unga", "oвЂshanga", "usha odam", "u aka", "oldingi odam" kabi referentlarni suhbat tarixidagi eng yaqin aniq shaxs yoki obyekt bilan bogвЂlashga harakat qiling. Noaniq boвЂlsa taxmin qilib notoвЂgвЂri odamga amal qilmang.

HAQIQAT VA TOOL QOIDALARI:
1. Real ishni faqat mavjud tool orqali bajaring.
2. Tool ishlatmasdan "topdim", "yubordim", "yaratdim", "oвЂchirdim" yoki "bajardim" demang.
3. Tool boвЂsh natija qaytarsa, aniq "topilmadi" deb ayting. Hech narsani uydirmang.
4. Tool xato qaytarsa, shu amal bajarilmagan. Bir xil muvaffaqiyatsiz toolвЂ™ni bir xil argument bilan qayta-qayta chaqirmang.
5. Tool vaqtincha ishlamasa, foydalanuvchiga sodda sabab ayting. Ichki exception, stack trace, JSON yoki tool nomlarini koвЂrsatmang.
6. Sizda kerakli tool boвЂlmasa: "Buni hozir bajara olmayman" deb aniq ayting va mavjud boвЂlsa eng yaqin yordamni taklif qiling.
7. Qila olmaydigan ishni bajarilgandek koвЂrsatmang.

TELEGRAM:
1. Odam yoki chat topish uchun avval search_telegram_chats ishlating.
2. Natija 0 ta boвЂlsa: Telegramda bunday kontakt/chat topilmaganini ayting; kerak boвЂlsa ism yoki @usernameвЂ™ni soвЂrang.
3. Bir nechta mos natija boвЂlsa va qaysi biri ekani noaniq boвЂlsa, qisqa variantlar bilan aniqlashtiring.
4. Bitta aniq natija topilib, user unga xabar yuborishni ham soвЂragan boвЂlsa, aynan tool qaytargan real peerId bilan send_telegram_message tayyorlang.
5. peerId, username yoki Telegram akkauntni hech qachon uydirmang.
6. Xabar yuborish har doim WRITE va foydalanuvchi tasdigвЂini talab qiladi.

KOвЂP BOSQICHLI BUYRUQ:
Masalan "Shamshod akani topda unga pul tejash kere aka deb yoz":
1) Shamshod akani qidiring;
2) real natijani tekshiring;
3) topilmasa topilmadi deb ayting;
4) topilsa oвЂsha peerIdga "pul tejash kere aka" mazmunidagi xabarni tayyorlang;
5) yuborishdan oldin tasdiq soвЂrang.

WRITE:
Har qanday WRITE tool uchun aniq tasdiq shart. Tasdiqsiz Telegram xabari yubormang, vazifa/eslatma/uchrashuv/kontakt/xotira/moliya yozuvi yaratmang, oвЂzgartirmang yoki oвЂchirmang.

JAVOB:
Qisqa, tabiiy va ${responseLanguage} gapiring. Foydalanuvchining xato yozuvini masxara qilmang va keraksiz tuzatmang. Generic "muammo yuz berdi" oвЂrniga imkon qadar aniq natija ayting.

MOLIYA:
UZS va USD ni aralashtirmang. Tool bermagan raqamni taxmin qilmang. Foyda = daromad - xarajat.

UZOQ MUDDATLI XOTIRA:
${memoryLines || '- Hozircha saqlangan xotira yoвЂq.'}`;
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

  private safeToolFailure(toolName: string, error: unknown, language: string) {
    const raw = this.extractSafeErrorText(error).toUpperCase();
    const isRu = language === 'ru';

    let code = 'TOOL_FAILED';
    let message = isRu ? 'РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РїРѕР»РЅРёС‚СЊ СЌС‚Рѕ РґРµР№СЃС‚РІРёРµ.' : 'Bu amalni bajarib boвЂlmadi.';

    if (raw.includes('PEER_NOT_FOUND') || raw.includes('NOT FOUND') || raw.includes('TOPILMADI')) {
      code = 'NOT_FOUND';
      message = isRu
        ? 'РќСѓР¶РЅС‹Р№ Telegram-РєРѕРЅС‚Р°РєС‚ РёР»Рё РѕР±СЉРµРєС‚ РЅРµ РЅР°Р№РґРµРЅ.'
        : 'Kerakli Telegram kontakt yoki obyekt topilmadi.';
    } else if (raw.includes('NOT CONNECTED') || raw.includes('DISCONNECTED')) {
      code = 'NOT_CONNECTED';
      message = isRu ? 'Telegram СЃРµР№С‡Р°СЃ РЅРµ РїРѕРґРєР»СЋС‡С‘РЅ.' : 'Telegram hozir ulanmagan.';
    } else if (raw.includes('UNAVAILABLE') || raw.includes('TEMPORAR') || raw.includes('TIMEOUT')) {
      code = 'TEMPORARILY_UNAVAILABLE';
      message = isRu
        ? 'РЎРµСЂРІРёСЃ РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.'
        : 'Xizmat vaqtincha ishlamayapti. Birozdan keyin qayta urinib koвЂring.';
    } else if (raw.includes('INVALID')) {
      code = 'INVALID_INPUT';
      message = isRu
        ? 'РџР°СЂР°РјРµС‚СЂС‹ РґРµР№СЃС‚РІРёСЏ СЃС„РѕСЂРјРёСЂРѕРІР°РЅС‹ РЅРµРІРµСЂРЅРѕ.'
        : 'Amal parametrlari notoвЂgвЂri shakllandi.';
    }

    return { ok: false, tool: toolName, code, message };
  }

  private extractSafeErrorText(error: unknown): string {
    if (!error || typeof error !== 'object') return String(error ?? '');

    const value = error as {
      message?: unknown;
      code?: unknown;
      response?: unknown;
      getResponse?: () => unknown;
    };

    const parts: string[] = [];
    if (typeof value.code === 'string') parts.push(value.code);
    if (typeof value.message === 'string') parts.push(value.message);

    try {
      const response = typeof value.getResponse === 'function' ? value.getResponse() : value.response;
      if (typeof response === 'string') {
        parts.push(response);
      } else if (response && typeof response === 'object') {
        const objectResponse = response as { message?: unknown; code?: unknown };
        if (typeof objectResponse.code === 'string') parts.push(objectResponse.code);
        if (typeof objectResponse.message === 'string') parts.push(objectResponse.message);
        if (Array.isArray(objectResponse.message)) {
          parts.push(...objectResponse.message.filter((item): item is string => typeof item === 'string'));
        }
      }
    } catch {
      // Xatoni o'qishning o'zi agentni yiqitmasligi kerak.
    }

    return parts.join(' ').slice(0, 500);
  }

  private confirmationPrompt(tool: string, preview: unknown, language = 'uz'): string {
    if (language === 'ru') {
      const labels: Record<string, string> = {
        create_task: 'РЎРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ?',
        create_reminder: 'РЎРѕР·РґР°С‚СЊ РЅР°РїРѕРјРёРЅР°РЅРёРµ?',
        create_meeting: 'РЎРѕР·РґР°С‚СЊ РІСЃС‚СЂРµС‡Сѓ?',
        create_note: 'РЎРѕС…СЂР°РЅРёС‚СЊ Р·Р°РјРµС‚РєСѓ?',
        create_contact: 'РЎРѕС…СЂР°РЅРёС‚СЊ РєРѕРЅС‚Р°РєС‚?',
        save_memory: 'РЎРѕС…СЂР°РЅРёС‚СЊ СЌС‚Рѕ РІ РїР°РјСЏС‚Рё AI?',
        update_contact: 'РћР±РЅРѕРІРёС‚СЊ РєРѕРЅС‚Р°РєС‚?',
        delete_contact: 'РЈРґР°Р»РёС‚СЊ РєРѕРЅС‚Р°РєС‚?',
        update_memory: 'РћР±РЅРѕРІРёС‚СЊ РїР°РјСЏС‚СЊ AI?',
        delete_memory: 'РЈРґР°Р»РёС‚СЊ СЌС‚Рѕ РёР· РїР°РјСЏС‚Рё AI?',
        create_finance_transaction: 'РЎРѕС…СЂР°РЅРёС‚СЊ С„РёРЅР°РЅСЃРѕРІСѓСЋ Р·Р°РїРёСЃСЊ?',
        send_telegram_message: 'РћС‚РїСЂР°РІРёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ РІ Telegram?',
        create_google_calendar_event: 'РЎРѕР·РґР°С‚СЊ СЃРѕР±С‹С‚РёРµ Google РљР°Р»РµРЅРґР°СЂСЏ?',
        update_google_calendar_event: 'РћР±РЅРѕРІРёС‚СЊ СЃРѕР±С‹С‚РёРµ Google РљР°Р»РµРЅРґР°СЂСЏ?',
        delete_google_calendar_event: 'РЈРґР°Р»РёС‚СЊ СЃРѕР±С‹С‚РёРµ Google РљР°Р»РµРЅРґР°СЂСЏ?',
      };
      return `${labels[tool] ?? 'Р’С‹РїРѕР»РЅРёС‚СЊ СЌС‚Рѕ РґРµР№СЃС‚РІРёРµ?'}${this.formatConfirmationPreview(tool, preview, 'ru')}`;
    }

    const labels: Record<string, string> = {
      create_task: 'Vazifa yaratilsinmi?',
      create_reminder: 'Eslatma yaratilsinmi?',
      create_meeting: 'Uchrashuv yaratilsinmi?',
      create_note: 'Qayd saqlansinmi?',
      create_contact: 'Kontakt saqlansinmi?',
      save_memory: 'Bu maвЂ™lumot AI xotirasiga saqlansinmi?',
      update_contact: 'Kontakt maвЂ™lumoti tuzatilsinmi?',
      delete_contact: 'Kontakt oвЂchirilsinmi?',
      update_memory: 'AI xotirasidagi maвЂ™lumot tuzatilsinmi?',
      delete_memory: 'Bu maвЂ™lumot AI xotirasidan unutulsinmi?',
      create_finance_transaction: 'Moliyaviy yozuv saqlansinmi?',
      send_telegram_message: 'Telegram xabari yuborilsinmi?',
      create_google_calendar_event: 'Google Calendar hodisasi yaratilsinmi?',
      update_google_calendar_event: 'Google Calendar hodisasi yangilansinmi?',
      delete_google_calendar_event: 'Google Calendar hodisasi oвЂchirilsinmi?',
    };
    return `${labels[tool] ?? 'Ushbu amal bajarilsinmi?'}${this.formatConfirmationPreview(tool, preview, 'uz')}`;
  }

  private formatConfirmationPreview(tool: string, preview: unknown, language: 'uz' | 'ru'): string {
    if (!preview || typeof preview !== 'object') return '';

    const value = preview as Record<string, unknown>;
    if (tool === 'send_telegram_message') {
      const recipient = typeof value.recipient === 'string' ? value.recipient : '';
      const text = typeof value.text === 'string' ? value.text : '';
      if (language === 'ru') {
        return `\nРџРѕР»СѓС‡Р°С‚РµР»СЊ: ${recipient || 'Telegram'}${text ? `\nРЎРѕРѕР±С‰РµРЅРёРµ: ${text}` : ''}`;
      }
      return `\nQabul qiluvchi: ${recipient || 'Telegram'}${text ? `\nXabar: ${text}` : ''}`;
    }

    return `\n${JSON.stringify(preview)}`;
  }
}