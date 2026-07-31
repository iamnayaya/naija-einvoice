import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

loadEnv({ path: resolve(import.meta.dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://naija:naija@localhost:5432/naija_einvoice?schema=public'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  NRS_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  MOCK_NRS_FAIL_RATE: z.coerce.number().min(0).max(1).default(0.05),
  MOCK_NRS_DELAY_MS_MIN: z.coerce.number().int().nonnegative().default(2000),
  MOCK_NRS_DELAY_MS_MAX: z.coerce.number().int().nonnegative().default(4000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
