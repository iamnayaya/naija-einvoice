import { createHmac } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@naija/shared';
import { ingestSubscriptionWebhook } from './paystack.service';

loadEnv({ path: resolve(import.meta.dirname, '../../../../.env') });

/**
 * Paystack subscription webhook lifecycle integration test.
 *
 * Drives subscription.create -> charge.success (renewal) -> subscription.disable
 * through the real handler with valid HMAC signatures, asserting the
 * Subscription row and the merchant's effective tier follow the expected
 * lifecycle. Skips with a warning when the test DB is unreachable.
 */

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://naija:naija@localhost:5432/naija_einvoice_test?schema=public';

const testPrisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });

const SECRET = 'sk_test_vitest_secret';

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

let merchantPhoneCounter = 0;
function uniqueMerchantPhone() {
  merchantPhoneCounter += 1;
  return `2349${String(Date.now()).slice(-8)}${merchantPhoneCounter}`;
}

function signed(body: unknown) {
  const raw = JSON.stringify(body);
  return {
    rawBody: Buffer.from(raw, 'utf8'),
    signature: createHmac('sha512', SECRET).update(raw).digest('hex'),
  };
}

describe('Paystack subscription webhooks (integration)', () => {
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
      await testPrisma.subscription.deleteMany({
        where: { merchant: { businessName: 'BILLING INTEGRATION TEST' } },
      });
      await testPrisma.merchant.deleteMany({ where: { businessName: 'BILLING INTEGRATION TEST' } });
    }
    await testPrisma.$disconnect();
  });

  itIf('subscription.create -> charge.success -> subscription.disable moves the merchant tier', async () => {
    const merchant = await testPrisma.merchant.create({
      data: {
        businessName: 'BILLING INTEGRATION TEST',
        phone: uniqueMerchantPhone(),
        state: 'Lagos',
        preferredLanguage: 'en',
        subscriptionTier: 'free',
      },
    });
    const code = `SUB_${Date.now()}`;
    const customerCode = `CUS_${Date.now()}`;

    const created = signed({
      event: 'subscription.create',
      data: {
        subscription_code: code,
        customer: { customer_code: customerCode },
        plan: { plan_code: 'PLN_TEST' },
        metadata: { merchantId: merchant.id },
      },
    });
    const createResult = await ingestSubscriptionWebhook(testPrisma, {
      rawBody: created.rawBody,
      headers: { 'x-paystack-signature': created.signature },
      secret: SECRET,
    });
    expect(createResult).toEqual({ outcome: 'upserted', event: 'subscription.create' });

    const createdSub = await testPrisma.subscription.findUnique({ where: { merchantId: merchant.id } });
    expect(createdSub).not.toBeNull();
    expect(createdSub!.status).toBe('incomplete');
    expect(createdSub!.paystackSubscriptionCode).toBe(code);
    expect(createdSub!.tier).toBe('starter');

    // First renewal charge arrives -> subscription activates, tier upgrades.
    const charged = signed({
      event: 'charge.success',
      data: {
        reference: `REN_${Date.now()}`,
        amount: 500000,
        subscription: { subscription_code: code },
        plan: { plan_code: 'PLN_TEST' },
        invoice: { period_start: '2026-08-01T00:00:00.000Z', period_end: '2026-08-31T23:59:59.999Z' },
        metadata: { merchantId: merchant.id },
      },
    });
    const chargeResult = await ingestSubscriptionWebhook(testPrisma, {
      rawBody: charged.rawBody,
      headers: { 'x-paystack-signature': charged.signature },
      secret: SECRET,
    });
    expect(chargeResult).toEqual({ outcome: 'upserted', event: 'charge.success' });

    const active = await testPrisma.subscription.findUnique({ where: { merchantId: merchant.id } });
    expect(active!.status).toBe('active');
    expect(active!.currentPeriodStart?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(active!.currentPeriodEnd?.toISOString()).toBe('2026-08-31T23:59:59.999Z');

    const upgraded = await testPrisma.merchant.findUnique({ where: { id: merchant.id } });
    expect(upgraded!.subscriptionTier).toBe('starter');

    // Cancellation -> subscription disabled, merchant falls back to free.
    const disabled = signed({
      event: 'subscription.disable',
      data: { subscription_code: code, metadata: { merchantId: merchant.id } },
    });
    const disableResult = await ingestSubscriptionWebhook(testPrisma, {
      rawBody: disabled.rawBody,
      headers: { 'x-paystack-signature': disabled.signature },
      secret: SECRET,
    });
    expect(disableResult).toEqual({ outcome: 'upserted', event: 'subscription.disable' });

    const cancelled = await testPrisma.subscription.findUnique({ where: { merchantId: merchant.id } });
    expect(cancelled!.status).toBe('disabled');

    const downgraded = await testPrisma.merchant.findUnique({ where: { id: merchant.id } });
    expect(downgraded!.subscriptionTier).toBe('free');
  });

  itIf('a renewal charge for an unknown subscription is acknowledged as no_merchant', async () => {
    const charged = signed({
      event: 'charge.success',
      data: {
        reference: `REN_${Date.now()}`,
        subscription: { subscription_code: 'SUB_GHOST' },
        plan: { plan_code: 'PLN_TEST' },
      },
    });
    const result = await ingestSubscriptionWebhook(testPrisma, {
      rawBody: charged.rawBody,
      headers: { 'x-paystack-signature': charged.signature },
      secret: SECRET,
    });
    expect(result.outcome).toBe('no_merchant');
  });

  itIf('a tampered subscription webhook is rejected before any DB access', async () => {
    const body = { event: 'subscription.create', data: {} };
    const result = await ingestSubscriptionWebhook(testPrisma, {
      rawBody: Buffer.from(JSON.stringify(body), 'utf8'),
      headers: { 'x-paystack-signature': 'deadbeef' },
      secret: SECRET,
    });
    expect(result).toEqual({ outcome: 'rejected', reason: 'signature' });
  });
});
