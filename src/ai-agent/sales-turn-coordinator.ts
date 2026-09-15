import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export type SalesChannel = 'TELEGRAM' | 'WHATSAPP';

export type SalesTurnHandle = {
  key: string;
  generation: number;
  signal: AbortSignal;
};

const queues = new Map<string, Promise<void>>();
const generations = new Map<string, { value: number; touchedAt: number }>();
const fallbackReceipts = new Map<string, number>();
const textFragments = new Map<string, { items: string[]; touchedAt: number }>();
const MAX_EPHEMERAL_KEYS = 10_000;
const EPHEMERAL_TTL_MS = 6 * 60 * 60 * 1000;

function cleanupEphemeral(now = Date.now()): void {
  if (generations.size < MAX_EPHEMERAL_KEYS && fallbackReceipts.size < MAX_EPHEMERAL_KEYS) return;
  for (const [key, value] of generations) {
    if (value.touchedAt < now - EPHEMERAL_TTL_MS && !queues.has(key)) generations.delete(key);
  }
  for (const [key, touchedAt] of fallbackReceipts) {
    if (touchedAt < now - EPHEMERAL_TTL_MS) fallbackReceipts.delete(key);
  }
  for (const [key, value] of textFragments) {
    if (value.touchedAt < now - EPHEMERAL_TTL_MS && !queues.has(key)) textFragments.delete(key);
  }
}

function isSchemaLagError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2021' || error.code === 'P2022');
}

/**
 * DB-level receipt prevents duplicate inbound events across processes/restarts.
 * A bounded in-memory fallback keeps existing integrations alive during the
 * short deploy window before a new migration is applied.
 */
export async function reserveSalesInboundTurn(
  prisma: PrismaService,
  channel: SalesChannel,
  userId: string,
  peerId: string,
  messageId: string,
): Promise<SalesTurnHandle | null> {
  const receiptKey = `${channel}:${userId}:${peerId}:${messageId}`;
  let accepted = false;
  try {
    await prisma.salesInboundReceipt.create({
      data: { channel, userId, peerId: peerId.slice(0, 200), messageId: messageId.slice(0, 200) },
    });
    accepted = true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
    if (!isSchemaLagError(error)) throw error;
    if (fallbackReceipts.has(receiptKey)) return null;
    fallbackReceipts.set(receiptKey, Date.now());
    accepted = true;
  }
  if (!accepted) return null;

  cleanupEphemeral();
  const key = `${channel}:${userId}:${peerId}`;
  const current = generations.get(key);
  const generation = (current?.value ?? 0) + 1;
  // A newer inbound may supersede an older turn only while that older turn is
  // still inside the short debounce window. Never abort a turn that has
  // already reached the AI/tool pipeline: doing so caused normal follow-ups
  // sent while the seller was thinking to silently erase the previous reply.
  // The per-chat queue below preserves reply order, while generation checks
  // coalesce only not-yet-started text fragments.
  generations.set(key, { value: generation, touchedAt: Date.now() });
  return { key, generation, signal: new AbortController().signal };
}


export function bufferSalesTextFragment(turn: SalesTurnHandle, text: string): void {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!clean) return;
  const current = textFragments.get(turn.key);
  const items = [...(current?.items ?? []), clean].slice(-8);
  textFragments.set(turn.key, { items, touchedAt: Date.now() });
}

export async function waitForSalesTurnDebounce(turn: SalesTurnHandle, milliseconds = 700): Promise<boolean> {
  if (turn.signal.aborted || !isSalesTurnCurrent(turn)) return false;
  await new Promise<void>(resolve => {
    const timer = setTimeout(done, Math.max(0, milliseconds));
    const onAbort = () => done();
    function done() {
      clearTimeout(timer);
      turn.signal.removeEventListener('abort', onAbort);
      resolve();
    }
    turn.signal.addEventListener('abort', onAbort, { once: true });
  });
  return isSalesTurnCurrent(turn);
}

export function consumeSalesTextFragments(turn: SalesTurnHandle): string | undefined {
  if (!isSalesTurnCurrent(turn)) return undefined;
  const bucket = textFragments.get(turn.key);
  if (!bucket?.items.length) return undefined;
  textFragments.delete(turn.key);
  return bucket.items.join('\n').slice(0, 4000);
}

export function isSalesTurnCurrent(turn: SalesTurnHandle): boolean {
  const current = generations.get(turn.key);
  return Boolean(current && current.value === turn.generation && !turn.signal.aborted);
}

export async function runSalesTurnSequential<T>(turn: SalesTurnHandle, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(turn.key) ?? Promise.resolve();
  let resolveTail: (() => void) | undefined;
  const tail = new Promise<void>(resolve => { resolveTail = resolve; });
  queues.set(turn.key, previous.catch(() => undefined).then(() => tail));

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    resolveTail?.();
    const current = generations.get(turn.key);
    if (current?.value === turn.generation) {
      generations.set(turn.key, { ...current, touchedAt: Date.now() });
    }
    queueMicrotask(() => {
      const queued = queues.get(turn.key);
      if (queued) void queued.finally(() => {
        if (queues.get(turn.key) === queued) queues.delete(turn.key);
      });
    });
  }
}
