import type { PosProvider } from '../domain/enums';

/**
 * Provider-agnostic POS integration.
 *
 * We do NOT have signed partnerships with Moniepoint / OPay / Paystack
 * Terminal yet, so — exactly like the NRS provider in Phase 0 — every POS
 * gateway is reached behind an interface. Each adapter knows the *publicly
 * documented* webhook envelope of its provider and reduces it to the single
 * `NormalizedPosSale` shape the invoice pipeline understands. Adding a 4th
 * provider = add one adapter; nothing downstream changes.
 *
 * The normalization step is deliberately PURE (no I/O, no secrets): webhook
 * signature verification is done upstream (verification.ts) against the raw
 * bytes, and only verified payloads ever reach an adapter.
 */

/** A sale that already happened at a POS terminal (money has moved). */
export interface NormalizedPosSale {
  /** Which gateway reported the sale. */
  provider: PosProvider;
  /** Unique id of the provider *event* (for logging/dedup observability). */
  providerEventId: string;
  /**
   * Provider's transaction reference (Paystack `reference`, Moniepoint
   * `transactionReference`, OPay `outOrderNo`). Stored on
   * Transaction.providerReference and unique, so a webhook retry can never
   * double-create a Transaction.
   */
  providerTransactionId: string;
  /** POS terminal identifier (VT code / terminal serial / device sn). */
  terminalRef: string;
  /** Naira amount as a 2dp decimal string (matches Transaction.amount). */
  amount: string;
  /** ISO-4217 currency code. Only NGN flows into NRS invoices. */
  currency: string;
  /** ISO-8601 timestamp of when the money moved at the terminal. */
  occurredAt: string;
  /** Buyer hint when the provider reports one (e.g. OPay sender name). */
  customerRef?: string;
  /** Exact provider payload, untouched, for audit/replay. */
  raw: unknown;
}

/**
 * Thrown by an adapter when the payload cannot be normalized.
 *
 * `ignored: true` means "this event is not a POS sale for us" (wrong event
 * type, non-approved status, other currency, ...). The webhook endpoint must
 * respond 200 to these so the provider stops retrying, while logging the
 * event. Anything else is a malformed payload we DID expect to understand and
 * should surface as 400.
 */
export class PosWebhookError extends Error {
  constructor(
    message: string,
    public readonly ignored = false,
  ) {
    super(message);
    this.name = 'PosWebhookError';
  }
}

export interface PosWebhookAdapter {
  /**
   * Convert a provider webhook payload into `NormalizedPosSale`.
   *
   * Must be pure: signature verification happens upstream against the raw
   * body. Adapters throw `PosWebhookError` (with `ignored` set for events we
   * legitimately do not care about) on anything they cannot normalize.
   *
   * `provider` is passed in so a single dispatcher can hand every payload to
   * the same entry point; adapters assert it matches their own provider.
   */
  normalize(rawPayload: unknown, provider: PosProvider): NormalizedPosSale;
}

/** Guard: adapter input is always an object payload. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Convert minor units (kobo) to a 2dp naira decimal string. */
export function minorToNaira(minor: number | string): string {
  const value = Number(minor);
  if (!Number.isFinite(value) || value < 0) {
    throw new PosWebhookError(`invalid minor-unit amount: ${String(minor)}`);
  }
  return (value / 100).toFixed(2);
}

/** Normalize a naira amount that arrived as a string/number to 2dp. */
export function nairaToNaira(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new PosWebhookError(`invalid naira amount: ${String(value)}`);
  }
  return n.toFixed(2);
}
