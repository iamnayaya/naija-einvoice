import { describe, expect, it } from 'vitest';
import {
  checkInvoiceQuota,
  FREE_TIER_MONTHLY_INVOICE_LIMIT,
  monthStart,
  monthlyLimitForTier,
} from './tiers';

describe('tier limits', () => {
  it('free tier allows 20 invoices per month', () => {
    expect(FREE_TIER_MONTHLY_INVOICE_LIMIT).toBe(20);
    expect(monthlyLimitForTier('free')).toBe(20);
  });

  it('paid tiers are unlimited', () => {
    expect(monthlyLimitForTier('starter')).toBeNull();
    expect(monthlyLimitForTier('growth')).toBeNull();
  });
});

describe('monthStart', () => {
  it('returns the first millisecond of the UTC calendar month', () => {
    expect(monthStart(new Date('2026-07-31T23:59:59.999Z'))).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(monthStart(new Date('2026-01-05T12:00:00.000Z'))).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(monthStart(new Date('2026-12-31T00:00:00.000Z'))).toEqual(new Date('2026-12-01T00:00:00.000Z'));
  });
});

describe('checkInvoiceQuota', () => {
  it('free tier: under the limit is allowed with remaining count', () => {
    const result = checkInvoiceQuota('free', 19);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('free tier: exactly the limit is blocked', () => {
    const result = checkInvoiceQuota('free', 20);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('free tier: over the limit is blocked without going negative', () => {
    const result = checkInvoiceQuota('free', 25);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('paid tiers are always allowed regardless of usage', () => {
    for (const tier of ['starter', 'growth'] as const) {
      const result = checkInvoiceQuota(tier, 1000);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBeNull();
      expect(result.remaining).toBeNull();
    }
  });
});
