import type { SubscriptionTier } from '../domain/enums';

/**
 * Pure tier / quota logic — no I/O.
 *
 * Free merchants may register 20 invoices per calendar month (UTC). Paid tiers
 * are unlimited. The limit is evaluated at the single choke point of the
 * invoice pipeline (worker), so POS and WhatsApp sales are both covered.
 */

export const FREE_TIER_MONTHLY_INVOICE_LIMIT = 20;

/** Maximum invoices allowed in the current month for a tier; null = unlimited. */
export function monthlyLimitForTier(tier: SubscriptionTier): number | null {
  return tier === 'free' ? FREE_TIER_MONTHLY_INVOICE_LIMIT : null;
}

/** First millisecond of the UTC calendar month containing `now`. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface QuotaCheck {
  tier: SubscriptionTier;
  /** How many invoices the merchant has already issued this month (0..limit+). */
  used: number;
  /** Maximum for the tier, or null when unlimited. */
  limit: number | null;
  /** Remaining this month, or null when the tier is unlimited. */
  remaining: number | null;
  allowed: boolean;
}

export function checkInvoiceQuota(tier: SubscriptionTier, usedThisMonth: number): QuotaCheck {
  const limit = monthlyLimitForTier(tier);
  if (limit === null) {
    return { tier, used: usedThisMonth, limit: null, remaining: null, allowed: true };
  }
  return {
    tier,
    used: usedThisMonth,
    limit,
    remaining: Math.max(0, limit - usedThisMonth),
    allowed: usedThisMonth < limit,
  };
}
