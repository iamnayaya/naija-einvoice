import { timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { prisma, billingPeriod } from '@naija/shared';
import { env } from '../config';

/**
 * Internal admin surface (Phase 2). Basic-auth protected; every request is
 * audit-logged (who accessed what) — Phase 3 NDPA hardening extends this to a
 * durable audit store.
 *
 * Env: ADMIN_USERNAME / ADMIN_PASSWORD. When either is unset the routes return
 * 503 (fail closed — never serve admin data without configured credentials).
 */

const ADMIN_USERNAME = env.ADMIN_USERNAME;
const ADMIN_PASSWORD = env.ADMIN_PASSWORD;

function configured(): boolean {
  return Boolean(ADMIN_USERNAME && ADMIN_PASSWORD);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function basicAuth(req: Request, res: Response): boolean {
  if (!configured()) {
    res.status(503).json({ error: 'admin routes not configured' });
    return false;
  }
  const header = req.headers.authorization;
  const match = /^Basic\s+(.+)$/.exec(header ?? '');
  if (!match) {
    res.status(401).json({ error: 'authentication required' });
    return false;
  }
  const [user, pass] = Buffer.from(match[1]!, 'base64').toString('utf8').split(':');
  if (!user || !pass || !safeEqual(user, ADMIN_USERNAME!) || !safeEqual(pass, ADMIN_PASSWORD!)) {
    res.status(401).json({ error: 'invalid credentials' });
    return false;
  }
  return true;
}

export const adminRouter = Router();

adminRouter.use((req, res, next) => {
  if (basicAuth(req, res)) {
    console.log(`[admin:audit] ${JSON.stringify({ who: ADMIN_USERNAME, method: req.method, path: req.originalUrl, at: new Date().toISOString() })}`);
    next();
  }
});

/**
 * GET /admin/payouts/summary?period=YYYY-MM — per-agent pending totals for the
 * month, the same figure the agent console shows the agent themselves.
 */
adminRouter.get('/admin/payouts/summary', async (req, res) => {
  const period = typeof req.query.period === 'string' ? req.query.period : billingPeriod(new Date());
  const rows = await prisma.agentPayout.groupBy({
    by: ['agentId'],
    where: { period, status: 'pending' },
    _sum: { amount: true },
    _count: { id: true },
  });
  const agents = await prisma.agent.findMany({ where: { id: { in: rows.map((r) => r.agentId) } } });
  const byAgent = new Map(agents.map((a) => [a.id, a]));
  res.json({
    period,
    agents: rows.map((row) => {
      const agent = byAgent.get(row.agentId);
      return {
        agentId: row.agentId,
        name: agent?.name,
        phone: agent?.phone,
        momoAccountForPayout: agent?.momoAccountForPayout,
        pendingTotal: row._sum.amount?.toFixed(2) ?? '0.00',
        payoutCount: row._count.id,
      };
    }),
  });
});

/**
 * GET /admin/payouts?period=YYYY-MM&status=pending — individual payout rows.
 */
adminRouter.get('/admin/payouts', async (req, res) => {
  const period = typeof req.query.period === 'string' ? req.query.period : billingPeriod(new Date());
  const status = req.query.status === 'paid' || req.query.status === 'pending' ? req.query.status : 'pending';
  const rows = await prisma.agentPayout.findMany({
    where: { period, status },
    orderBy: { createdAt: 'desc' },
    include: {
      agent: { select: { name: true, phone: true } },
      merchant: { select: { businessName: true, phone: true } },
    },
  });
  res.json({
    period,
    status,
    count: rows.length,
    payouts: rows.map((row) => ({
      id: row.id,
      agentName: row.agent.name,
      merchantName: row.merchant.businessName,
      amount: row.amount.toFixed(2),
      period: row.period,
      createdAt: row.createdAt,
      paidAt: row.paidAt,
    })),
  });
});
