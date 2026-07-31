import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import type { Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@naija/shared';
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

async function createMerchantAndTransaction() {
  const merchant = await testPrisma.merchant.create({
    data: {
      businessName: 'INTEGRATION TEST',
      phone: `2349${Date.now()}`.slice(0, 13),
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

  it('generateInvoiceNumber is stable and prefixed', () => {
    expect(generateInvoiceNumber('abc123')).toBe(`INV-${new Date().getFullYear()}-ABC123`);
  });
});
