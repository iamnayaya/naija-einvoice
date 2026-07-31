import { createHmac } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import type { Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, type InvoiceDraft, type SubmissionResult } from '@naija/shared';
import { processInvoiceSubmission } from '../../../whatsapp-worker/src/jobs/invoiceSubmission';
import { ingestPosWebhook } from './pos.service';

loadEnv({ path: resolve(import.meta.dirname, '../../../../.env') });

/**
 * POS webhook → invoice pipeline integration test.
 *
 * Simulates a real Paystack virtual-terminal `charge.success` webhook (exact
 * bytes signed with the test secret) and drives it through ingestion,
 * deduplication, terminal resolution, and — via the SAME worker function the
 * WhatsApp pipeline uses — into a validated invoice. This proves POS and
 * WhatsApp sales converge on one pipeline.
 *
 * Requires the local Postgres test schema (see docker-compose + `pnpm
 * test:db:push`). Skips with a warning when the DB is unreachable.
 */

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://naija:naija@localhost:5432/naija_einvoice_test?schema=public';

const testPrisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });

const SECRET = 'sk_test_vitest_secret';
const TERMINAL_REF = 'VT_68SBY77G';

let dbAvailable = true;

const providerOk = {
  submit: async (draft: InvoiceDraft): Promise<SubmissionResult> => ({
    ok: true,
    irn: `NRS-${draft.invoiceNumber}`,
    csid: 'CSID-TEST',
    qrCodeUrl: `https://mock-nrs.test/qr/${draft.invoiceNumber}`,
  }),
};

function itIf(description: string, fn: () => Promise<void>) {
  it(description, async () => {
    if (!dbAvailable) {
      console.warn(`skipped (no test DB): ${description}`);
      return;
    }
    await fn();
  });
}

let merchantPhoneCounter = 0;
function uniqueMerchantPhone() {
  merchantPhoneCounter += 1;
  return `2349${String(Date.now()).slice(-8)}${merchantPhoneCounter}`;
}

async function createMerchantWithTerminal() {
  const merchant = await testPrisma.merchant.create({
    data: {
      businessName: 'POS INTEGRATION TEST',
      phone: uniqueMerchantPhone(),
      state: 'Lagos',
      preferredLanguage: 'en',
    },
  });
  const terminal = await testPrisma.posTerminal.create({
    data: { provider: 'paystack', terminalRef: TERMINAL_REF, merchantId: merchant.id },
  });
  return { merchant, terminal };
}

/** The exact `charge.success` payload Paystack sends for a virtual-terminal sale. */
function paystackTerminalCharge(reference = 'T173424527684156') {
  return {
    event: 'charge.success',
    data: {
      id: 4677002219,
      domain: 'test',
      status: 'success',
      reference,
      amount: 500000,
      paid_at: '2025-02-11T10:42:20.000Z',
      channel: 'card',
      currency: 'NGN',
      source: {
        type: 'offline',
        source: 'virtual_terminal',
        entry_point: 'request_inline',
        identifier: TERMINAL_REF,
      },
    },
  };
}

function rawSigned(body: unknown) {
  const raw = JSON.stringify(body);
  return Buffer.from(raw, 'utf8');
}

