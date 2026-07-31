import {
  prisma,
  verifyPaystackSignature,
  type PreferredLanguage,
  type PosVerificationHeaders,
  type SubscriptionTier,
} from '@naija/shared';

/**
 * Paystack billing integration (sandbox path; the only paid-provider surface
 * in Phase 2).
 *
 * Two duties:
 *   1. `createStarterPaymentLink` — POST /transaction/initialize with the
 *      starter plan code so the merchant can subscribe. The merchant id is
 *      carried in `metadata.merchantId` and comes back on every subscription
 *      webhook, which is how we re-attach the billing record.
 *   2. `ingestSubscriptionWebhook` — verify the signature (reuses the same
 *      HMAC-SHA512 raw-body check as POS), then map events:
 *        subscription.create -> Subscription(incomplete) row + merchant link
 *        charge.success (has plan/subscription) -> Subscription(active) +
 *          merchant.subscriptionTier = plan tier
 *        subscription.disable  -> Subscription(disabled) + merchant tier = free
 *
 * Amounts and plan→tier mapping are refined against the sandbox once
 * credentials exist; the structure and the signature verification are real.
 */

const PAYSTACK_API = 'https://api.paystack.co';

export interface PaystackConfig {
  secretKey?: string;
  /** Paystack plan code (PLN_...) for the starter tier. */
  starterPlanCode?: string;
  /** Placeholder email Paystack requires at initialize (no email on merchants). */
  defaultEmail?: string;
}

