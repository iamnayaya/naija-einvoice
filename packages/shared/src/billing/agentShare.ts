import Decimal from 'decimal.js';

/**
 * Pure agent revenue-share math. Money is always naira decimal strings at the
 * boundaries; this helper returns a 2dp naira string.
 *
 * The agent's share of one merchant payment:
 *   share = paymentAmount (naira) * agent.revenueShareRate
 *
 * e.g. ₦5,000 at 5% -> "250.00". Uses decimal.js so money never passes
 * through a float.
 */

export function agentShareForPayment(nairaAmount: string, revenueShareRate: Decimal.Value): string {
  return new Decimal(nairaAmount).times(revenueShareRate).toFixed(2);
}

/** 'YYYY-MM' for a UTC date, used to group payouts into billing periods. */
export function billingPeriod(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
}
