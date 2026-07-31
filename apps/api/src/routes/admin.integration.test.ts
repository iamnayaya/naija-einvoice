import request from 'supertest';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@naija/shared';
import { createApp } from '../app';

loadEnv({ path: resolve(import.meta.dirname, '../../../../.env') });

/**
 * Admin payout endpoints (DB-backed). Requires the local Postgres test schema;
 * skips with a warning when the DB is unreachable.
 */

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://naija:naija@localhost:5432/naija_einvoice_test?schema=public';

const testPrisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });

const app = createApp();
const basic = `Basic ${Buffer.from('admin-test:admin-secret-test').toString('base64')}`;

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

let counter = 0;
function uniquePhone() {
  counter += 1;
  return `2349${String(Date.now()).slice(-8)}${counter}`;
}

describe('GET /admin/payouts (integration)', () => {
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
      await testPrisma.agentPayout.deleteMany({
        where: { agent: { phone: { startsWith: '2349' } } },
      });
      await testPrisma.merchant.deleteMany({
        where: { businessName: 'ADMIN INTEGRATION TEST' },
      });
      await testPrisma.agent.deleteMany({ where: { name: 'Admin Test Agent' } });
    }
    await testPrisma.$disconnect();
  });

  itIf('returns per-agent pending totals for a billing period', async () => {
    const agent = await testPrisma.agent.create({
      data: { name: 'Admin Test Agent', phone: uniquePhone(), momoAccountForPayout: '09000000000', revenueShareRate: 0.05 },
    });
    const merchant = await testPrisma.merchant.create({
      data: {
        businessName: 'ADMIN INTEGRATION TEST',
        phone: uniquePhone(),
        state: 'Lagos',
        preferredLanguage: 'en',
        onboardedByAgentId: agent.id,
      },
    });
    const sub = await testPrisma.subscription.create({
      data: { merchantId: merchant.id, tier: 'starter', status: 'active' },
    });
    await testPrisma.agentPayout.create({
      data: {
        agentId: agent.id,
        merchantId: merchant.id,
        subscriptionId: sub.id,
        providerReference: `REN_${Date.now()}`,
        amount: '250.00',
        period: '2026-08',
        status: 'pending',
      },
    });
    await testPrisma.agentPayout.create({
      data: {
        agentId: agent.id,
        merchantId: merchant.id,
        subscriptionId: sub.id,
        providerReference: `REN_${Date.now()}_2`,
        amount: '250.00',
        period: '2026-08',
        status: 'paid',
        paidAt: new Date(),
      },
    });

    const res = await request(app)
      .get('/admin/payouts/summary?period=2026-08')
      .set('Authorization', basic);
    expect(res.status).toBe(200);
    expect(res.body.period).toBe('2026-08');
    expect(res.body.agents).toHaveLength(1);
    expect(res.body.agents[0]).toMatchObject({
      agentId: agent.id,
      name: 'Admin Test Agent',
      pendingTotal: '250.00',
      payoutCount: 1,
    });

    const rows = await request(app)
      .get('/admin/payouts?period=2026-08&status=pending')
      .set('Authorization', basic);
    expect(rows.status).toBe(200);
    expect(rows.body.count).toBe(1);
    expect(rows.body.payouts[0]).toMatchObject({
      agentName: 'Admin Test Agent',
      merchantName: 'ADMIN INTEGRATION TEST',
      amount: '250.00',
    });
  });
});
