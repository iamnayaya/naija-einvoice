import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import type { Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FREE_TIER_MONTHLY_INVOICE_LIMIT, PrismaClient } from '@naija/shared';
import { MockNRSProvider } from '../providers/mockNrsProvider';
import { generateInvoiceNumber, processInvoiceSubmission } from './invoiceSubmission';

loadEnv({ path: resolve(import.meta.dirname, '../../../../.env') });

/**
 * Full-pipeline integration test:
 *   transaction created -> invoice drafted -> submitted to MockNRSProvider
 *   -> status updated to validated (or failed, then retried).
 *
 * Requires the local Postgres + the `naija_einvoice_test` schema (see
 * docker-compose + `pnpm test:db:push`). If the DB is unreachable the suite
 * reports a warning and skips rather than failing the whole run.
 */

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://naija:naija@localhost:5432/naija_einvoice_test?schema=public';

const testPrisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });

let dbAvailable = true;

const providerOk = new MockNRSProvider({
  failRate: 0,
  minDelayMs: 1,
  maxDelayMs: 5,
  rng: () => 0.99,
});
const providerFail = new MockNRSProvider({
  failRate: 1,
  minDelayMs: 1,
  maxDelayMs: 5,
  rng: () => 0,
});

function jobFor(transactionId: string) {
  return { id: 'test-job', data: { transactionId } } as unknown as Job<{ transactionId: string }>;
}

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

async function createMerchantAndTransaction() {
  const merchant = await testPrisma.merchant.create({
    data: {
      businessName: 'INTEGRATION TEST',
      phone: uniqueMerchantPhone(),
      state: 'Lagos',
      preferredLanguage: 'en',
    },
  });
  const transaction = await testPrisma.transaction.create({
    data: {
      merchantId: merchant.id,
      amount: '5000.50',
      source: 'whatsapp',
      rawPayload: { test: true },
    },
  });
  return { merchant, transaction };
}

