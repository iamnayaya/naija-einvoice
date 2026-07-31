import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { handleIncomingMessage } from './stateMachine';
import { MockWhatsAppSender } from './sender';
import { parseMessage } from '../parser';
import type { PreferredLanguage } from '../domain/enums';

loadEnv({ path: resolve(import.meta.dirname, '../../../../.env') });

/**
 * End-to-end conversational flow tests (DB-backed):
 *
 *   message -> parseMessage -> decideTurn -> ConversationState persisted ->
 *   Transactions created -> enqueue() invoked with their ids
 *
 * The messages themselves are run through the real parser first so the
 * expected intermediate states are verified, and the pre-flight parse
 * assertions hold even when the DB is unavailable (the DB flow is skipped).
 */

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://naija:naija@localhost:5432/naija_einvoice_test?schema=public';

const testPrisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });

let dbAvailable = true;

function itIf(description: string, fn: () => Promise<void>) {
  it(description, async () => {
    if (!dbAvailable) {
      console.warn(`skipped (no test DB): ${description}`);
      return;
    }
    await fn();
  });
}

let phoneCounter = 0;
function uniquePhone() {
  phoneCounter += 1;
  return `234${String(Date.now()).slice(-9)}${phoneCounter}`;
}

interface FlowSetup {
  sender: MockWhatsAppSender;
  sent: unknown[];
  enqueued: string[][];
  merchantId: string;
  threadId: string;
  language: PreferredLanguage;
}

async function newFlow(language: PreferredLanguage): Promise<FlowSetup> {
  const sent: unknown[] = [];
  const sender = new MockWhatsAppSender((payload) => sent.push(payload));
  const enqueued: string[][] = [];
  const merchant = await testPrisma.merchant.create({
    data: { businessName: 'CONVERSATION TEST', phone: uniquePhone(), state: 'Lagos', preferredLanguage: language },
  });
  return {
    sender,
    sent,
    enqueued,
    merchantId: merchant.id,
    threadId: uniquePhone(),
    language,
  };
}

async function say(flow: FlowSetup, text: string) {
  return handleIncomingMessage(
    {
      prisma: testPrisma,
      sender: flow.sender,
      enqueue: async ({ transactionIds }) => {
        flow.enqueued.push(transactionIds);
      },
      logTransition: () => undefined,
    },
    { merchantId: flow.merchantId, whatsappThreadId: flow.threadId, text, preferredLanguage: flow.language },
  );
}

describe('conversational invoice flow (integration)', () => {
  beforeAll(async () => {
    try {
      await testPrisma.$queryRaw`SELECT 1`;
    } catch {
      dbAvailable = false;
      console.warn(
        'Test DB unreachable — start docker compose and run `pnpm test:db:push` to enable integration tests.',
      );
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await testPrisma.transaction.deleteMany({
        where: { merchant: { businessName: 'CONVERSATION TEST' } },
      });
      await testPrisma.merchant.deleteMany({ where: { businessName: 'CONVERSATION TEST' } });
    }
    await testPrisma.$disconnect();
  });

  it('the thread messages parse as the flow expects', async () => {
    expect((await parseMessage('ina sayar da shoe')).status).toBe('clarify');
    expect((await parseMessage('5000')).status).toBe('clarify');
    expect((await parseMessage('eh')).status).toBe('affirmation');
    expect((await parseMessage('na sell garri o')).status).toBe('clarify');
    expect((await parseMessage('yes')).status).toBe('affirmation');
    expect((await parseMessage('sold shoe 5k and bag 8k')).status).toBe('parsed');
  });

  itIf('Hausa: partial sale -> merged amount -> YES enqueues one transaction', async () => {
    const flow = await newFlow('ha');

    const first = await say(flow, 'ina sayar da shoe');
    expect(first.state).toBe('awaiting_details');
    expect(first.reply).toContain('Nawa'); // ha ask_amount
    expect(first.createdTransactionIds).toHaveLength(0);

    const second = await say(flow, '5000');
    expect(second.state).toBe('awaiting_confirmation');
    expect(second.reply).toContain('shoe');

    const third = await say(flow, 'eh');
    expect(third.state).toBe('processing');
    expect(third.createdTransactionIds).toHaveLength(1);

    expect(flow.enqueued).toEqual([[expect.any(String)]]);
    expect(flow.sent).toHaveLength(3);

    const transaction = await testPrisma.transaction.findUnique({
      where: { id: third.createdTransactionIds[0] },
    });
    expect(transaction!.amount.toFixed(2)).toBe('5000.00');
    expect(transaction!.source).toBe('whatsapp');

    const conversation = await testPrisma.conversationState.findUnique({
      where: { whatsappThreadId: flow.threadId },
    });
    expect(conversation!.state).toBe('processing');
  });

  itIf('Pidgin: partial sale -> merged amount -> YES enqueues one transaction', async () => {
    const flow = await newFlow('pcm');

    const first = await say(flow, 'na sell garri o');
    expect(first.state).toBe('awaiting_details');
    expect(first.reply).toContain('How much');

    const second = await say(flow, '5000');
    expect(second.state).toBe('awaiting_confirmation');

    const third = await say(flow, 'yes');
    expect(third.state).toBe('processing');
    expect(third.createdTransactionIds).toHaveLength(1);

    expect(flow.enqueued).toEqual([[expect.any(String)]]);
    const transaction = await testPrisma.transaction.findUnique({
      where: { id: third.createdTransactionIds[0] },
    });
    expect(transaction!.amount.toFixed(2)).toBe('5000.00');
  });

  itIf('English: multi-sale confirmation enqueues two transactions', async () => {
    const flow = await newFlow('en');

    const first = await say(flow, 'sold shoe 5k and bag 8k');
    expect(first.state).toBe('awaiting_confirmation');
    expect(first.reply).toContain('2 items');

    const second = await say(flow, 'yes');
    expect(second.state).toBe('processing');
    expect(second.createdTransactionIds).toHaveLength(2);

    expect(flow.enqueued).toEqual([[expect.any(String), expect.any(String)]]);
  });

  itIf('correction before confirm updates the amount on the stored transaction', async () => {
    const flow = await newFlow('en');

    await say(flow, 'sold shoe 5k to Amina');
    const corrected = await say(flow, 'wait i mean 6000');
    expect(corrected.state).toBe('awaiting_confirmation');
    expect(corrected.reply).toContain('6000');

    const confirmed = await say(flow, 'yes');
    const transaction = await testPrisma.transaction.findUnique({
      where: { id: confirmed.createdTransactionIds[0] },
    });
    expect(transaction!.amount.toFixed(2)).toBe('6000.00');
    expect(transaction!.customerRef).toBe('Amina');
  });
});
