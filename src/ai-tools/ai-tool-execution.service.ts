import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ExecuteToolDto } from './dto/execute-tool.dto';
import { AIToolRegistryService } from './ai-tool-registry.service';
import { AIToolConfirmationRequired, AIToolExecutionContext, AIToolExecutionSuccess } from './types/ai-tool.types';

@Injectable()
export class AIToolExecutionService {
  constructor(private readonly registry: AIToolRegistryService) {}

  async execute(userId: string, request: ExecuteToolDto, contextOptions: { locale?: string; timezone?: string; requestId?: string } = {}): Promise<AIToolExecutionSuccess | AIToolConfirmationRequired> {
    const tool = this.registry.get(request.tool);
    const context: AIToolExecutionContext = {
      userId,
      requestId: request.requestId ?? contextOptions.requestId ?? randomUUID(),
      idempotencyKey: request.idempotencyKey,
      locale: contextOptions.locale ?? 'en',
      timezone: contextOptions.timezone,
      source: 'AI_TOOL',
    };
    const input = await tool.validate(request.input);
    await tool.authorize?.(context, input);

    if (tool.requiresConfirmation && !request.confirmed) {
      const preview = await tool.preview?.(context, input);
      return { status: 'confirmation_required', tool: tool.name, preview: preview ?? input, meta: { requestId: context.requestId } };
    }

    const data = await tool.execute(context, input);
    if (tool.sideEffect === 'WRITE') await this.registry.recordWriteExecution(tool.name, userId, data);
    return { status: 'success', tool: tool.name, data, meta: { executedAt: new Date().toISOString(), requestId: context.requestId } };
  }
}