describe('POS webhook ingestion (integration)', () => {
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
        where: { merchant: { businessName: 'POS INTEGRATION TEST' } },
      });
      await testPrisma.posTerminal.deleteMany({
        where: { merchant: { businessName: 'POS INTEGRATION TEST' } },
      });
      await testPrisma.merchant.deleteMany({ where: { businessName: 'POS INTEGRATION TEST' } });
    }
    await testPrisma.$disconnect();
  });

  itIf('a signed Paystack POS webhook creates a Transaction and validates an invoice', async () => {
    const { merchant } = await createMerchantWithTerminal();
    const enqueued: string[] = [];
    const reference = `T${Date.now()}`;
    const body = paystackTerminalCharge(reference);
    const sig = createHmac('sha512', SECRET).update(JSON.stringify(body)).digest('hex');

    const result = await ingestPosWebhook(
      { prisma: testPrisma, enqueue: async (id) => void enqueued.push(id) },
      {
        provider: 'paystack',
        rawBody: rawSigned(body),
        headers: { 'x-paystack-signature': sig },
        secrets: { paystack: SECRET },
      },
    );

    expect(result.outcome).toBe('created');
    if (result.outcome !== 'created') throw new Error('expected created outcome');
    expect(enqueued).toEqual([result.transactionId]);

    const transaction = await testPrisma.transaction.findUnique({
      where: { id: result.transactionId },
    });
    expect(transaction).not.toBeNull();
    expect(transaction!.merchantId).toBe(merchant.id);
    expect(transaction!.source).toBe('pos');
    expect(transaction!.providerReference).toBe(reference);
    expect(Number(transaction!.amount)).toBe(5000.0);
    expect(transaction!.rawPayload).toMatchObject({ provider: 'paystack', terminalRef: TERMINAL_REF });

    // Drive the SAME worker function the WhatsApp pipeline uses — convergence.
    const outcome = await processInvoiceSubmission(
      { id: 'pos-job', data: { transactionId: result.transactionId } } as unknown as Job<{
        transactionId: string;
      }>,
      { provider: providerOk, prisma: testPrisma },
    );
    expect(outcome.status).toBe('validated');

    const invoice = await testPrisma.invoice.findUnique({
      where: { transactionId: result.transactionId },
    });
    expect(invoice!.status).toBe('validated');
    expect(invoice!.irn).toMatch(/^NRS-/);
  });

  itIf('a provider retry of the same webhook is idempotent (duplicate)', async () => {
    const enqueued: string[] = [];
    const reference = `T${Date.now()}`;
    const body = paystackTerminalCharge(reference);
    const sig = createHmac('sha512', SECRET).update(JSON.stringify(body)).digest('hex');

    const first = await ingestPosWebhook(
      { prisma: testPrisma, enqueue: async (id) => void enqueued.push(id) },
      {
        provider: 'paystack',
        rawBody: rawSigned(body),
        headers: { 'x-paystack-signature': sig },
        secrets: { paystack: SECRET },
      },
    );
    expect(first.outcome).toBe('created');
    if (first.outcome !== 'created') throw new Error('expected created outcome');

    const second = await ingestPosWebhook(
      { prisma: testPrisma, enqueue: async (id) => void enqueued.push(id) },
      {
        provider: 'paystack',
        rawBody: rawSigned(body),
        headers: { 'x-paystack-signature': sig },
        secrets: { paystack: SECRET },
      },
    );
    expect(second.outcome).toBe('duplicate');

    const count = await testPrisma.transaction.count({
      where: { providerReference: reference },
    });
    expect(count).toBe(1);
  });

  itIf('a sale from an unregistered terminal is acknowledged but never enqueued', async () => {
    const enqueued: string[] = [];
    const reference = `T${Date.now()}`;
    const body = {
      event: 'charge.success',
      data: {
        id: 4677002299,
        reference,
        amount: 500000,
        paid_at: '2025-02-11T10:42:20.000Z',
        currency: 'NGN',
        source: { type: 'offline', source: 'virtual_terminal', identifier: 'VT_UNREGISTERED' },
      },
    };
    const sig = createHmac('sha512', SECRET).update(JSON.stringify(body)).digest('hex');

    const result = await ingestPosWebhook(
      { prisma: testPrisma, enqueue: async (id) => void enqueued.push(id) },
      {
        provider: 'paystack',
        rawBody: rawSigned(body),
        headers: { 'x-paystack-signature': sig },
        secrets: { paystack: SECRET },
      },
    );
    expect(result.outcome).toBe('no_terminal');
    expect(enqueued).toHaveLength(0);
  });

  itIf('a tampered signature is rejected before any DB access', async () => {
    const body = paystackTerminalCharge(`T${Date.now()}`);
    const result = await ingestPosWebhook(
      { prisma: testPrisma, enqueue: async () => void expect.fail('must not enqueue') },
      {
        provider: 'paystack',
        rawBody: rawSigned(body),
        headers: { 'x-paystack-signature': 'deadbeef' },
        secrets: { paystack: SECRET },
      },
    );
    expect(result).toEqual({ outcome: 'rejected', reason: 'signature' });
  });
});
