/**
 * Phase 0 amount parsing — a deliberately naive heuristic for WhatsApp text
 * messages like "₦5000", "5000", "5000.50" or "N5000".
 *
 * This is a stub for local testing only. It does NOT attempt to be robust
 * against natural language. Phase 1 will replace free-text parsing with a
 * structured WhatsApp flow (e.g. a button/interactive message that captures
 * amount + customer reference) so parsing ambiguity disappears.
 */

const NGN_AMOUNT_RE = /(?:₦|ngn|naira|n)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/i;

export function parseAmountFromText(text: string): string | null {
  const match = text.trim().match(NGN_AMOUNT_RE);
  if (!match || match.index !== 0) return null;
  const whole = (match[1] ?? '').replace(/,/g, '');
  const frac = match[2] ?? '';
  const value = Number(`${whole}.${frac}`);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value.toFixed(2);
}
