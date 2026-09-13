import { normalizeToolInput } from './ai-input-normalizer';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ExecuteToolDto } from './dto/execute-tool.dto';
import { AIToolRegistryService } from './ai-tool-registry.service';
import { AIToolConfirmationRequired, AIToolExecutionContext, AIToolExecutionSuccess } from './types/ai-tool.types';
import { BitoToolBridgeService } from '../bito/bito-tool-bridge.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AiUsageService } from '../usage/usage.service';

@Injectable()
export class AIToolExecutionService {
  constructor(
    private readonly registry: AIToolRegistryService,
    private readonly bitoTools: BitoToolBridgeService,
    private readonly subscriptions: SubscriptionsService,
    private readonly usage: AiUsageService,
  ) {}

  async execute(userId: string, request: ExecuteToolDto, contextOptions: { locale?: string; timezone?: string; requestId?: string } = {}): Promise<AIToolExecutionSuccess | AIToolConfirmationRequired> {
    const requestId = request.requestId ?? contextOptions.requestId ?? randomUUID();
    await this.subscriptions.assertToolAllowed(userId);
    if (this.bitoTools.isBitoAlias(request.tool)) {
      await this.subscriptions.assertFeatureAllowed(userId, 'BITO');
      const result = await this.bitoTools.execute(userId, request.tool, request.input, Boolean(request.confirmed), requestId);
      if (result.status === 'success') void this.usage.logToolUsage({ userId, model: 'tool-registry' }).catch(() => undefined);
      return result;
    }
    if (request.tool.includes('google_')) await this.subscriptions.assertFeatureAllowed(userId, 'GOOGLE');
    if (request.tool.includes('telegram_')) await this.subscriptions.assertFeatureAllowed(userId, 'TELEGRAM');
    const tool = this.registry.get(request.tool);
    const context: AIToolExecutionContext = {
      userId,
      requestId,
      idempotencyKey: request.idempotencyKey,
      locale: contextOptions.locale ?? 'en',
      timezone: contextOptions.timezone,
      source: 'AI_TOOL',
    };
    const input = await tool.validate(normalizeToolInput(request.tool, request.input, context.timezone));
    await tool.authorize?.(context, input);

    if (tool.requiresConfirmation && !request.confirmed) {
      const preview = await tool.preview?.(context, input);
      return { status: 'confirmation_required', tool: tool.name, input, preview: preview ?? input, meta: { requestId: context.requestId } };
    }

    const data = await tool.execute(context, input);
    if (tool.sideEffect === 'WRITE') await this.registry.recordWriteExecution(tool.name, userId, data).catch(() => undefined);
    void this.usage.logToolUsage({ userId, model: 'tool-registry' }).catch(() => undefined);
    return { status: 'success', tool: tool.name, data, meta: { executedAt: new Date().toISOString(), requestId: context.requestId } };
  }
}
