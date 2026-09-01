import { BadRequestException } from '@nestjs/common';

export enum AIToolCategory {
  TASK = 'TASK',
  REMINDER = 'REMINDER',
  MEETING = 'MEETING',
  NOTE = 'NOTE',
  CONTACT = 'CONTACT',
  MEMORY = 'MEMORY',
  FINANCE = 'FINANCE',
  TODAY = 'TODAY',
  SYSTEM = 'SYSTEM',
  GOOGLE = 'GOOGLE',
  FILE = 'FILE',
}

export type AIToolSideEffect = 'READ' | 'WRITE';
export type AIToolPermission = 'USER_SCOPED';

export type AIToolExecutionContext = {
  userId: string;
  requestId: string;
  /** Optional caller-provided key; persistence/deduplication can be added later. */
  idempotencyKey?: string;
  locale: string;
  timezone?: string;
  source: string;
};

export type AIToolInputSchema = {
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: readonly string[]; items?: { type: string } }>;
  required: readonly string[];
};

export interface AIToolDefinition<TInput, TResult> {
  name: string;
  description: string;
  category: AIToolCategory;
  inputSchema: AIToolInputSchema;
  requiresConfirmation: boolean;
  sideEffect: AIToolSideEffect;
  permission: AIToolPermission;
  validate(input: unknown): Promise<TInput>;
  authorize?(context: AIToolExecutionContext, input: TInput): Promise<void>;
  preview?(context: AIToolExecutionContext, input: TInput): Promise<unknown> | unknown;
  execute(context: AIToolExecutionContext, input: TInput): Promise<TResult> | TResult;
}

export type AIToolMetadata = Pick<
  AIToolDefinition<unknown, unknown>,
  'name' | 'description' | 'category' | 'inputSchema' | 'requiresConfirmation' | 'sideEffect' | 'permission'
>;

export type AIToolExecutionSuccess = {
  status: 'success';
  tool: string;
  data: unknown;
  meta: { executedAt: string; requestId: string };
};

export type AIToolConfirmationRequired = {
  status: 'confirmation_required';
  input?: unknown;
  tool: string;
  preview: unknown;
  meta: { requestId: string };
};

/**
 * Persistence seam for a future durable idempotency implementation.
 * The current foundation accepts and propagates the key but deliberately does
 * not use an in-memory store that would be unsafe across backend instances.
 */
export interface AIToolIdempotencyStore {
  find(userId: string, toolName: string, key: string): Promise<AIToolExecutionSuccess | null>;
  save(userId: string, toolName: string, key: string, result: AIToolExecutionSuccess): Promise<void>;
}

export function assertToolObject(input: unknown): asserts input is Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('Tool input must be an object');
  }
}
