import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// Root .env lives at the monorepo root (../../.env from apps/api/src).
loadEnv({ path: resolve(import.meta.dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://naija:naija@localhost:5432/naija_einvoice?schema=public'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  WHATSAPP_VERIFY_TOKEN: z.string().default('change-me-local-verify-token'),
  ANTHROPIC_API_KEY: z.string().optional(),
  TIER2_MODEL: z.string().optional(),
  // Paystack secret key (test: sk_test_..., live: sk_live_...). Verifies
  // Paystack webhook signatures (HMAC-SHA512). Unset => verification fails
  // closed and POS webhooks are rejected. This is the same secret used for
  // subscriptions in Phase 2.
  PAYSTACK_SECRET_KEY: z.string().optional(),
  // Webhook secrets for the (stubbed) Moniepoint / OPay POS integrations.
  POS_MONIEPOINT_SECRET: z.string().optional(),
  POS_OPAY_SECRET: z.string().optional(),
  // When true, Paystack webhooks are also rejected unless they come from one
  // of Paystack's published webhook IPs (defence in depth).
  PAYSTACK_REQUIRE_KNOWN_IP: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  // Paystack plan code (PLN_...) backing the starter tier. Needed to build the
  // upgrade payment link; unset => the WhatsApp "upgrade" reply says upgrades
  // are unavailable.
  PAYSTACK_STARTER_PLAN_CODE: z.string().optional(),
  // Paystack requires an email at transaction/initialize; merchants onboarded
  // via WhatsApp have none, so fall back to this address.
  PAYSTACK_DEFAULT_EMAIL: z.string().optional(),
  // Internal admin surface (Phase 2): basic-auth credentials. When either is
  // unset the /admin routes fail closed with 503.
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
