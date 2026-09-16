import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export type SalesChannel = 'TELEGRAM' | 'WHATSAPP' | 'INSTAGRAM';

export type SalesTurnHandle = {
  key: string;
  generation: number;
  signal: AbortSignal;
};

const queues = new Map<string, Promise<void>>();
const reservationQueues = new Map<string, Promise<void>>();
const generations = new Map<string, { value: number; touchedAt: number }>();
const fallbackReceipts = new Map<string, number>();
const textFragments = new Map<string, { items: string[]; touchedAt: number }>();
const MAX_EPHEMERAL_KEYS = 10_000;
const EPHEMERAL_TTL_MS = 6 * 60 * 60 * 1000;

function cleanupEphemeral(now = Date.now()): void {
  if (generations.size < MAX_EPHEMERAL_KEYS && fallbackReceipts.size < MAX_EPHEMERAL_KEYS && textFragments.size < MAX_EPHEMERAL_KEYS) return;
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
 * DB receipt prevents duplicate webhook/listener deliveries across processes.
 * The generation is used only to coalesce clearly incomplete typing fragments;
 * it never cancels a complete customer message or an in-flight AI reply.
 */
export async function reserveSalesInboundTurn(
  prisma: PrismaService,
  channel: SalesChannel,
  userId: string,
  peerId: string,
  messageId: string,
): Promise<SalesTurnHandle | null> {
  cleanupEphemeral();
  const key = `${channel}:${userId}:${peerId}`;
  const receiptKey = `${key}:${messageId}`;

  // Listener/webhook callbacks can arrive almost simultaneously. Previously
  // each callback awaited its DB receipt independently, so a later Telegram
  // message could finish the INSERT first, enter the processing queue first,
  // advance lastInboundMessageId and make the earlier (valid) message look
  // stale. Serialize receipt reservation per customer chat before assigning a
  // generation. This preserves ingress order while DB uniqueness still gives
  // cross-process idempotency.
  const previousReservation = reservationQueues.get(key) ?? Promise.resolve();
  let releaseReservation: (() => void) | undefined;
  const reservationTail = new Promise<void>(resolve => { releaseReservation = resolve; });
  reservationQueues.set(key, previousReservation.catch(() => undefined).then(() => reservationTail));
  await previousReservation.catch(() => undefined);

  try {
    try {
      await prisma.salesInboundReceipt.create({
        data: { channel, userId, peerId: peerId.slice(0, 200), messageId: messageId.slice(0, 200) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
      if (!isSchemaLagError(error)) throw error;
      if (fallbackReceipts.has(receiptKey)) return null;
      fallbackReceipts.set(receiptKey, Date.now());
    }

    const generation = (generations.get(key)?.value ?? 0) + 1;
    generations.set(key, { value: generation, touchedAt: Date.now() });
    // We deliberately do not abort older complete turns. A human can send the
    // next message while the seller is thinking; both replies still need to
    // arrive in order. Generations are used only to hand incomplete fragments
    // to the newest turn.
    return { key, generation, signal: new AbortController().signal };
  } finally {
    releaseReservation?.();
    const queued = reservationQueues.get(key);
    if (queued) void queued.finally(() => {
      if (reservationQueues.get(key) === queued) reservationQueues.delete(key);
    });
  }
}

/**
 * Only unmistakably incomplete typing pieces are debounced. Full questions
 * such as “2 ta olsam qancha?” and “qizil rangidan bormi?” must remain separate
 * turns even when sent quickly, otherwise one of the questions appears to be
 * ignored.
 */
export function isLikelySalesTextFragment(text: string): boolean {
  const clean = text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  if (!clean || /[?!]/u.test(clean)) return false;
  if (/^(?:alo\s+sotuvchi|salom|mayli|xo['‘’]?p|hop|ha|yo['‘’]?q)$/iu.test(clean)) return false;
  if (/^(?:\d+(?:[.,]\d+)?)$/u.test(clean)) return true;
  if (/^(?:l|ltr|litr|litrdan|litridan|litrlik|ml|kg|gramm|dona|ta|rangidan|rang|modeldan|variantdan)$/iu.test(clean)) return true;
  return false;
}

export function bufferSalesTextFragment(turn: SalesTurnHandle, text: string): void {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!clean) return;
  const current = textFragments.get(turn.key);
  const items = [...(current?.items ?? []), clean].slice(-8);
  textFragments.set(turn.key, { items, touchedAt: Date.now() });
}

/** Wait briefly only for an incomplete fragment. A newer turn takes ownership. */
export async function waitForSalesTurnDebounce(turn: SalesTurnHandle, milliseconds = 550): Promise<boolean> {
  if (!isSalesTurnCurrent(turn)) return false;
  await new Promise<void>(resolve => setTimeout(resolve, Math.max(0, milliseconds)));
  return isSalesTurnCurrent(turn);
}

/**
 * Consume pending fragments and optionally append the current complete message.
 * This lets “1” + “litridan” + “5ta olaman” become one semantic turn while
 * never merging two complete questions.
 */
export function consumeSalesTextFragments(turn: SalesTurnHandle, currentText?: string): string | undefined {
  const bucket = textFragments.get(turn.key);
  const current = currentText?.replace(/\s+/g, ' ').trim();
  const items = [...(bucket?.items ?? []), ...(current ? [current] : [])].filter(Boolean);
  if (!items.length) return undefined;
  textFragments.delete(turn.key);
  return items.join('\n').slice(0, 4000);
}

export function isSalesTurnCurrent(turn: SalesTurnHandle): boolean {
  return generations.get(turn.key)?.value === turn.generation;
}

/** Every complete message in one customer chat executes strictly in order. */
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
    if (current?.value === turn.generation) generations.set(turn.key, { ...current, touchedAt: Date.now() });
    queueMicrotask(() => {
      const queued = queues.get(turn.key);
      if (queued) void queued.finally(() => {
        if (queues.get(turn.key) === queued) queues.delete(turn.key);
      });
    });
  }
}