export async function createStarterPaymentLink(
  config: PaystackConfig,
  input: { merchantId: string; language?: PreferredLanguage },
): Promise<string | null> {
  if (!config.secretKey || !config.starterPlanCode) return null;

  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: config.defaultEmail ?? `merchant-${input.merchantId}@naija-einvoice.test`,
      plan: config.starterPlanCode,
      metadata: { merchantId: input.merchantId },
    }),
  });

  if (!res.ok) {
    throw new Error(`[paystack:initialize] ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { status?: boolean; data?: { authorization_url?: string } };
  const url = body.data?.authorization_url;
  if (!body.status || !url) throw new Error(`[paystack:initialize] no authorization_url in response`);
  return url;
}

export type SubscriptionIngestOutcome =
  | { outcome: 'ignored' }
  | { outcome: 'rejected'; reason: 'signature' | 'malformed' }
  | { outcome: 'no_merchant' }
  | { outcome: 'upserted'; event: string };

export interface SubscriptionWebhookInput {
  rawBody: Buffer;
  headers?: PosVerificationHeaders;
  secret?: string;
  ip?: string;
  requireIp?: boolean;
  /** What tier the starter plan maps to (defaults to 'starter'). */
  planTier?: SubscriptionTier;
}

export async function ingestSubscriptionWebhook(
  db: typeof prisma,
  input: SubscriptionWebhookInput,
): Promise<SubscriptionIngestOutcome> {
  if (!verifyPaystackSignature(input.rawBody, header(input.headers, 'x-paystack-signature'), input.secret ?? '', input.ip, input.requireIp)) {
    return { outcome: 'rejected', reason: 'signature' };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(input.rawBody.toString('utf8')) as Record<string, unknown>;
  } catch {
    return { outcome: 'rejected', reason: 'malformed' };
  }

  switch (payload.event) {
    case 'subscription.create':
      return handleSubscriptionCreate(db, payload.data, input.planTier);
    case 'charge.success':
      return handleSubscriptionChargeSuccess(db, payload.data);
    case 'subscription.disable':
      return handleSubscriptionDisable(db, payload.data);
    default:
      return { outcome: 'ignored' };
  }
}

function header(headers: PosVerificationHeaders | undefined, name: string): string | undefined {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** metadata.merchantId is how every subscription webhook re-attaches the merchant. */
function merchantIdFromData(data: Record<string, unknown> | undefined): string | undefined {
  const metadata = asRecord(data?.metadata);
  const id = str(metadata?.merchantId);
  if (id) return id;
  const phone = str(metadata?.merchantPhone);
  return phone;
}

async function handleSubscriptionCreate(
  db: typeof prisma,
  rawData: unknown,
  planTier: SubscriptionTier | undefined,
): Promise<SubscriptionIngestOutcome> {
  const data = asRecord(rawData);
  const merchantId = merchantIdFromData(data);
  const code = str(data?.subscription_code) ?? str(data?.subscriptionCode);
  if (!merchantId) return { outcome: 'no_merchant' };

  const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) return { outcome: 'no_merchant' };

  await db.subscription.upsert({
    where: { merchantId },
    create: {
      merchantId,
      tier: planTier ?? 'starter',
      status: 'incomplete',
      paystackSubscriptionCode: code,
      paystackCustomerCode: str((asRecord(data?.customer))?.customer_code) ?? str(data?.customer_code),
      paystackPlanCode: str((asRecord(data?.plan))?.plan_code) ?? str(data?.plan_code),
    },
    update: {
      tier: planTier ?? 'starter',
      status: 'incomplete',
      paystackSubscriptionCode: code,
    },
  });

  return { outcome: 'upserted', event: 'subscription.create' };
}

async function handleSubscriptionChargeSuccess(
  db: typeof prisma,
  rawData: unknown,
): Promise<SubscriptionIngestOutcome> {
  const data = asRecord(rawData);
  const subscription = asRecord(data?.subscription);
  const plan = asRecord(data?.plan);
  // A subscription renewal is a charge.success whose data carries a plan or
  // subscription — plain one-off charges and POS sales have neither.
  if (!subscription && !plan) return { outcome: 'ignored' };

  const code = str(subscription?.subscription_code) ?? str(data?.subscription_code);
  const merchantId = merchantIdFromData(data) ?? merchantIdFromData(subscription);
  const record = code
    ? await db.subscription.findUnique({ where: { paystackSubscriptionCode: code } })
    : merchantId
      ? await db.subscription.findUnique({ where: { merchantId } })
      : null;
  if (!record) return { outcome: 'no_merchant' };

  const subscriptionData = subscription ?? data;
  // The billing period rides on the top-level `data.invoice` for renewal
  // charge.success events; accept either location to be sandbox-agnostic.
  const period = asRecord(data?.invoice) ?? asRecord(subscriptionData?.invoice);
  const nextPayment =
    str(data?.next_payment_date) ??
    str(subscriptionData?.next_payment_date) ??
    str(subscriptionData?.nextPaymentDate);

  await db.subscription.update({
    where: { id: record.id },
    data: {
      status: 'active',
      currentPeriodStart: parseDate(period?.period_start ?? subscriptionData?.current_period_start),
      currentPeriodEnd: parseDate(period?.period_end ?? subscriptionData?.current_period_end),
      nextPaymentDate: parseDate(nextPayment),
    },
  });
  await db.merchant.update({
    where: { id: record.merchantId },
    data: { subscriptionTier: record.tier },
  });

  return { outcome: 'upserted', event: 'charge.success' };
}

async function handleSubscriptionDisable(
  db: typeof prisma,
  rawData: unknown,
): Promise<SubscriptionIngestOutcome> {
  const data = asRecord(rawData);
  const code = str(data?.subscription_code) ?? str(data?.subscriptionCode);
  const merchantId = merchantIdFromData(data);
  const record = code
    ? await db.subscription.findUnique({ where: { paystackSubscriptionCode: code } })
    : merchantId
      ? await db.subscription.findUnique({ where: { merchantId } })
      : null;
  if (!record) return { outcome: 'no_merchant' };

  await db.subscription.update({
    where: { id: record.id },
    data: { status: 'disabled', nextPaymentDate: null },
  });
  await db.merchant.update({
    where: { id: record.merchantId },
    data: { subscriptionTier: 'free' },
  });

  return { outcome: 'upserted', event: 'subscription.disable' };
}

function parseDate(value: unknown): Date | undefined {
  const s = str(value);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
