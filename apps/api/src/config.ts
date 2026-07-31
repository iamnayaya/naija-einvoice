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
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
