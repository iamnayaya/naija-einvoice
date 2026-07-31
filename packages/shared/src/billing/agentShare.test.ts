import { describe, expect, it } from 'vitest';
import { agentShareForPayment, billingPeriod } from './agentShare';

describe('agentShareForPayment', () => {
  it('5% of NGN 5000 is NGN 250.00', () => {
    expect(agentShareForPayment('5000.00', '0.05')).toBe('250.00');
  });

  it('5% of NGN 5000.50 is rounded to 2dp', () => {
    expect(agentShareForPayment('5000.50', '0.05')).toBe('250.03');
  });

  it('10% of NGN 1234.56 is exact (no float drift)', () => {
    expect(agentShareForPayment('1234.56', '0.1')).toBe('123.46');
  });

  it('a zero rate pays nothing', () => {
    expect(agentShareForPayment('8000.00', '0')).toBe('0.00');
  });
});

describe('billingPeriod', () => {
  it('formats a UTC date as YYYY-MM', () => {
    expect(billingPeriod(new Date('2026-08-15T12:00:00.000Z'))).toBe('2026-08');
    expect(billingPeriod(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01');
    expect(billingPeriod(new Date('2026-12-31T23:59:59.000Z'))).toBe('2026-12');
  });
});