describe('invoice pipeline (integration)', () => {
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
        where: { merchant: { businessName: 'INTEGRATION TEST' } },
      });
      await testPrisma.merchant.deleteMany({ where: { businessName: 'INTEGRATION TEST' } });
    }
    await testPrisma.$disconnect();
  });

  itIf('runs transaction -> draft -> submit -> validated', async () => {
    const { transaction } = await createMerchantAndTransaction();

    const result = await processInvoiceSubmission(jobFor(transaction.id), {
      provider: providerOk,
      prisma: testPrisma,
    });
    expect(result.status).toBe('validated');

    const invoice = await testPrisma.invoice.findUnique({
      where: { transactionId: transaction.id },
    });
    expect(invoice).not.toBeNull();
    expect(invoice!.status).toBe('validated');
    expect(invoice!.irn).toMatch(/^NRS-/);
    expect(invoice!.csid).toBeTruthy();
    expect(invoice!.qrCodeUrl).toBeTruthy();
    expect(invoice!.invoiceNumber).toMatch(/^INV-/);
    expect(invoice!.submittedAt).toBeInstanceOf(Date);
    expect(invoice!.validatedAt).toBeInstanceOf(Date);
  });

  itIf('marks invoice failed on provider failure, then a retry validates reusing the invoice number', async () => {
    const { transaction } = await createMerchantAndTransaction();

    await expect(
      processInvoiceSubmission(jobFor(transaction.id), { provider: providerFail, prisma: testPrisma }),
    ).rejects.toThrow(/NRS submission failed/);

    const failed = await testPrisma.invoice.findUnique({
      where: { transactionId: transaction.id },
    });
    expect(failed!.status).toBe('failed');
    expect(failed!.submissionError).toMatch(/MOCK_NRS/);

    const retry = await processInvoiceSubmission(jobFor(transaction.id), {
      provider: providerOk,
      prisma: testPrisma,
    });
    expect(retry.status).toBe('validated');

    const after = await testPrisma.invoice.findUnique({
      where: { transactionId: transaction.id },
    });
    expect(after!.status).toBe('validated');
    expect(after!.invoiceNumber).toBe(failed!.invoiceNumber);
  });

  itIf('does not re-submit an already validated invoice', async () => {
    const { transaction } = await createMerchantAndTransaction();

    const first = await processInvoiceSubmission(jobFor(transaction.id), {
      provider: providerOk,
      prisma: testPrisma,
    });
    expect(first.status).toBe('validated');

    // A failing provider would mark the invoice failed — but the idempotency
    // guard must short-circuit before the provider is ever called.
    const second = await processInvoiceSubmission(jobFor(transaction.id), {
      provider: providerFail,
      prisma: testPrisma,
    });
    expect(second.status).toBe('validated');
  });

  itIf('free tier: blocks the submission at the monthly cap without calling the provider', async () => {
    const merchant = await testPrisma.merchant.create({
      data: {
        businessName: 'INTEGRATION TEST',
        phone: uniqueMerchantPhone(),
        state: 'Lagos',
        preferredLanguage: 'en',
        subscriptionTier: 'free',
      },
    });

    // Fill the month: FREE_TIER_MONTHLY_INVOICE_LIMIT invoices already issued.
    for (let i = 0; i < FREE_TIER_MONTHLY_INVOICE_LIMIT; i += 1) {
      const tx = await testPrisma.transaction.create({
        data: { merchantId: merchant.id, amount: '100.00', source: 'whatsapp', rawPayload: { fill: true } },
      });
      await testPrisma.invoice.create({
        data: { transactionId: tx.id, invoiceNumber: `INV-FILL-${merchant.id.slice(0, 8)}-${i}`, status: 'validated' },
      });
    }

    const nextTx = await testPrisma.transaction.create({
      data: { merchantId: merchant.id, amount: '5000.00', source: 'whatsapp', rawPayload: { cap: true } },
    });

    let providerCalled = false;
    const spyProvider = {
      submit: async () => {
        providerCalled = true;
        return { ok: true, irn: 'NRS-SPY', csid: 'CSID', qrCodeUrl: 'https://mock-nrs.test/qr' };
      },
    };

    const result = await processInvoiceSubmission(jobFor(nextTx.id), {
      provider: spyProvider,
      prisma: testPrisma,
    });

    expect(providerCalled).toBe(false);
    expect(result.status).toBe('blocked_by_quota');
    expect(result.quota).toMatchObject({
      tier: 'free',
      used: FREE_TIER_MONTHLY_INVOICE_LIMIT,
      limit: FREE_TIER_MONTHLY_INVOICE_LIMIT,
      allowed: false,
    });

    const invoice = await testPrisma.invoice.findUnique({ where: { transactionId: nextTx.id } });
    expect(invoice!.status).toBe('blocked_by_quota');

    await testPrisma.invoice.deleteMany({ where: { transaction: { merchantId: merchant.id } } });
    await testPrisma.transaction.deleteMany({ where: { merchantId: merchant.id } });
    await testPrisma.merchant.deleteMany({ where: { id: merchant.id } });
  });

  itIf('paid tier: a starter merchant has no monthly cap', async () => {
    const merchant = await testPrisma.merchant.create({
      data: {
        businessName: 'INTEGRATION TEST',
        phone: uniqueMerchantPhone(),
        state: 'Lagos',
        preferredLanguage: 'en',
        subscriptionTier: 'starter',
      },
    });

    // Past the free limit, a starter merchant still validates.
    for (let i = 0; i < FREE_TIER_MONTHLY_INVOICE_LIMIT + 1; i += 1) {
      const tx = await testPrisma.transaction.create({
        data: { merchantId: merchant.id, amount: '100.00', source: 'whatsapp', rawPayload: { fill: true } },
      });
      await testPrisma.invoice.create({
        data: { transactionId: tx.id, invoiceNumber: `INV-FILL-${merchant.id.slice(0, 8)}-${i}`, status: 'validated' },
      });
    }

    const nextTx = await testPrisma.transaction.create({
      data: { merchantId: merchant.id, amount: '5000.00', source: 'whatsapp', rawPayload: { starter: true } },
    });

    const result = await processInvoiceSubmission(jobFor(nextTx.id), {
      provider: providerOk,
      prisma: testPrisma,
    });
    expect(result.status).toBe('validated');

    await testPrisma.invoice.deleteMany({ where: { transaction: { merchantId: merchant.id } } });
    await testPrisma.transaction.deleteMany({ where: { merchantId: merchant.id } });
    await testPrisma.merchant.deleteMany({ where: { id: merchant.id } });
  });

  it('generateInvoiceNumber is stable, prefixed and unique per transaction', () => {
    const a = generateInvoiceNumber('abc123');
    const b = generateInvoiceNumber('abc123');
    const c = generateInvoiceNumber('def456');
    expect(a).toBe(b);
    expect(a).toMatch(new RegExp(`^INV-${new Date().getFullYear()}-[0-9A-F]{8}$`));
    expect(c).not.toBe(a);
  });
});
