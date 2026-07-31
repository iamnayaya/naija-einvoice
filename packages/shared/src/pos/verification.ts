import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PosProvider } from '../domain/enums';

/**
 * Webhook signature verification for the three POS providers.
 *
 * SECURITY CONTRACT (this is the whole point of the module):
 *  1. Always verify against the RAW request bytes (`rawBody`), never against a
 *     re-serialized JSON object — Express's JSON parser normalizes whitespace
 *     and key order, which would break the HMAC on legitimate events and tempt
 *     someone to "loosen" verification to fix it.
 *  2. Constant-time comparison (`timingSafeEqual`) — never `===`.
 *  3. Fail closed: a missing secret, missing header, or length mismatch all
 *     return false. The endpoint rejects with 401.
 *  4. Everything runs before any payload data is trusted or logged.
 *
 * Per-provider schemes (from public docs):
 *  - Paystack : HMAC-SHA512 (hex) of the raw body, signed with the merchant
 *               SECRET KEY, delivered in `x-paystack-signature`.
 *  - Moniepoint: Base64 HMAC-SHA256 over the string
 *               `<moniepoint-webhook-id>__<moniepoint-webhook-timestamp>__<body>`
 *               signed with the per-subscription webhook secret, delivered in
 *               `moniepoint-webhook-signature`.
 *  - OPay     : STUBBED (no live credentials yet). Public docs sign the
 *               payload with an HMAC-SHA512 (base64) using the merchant's
 *               private key, carried in the `sign` field of the body. We model
 *               the sign as covering the JSON body WITHOUT the `sign` field
 *               (remove it, then HMAC over JSON.stringify) — refine once
 *               sandbox access confirms the exact coverage string.
 */

export interface PosVerificationHeaders {
  [name: string]: string | string[] | undefined;
}

function header(headers: PosVerificationHeaders, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function safeEqual(expected: Buffer, provided: Buffer): boolean {
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/**
 * Verify a Paystack webhook signature (REAL — this is the production path).
 *
 * The signature is the lowercase hex HMAC-SHA512 of the exact raw body bytes
 * signed with the Paystack secret key. We recompute and constant-time compare.
 * Optionally also reject unless the caller is one of Paystack's published
 * webhook IPs (52.31.139.75, 52.49.173.169, 52.214.14.220) when `requireIp` is
 * set.
 */
export function verifyPaystackSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
  ip?: string,
  requireIp = false,
): boolean {
  if (!secret || !signature) return false;
  if (requireIp) {
    const PAYSTACK_IPS = new Set(['52.31.139.75', '52.49.173.169', '52.214.14.220']);
    if (!ip || !PAYSTACK_IPS.has(ip)) return false;
  }
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  return safeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

/**
 * Verify a Moniepoint webhook signature (STUBBED provider — schema per public
 * docs). Recompute the Base64 HMAC-SHA256 over `id__timestamp__body`.
 */
export function verifyMoniepointSignature(
  rawBody: Buffer,
  headers: PosVerificationHeaders,
  secret: string,
): boolean {
  if (!secret) return false;
  const id = header(headers, 'moniepoint-webhook-id');
  const timestamp = header(headers, 'moniepoint-webhook-timestamp');
  const signature = header(headers, 'moniepoint-webhook-signature');
  if (!id || !timestamp || !signature) return false;

  const payload = `${id}__${timestamp}__${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64');
  return safeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * Verify an OPay webhook signature (STUBBED provider). Model: the `sign` field
 * inside the payload is the Base64 HMAC-SHA512 of the JSON body WITHOUT the
 * `sign` field itself, signed with the webhook secret. The exact coverage
 * string must be confirmed against the OPay sandbox.
 */
export function verifyOpaySignature(rawBody: Buffer, secret: string): boolean {
  if (!secret) return false;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
  } catch {
    return false;
  }
  const sign = parsed.sign;
  if (typeof sign !== 'string' || !sign) return false;
  delete parsed.sign;
  const expected = createHmac('sha512', secret).update(JSON.stringify(parsed)).digest('base64');
  return safeEqual(Buffer.from(expected), Buffer.from(sign));
}

export interface VerifyPosSignatureInput {
  provider: PosProvider;
  rawBody: Buffer;
  headers?: PosVerificationHeaders;
  /** Provider-specific webhook secret. Missing secret => verification fails. */
  secret?: string;
  /** Caller IP, used only for the optional Paystack IP allowlist. */
  ip?: string;
  /** Enforce Paystack's published webhook IP allowlist (opt-in via env). */
  requireIp?: boolean;
}

/** Dispatch to the correct per-provider verifier. Returns false => reject. */
export function verifyPosWebhookSignature(input: VerifyPosSignatureInput): boolean {
  switch (input.provider) {
    case 'paystack':
      return verifyPaystackSignature(
        input.rawBody,
        header(input.headers ?? {}, 'x-paystack-signature'),
        input.secret ?? '',
        input.ip,
        input.requireIp,
      );
    case 'moniepoint':
      return verifyMoniepointSignature(input.rawBody, input.headers ?? {}, input.secret ?? '');
    case 'opay':
      return verifyOpaySignature(input.rawBody, input.secret ?? '');
  }
}
